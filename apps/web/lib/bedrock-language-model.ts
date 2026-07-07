import "server-only";

import type {
  LanguageModelV4,
  LanguageModelV4CallOptions,
  LanguageModelV4FinishReason,
  LanguageModelV4GenerateResult,
  LanguageModelV4Prompt,
  LanguageModelV4StreamPart,
  LanguageModelV4StreamResult,
  SharedV4Warning
} from "@ai-sdk/provider";

import { getBedrockRuntimeConfig } from "./bedrock";
import { bedrockSupportsSamplingParams, buildConverseJsonOutputConfig } from "./bedrock-structured-output";
import { decodeBedrockEventStream } from "./bedrock-event-stream";

type ConverseMessage = {
  role: "user" | "assistant";
  content: Array<{ text: string }>;
};

type ConverseInput = {
  system?: Array<{ text: string }>;
  messages: ConverseMessage[];
  inferenceConfig?: {
    maxTokens?: number;
    temperature?: number;
    topP?: number;
    stopSequences?: string[];
  };
  outputConfig?: {
    textFormat?: {
      type: "json_schema";
      structure: {
        jsonSchema: {
          schema: string;
          name: string;
          description?: string;
        };
      };
    };
  };
};

function bedrockRuntimeUrl(modelId: string, suffix: "converse" | "converse-stream") {
  const { region } = getBedrockRuntimeConfig();
  return `https://bedrock-runtime.${region}.amazonaws.com/model/${encodeURIComponent(modelId)}/${suffix}`;
}

async function bedrockFetch(modelId: string, suffix: "converse" | "converse-stream", body: ConverseInput) {
  const { token } = getBedrockRuntimeConfig();
  const response = await fetch(bedrockRuntimeUrl(modelId, suffix), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: suffix === "converse-stream" ? "application/vnd.amazon.eventstream" : "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Bedrock ${suffix} error ${response.status}: ${errText}`);
  }

  return response;
}

function extractTextParts(content: ReadonlyArray<{ type: string; text?: string }>): string {
  return content
    .filter((part): part is { type: "text"; text: string } => part.type === "text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("");
}

function buildUsage(inputTokens?: number, outputTokens?: number, totalTokens?: number) {
  return {
    inputTokens: {
      total: inputTokens,
      noCache: inputTokens,
      cacheRead: undefined,
      cacheWrite: undefined
    },
    outputTokens: {
      total: outputTokens,
      text: outputTokens,
      reasoning: undefined
    },
    totalTokens
  };
}

function convertPromptToConverse(prompt: LanguageModelV4Prompt): ConverseInput {
  const system: Array<{ text: string }> = [];
  const messages: ConverseMessage[] = [];

  for (const message of prompt) {
    if (message.role === "system") {
      if (message.content.trim()) {
        system.push({ text: message.content });
      }
      continue;
    }

    if (message.role === "tool") {
      throw new Error("Tool messages are not supported by the Bedrock chat model.");
    }

    const text = extractTextParts(message.content);
    if (message.role === "user" || text.length > 0) {
      messages.push({
        role: message.role,
        content: [{ text }]
      });
    }
  }

  if (messages.length === 0) {
    throw new Error("Bedrock chat requires at least one user or assistant message.");
  }

  return {
    ...(system.length > 0 ? { system } : {}),
    messages
  };
}

function buildInferenceConfig(modelId: string, options: LanguageModelV4CallOptions) {
  const inferenceConfig: ConverseInput["inferenceConfig"] = {};
  if (options.maxOutputTokens != null) inferenceConfig.maxTokens = options.maxOutputTokens;
  if (bedrockSupportsSamplingParams(modelId)) {
    if (options.temperature != null) inferenceConfig.temperature = options.temperature;
    if (options.topP != null) inferenceConfig.topP = options.topP;
  }
  if (options.stopSequences != null) inferenceConfig.stopSequences = options.stopSequences;
  return Object.keys(inferenceConfig).length > 0 ? inferenceConfig : undefined;
}

function buildConverseBody(modelId: string, options: LanguageModelV4CallOptions): ConverseInput {
  const inferenceConfig = buildInferenceConfig(modelId, options);
  const structuredOutput =
    options.responseFormat?.type === "json" && options.responseFormat.schema
      ? buildConverseJsonOutputConfig(options.responseFormat.schema as Record<string, unknown>, {
          name: options.responseFormat.name,
          description: options.responseFormat.description
        })
      : null;

  return {
    ...convertPromptToConverse(options.prompt),
    ...(inferenceConfig ? { inferenceConfig } : {}),
    ...(structuredOutput ?? {})
  };
}

function unsupportedWarnings(options: LanguageModelV4CallOptions): SharedV4Warning[] {
  const warnings: SharedV4Warning[] = [];
  const unsupportedFeatures = ["tools", "toolChoice", "seed", "frequencyPenalty", "presencePenalty"] as const;
  for (const feature of unsupportedFeatures) {
    if (options[feature] != null) {
      warnings.push({ type: "unsupported", feature });
    }
  }
  if (options.responseFormat?.type === "json" && !options.responseFormat.schema) {
    warnings.push({ type: "unsupported", feature: "responseFormat" });
  }
  return warnings;
}

function parseStreamPayload(data: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(data) as unknown;
    return typeof parsed === "object" && parsed != null ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function mapFinishReason(stopReason: string | undefined): LanguageModelV4FinishReason {
  switch (stopReason) {
    case "end_turn":
    case "stop_sequence":
      return { unified: "stop", raw: stopReason };
    case "max_tokens":
      return { unified: "length", raw: stopReason };
    case "tool_use":
      return { unified: "tool-calls", raw: stopReason };
    case "content_filtered":
    case "guardrail_intervened":
      return { unified: "content-filter", raw: stopReason };
    default:
      return { unified: "other", raw: stopReason };
  }
}

function createBedrockStream(
  body: ConverseInput,
  modelId: string,
  warnings: SharedV4Warning[]
): ReadableStream<LanguageModelV4StreamPart> {
  return new ReadableStream<LanguageModelV4StreamPart>({
    async start(controller) {
      controller.enqueue({ type: "stream-start", warnings });

      try {
        const response = await bedrockFetch(modelId, "converse-stream", body);
        controller.enqueue({
          type: "response-metadata",
          id: response.headers.get("x-amzn-requestid") ?? undefined,
          timestamp: response.headers.get("date") ? new Date(response.headers.get("date")!) : new Date(),
          modelId
        });

        if (!response.body) {
          throw new Error("Bedrock converse-stream returned an empty body.");
        }

        let finishReason: LanguageModelV4FinishReason = { unified: "other", raw: undefined };
        let inputTokens: number | undefined;
        let outputTokens: number | undefined;
        let totalTokens: number | undefined;
        const openTextBlocks = new Set<number>();

        const reader = decodeBedrockEventStream(response.body, async (event) => {
          if (event.messageType !== "event") return;

          const payload = parseStreamPayload(event.data);
          if (!payload) return;

          if (event.eventType === "messageStop") {
            finishReason = mapFinishReason(payload.stopReason as string | undefined);
            return;
          }

          if (event.eventType === "metadata") {
            const usage = payload.usage as
              | { inputTokens?: number; outputTokens?: number; totalTokens?: number }
              | undefined;
            if (usage) {
              inputTokens = usage.inputTokens;
              outputTokens = usage.outputTokens;
              totalTokens = usage.totalTokens;
            }
            return;
          }

          if (event.eventType === "contentBlockStart") {
            const blockIndex = (payload.contentBlockIndex as number | undefined) ?? 0;
            openTextBlocks.add(blockIndex);
            controller.enqueue({ type: "text-start", id: String(blockIndex) });
            return;
          }

          if (event.eventType === "contentBlockDelta") {
            const blockIndex = (payload.contentBlockIndex as number | undefined) ?? 0;
            const text = (payload.delta as { text?: string } | undefined)?.text;
            if (!text) return;

            if (!openTextBlocks.has(blockIndex)) {
              openTextBlocks.add(blockIndex);
              controller.enqueue({ type: "text-start", id: String(blockIndex) });
            }

            controller.enqueue({
              type: "text-delta",
              id: String(blockIndex),
              delta: text
            });
            return;
          }

          if (event.eventType === "contentBlockStop") {
            const blockIndex = (payload.contentBlockIndex as number | undefined) ?? 0;
            if (openTextBlocks.has(blockIndex)) {
              openTextBlocks.delete(blockIndex);
              controller.enqueue({ type: "text-end", id: String(blockIndex) });
            }
          }
        }).getReader();

        while (true) {
          const { done } = await reader.read();
          if (done) break;
        }

        controller.enqueue({
          type: "finish",
          finishReason,
          usage: buildUsage(inputTokens, outputTokens, totalTokens)
        });
        controller.close();
      } catch (error) {
        controller.enqueue({ type: "error", error });
        controller.close();
      }
    }
  });
}

function createBedrockLanguageModel(modelId: string): LanguageModelV4 {
  return {
    specificationVersion: "v4",
    provider: "bedrock",
    modelId,
    supportedUrls: {},

    async doGenerate(options: LanguageModelV4CallOptions): Promise<LanguageModelV4GenerateResult> {
      const warnings = unsupportedWarnings(options);
      const body = buildConverseBody(modelId, options);
      const response = await bedrockFetch(modelId, "converse", body);
      const data = (await response.json()) as {
        output?: {
          message?: {
            content?: Array<{ text?: string }>;
          };
        };
        stopReason?: string;
        usage?: {
          inputTokens?: number;
          outputTokens?: number;
          totalTokens?: number;
        };
      };

      const text = (data.output?.message?.content ?? [])
        .map((part) => part.text ?? "")
        .join("");

      return {
        content: [{ type: "text", text }],
        finishReason: mapFinishReason(data.stopReason),
        usage: buildUsage(data.usage?.inputTokens, data.usage?.outputTokens, data.usage?.totalTokens),
        warnings,
        request: { body },
        response: {
          timestamp: new Date(),
          modelId,
          headers: Object.fromEntries(response.headers.entries())
        }
      };
    },

    async doStream(options: LanguageModelV4CallOptions): Promise<LanguageModelV4StreamResult> {
      const warnings = unsupportedWarnings(options);
      const body = buildConverseBody(modelId, options);

      return {
        stream: createBedrockStream(body, modelId, warnings),
        request: { body }
      };
    }
  };
}

export function getBedrockModel(): LanguageModelV4 {
  const { modelId } = getBedrockRuntimeConfig();
  return createBedrockLanguageModel(modelId);
}
