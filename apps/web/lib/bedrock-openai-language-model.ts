import "server-only";

import type {
  LanguageModelV4,
  LanguageModelV4CallOptions,
  LanguageModelV4FinishReason,
  LanguageModelV4GenerateResult,
  LanguageModelV4Prompt,
  LanguageModelV4StreamPart,
  LanguageModelV4StreamResult,
  SharedV4Warning,
} from "@ai-sdk/provider";

import { getBedrockOpenAiConfig, bedrockOpenAiSupportsSamplingParams } from "./bedrock-openai";

type OpenAiChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type OpenAiChatCompletionChunk = {
  choices?: Array<{
    delta?: { content?: string };
    finish_reason?: string | null;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
};

type OpenAiChatCompletionResponse = {
  choices?: Array<{
    message?: { content?: string };
    finish_reason?: string | null;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
};

function extractTextParts(content: ReadonlyArray<{ type: string; text?: string }>): string {
  return content
    .filter((part): part is { type: "text"; text: string } => part.type === "text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("");
}

function convertPromptToOpenAiMessages(prompt: LanguageModelV4Prompt): OpenAiChatMessage[] {
  const messages: OpenAiChatMessage[] = [];

  for (const message of prompt) {
    if (message.role === "system") {
      if (message.content.trim()) {
        messages.push({ role: "system", content: message.content });
      }
      continue;
    }

    if (message.role === "tool") {
      throw new Error("Tool messages are not supported by the Bedrock OpenAI chat model.");
    }

    const text = extractTextParts(message.content);
    if (message.role === "user" || text.length > 0) {
      messages.push({ role: message.role, content: text });
    }
  }

  if (messages.length === 0) {
    throw new Error("Bedrock OpenAI chat requires at least one message.");
  }

  return messages;
}

function buildUsage(
  inputTokens?: number,
  outputTokens?: number,
  totalTokens?: number
) {
  return {
    inputTokens: {
      total: inputTokens,
      noCache: inputTokens,
      cacheRead: undefined,
      cacheWrite: undefined,
    },
    outputTokens: {
      total: outputTokens,
      text: outputTokens,
      reasoning: undefined,
    },
    totalTokens,
  };
}

function mapFinishReason(finishReason: string | null | undefined): LanguageModelV4FinishReason {
  switch (finishReason) {
    case "stop":
      return { unified: "stop", raw: finishReason };
    case "length":
    case "max_tokens":
      return { unified: "length", raw: finishReason };
    case "tool_calls":
    case "function_call":
      return { unified: "tool-calls", raw: finishReason };
    case "content_filter":
      return { unified: "content-filter", raw: finishReason };
    default:
      return { unified: finishReason ? "other" : "stop", raw: finishReason ?? undefined };
  }
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

function buildChatCompletionBody(modelId: string, options: LanguageModelV4CallOptions, stream: boolean) {
  const body: Record<string, unknown> = {
    model: modelId,
    messages: convertPromptToOpenAiMessages(options.prompt),
    stream,
  };

  if (options.maxOutputTokens != null) body.max_tokens = options.maxOutputTokens;
  if (bedrockOpenAiSupportsSamplingParams(modelId)) {
    if (options.temperature != null) body.temperature = options.temperature;
    if (options.topP != null) body.top_p = options.topP;
  }
  if (options.stopSequences != null) body.stop = options.stopSequences;

  return body;
}

async function openAiChatFetch(
  body: Record<string, unknown>,
  stream: boolean
): Promise<Response> {
  const { token, baseUrl } = getBedrockOpenAiConfig();
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: stream ? "text/event-stream" : "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Bedrock OpenAI chat error ${response.status}: ${errText}`);
  }

  return response;
}

function createOpenAiChatStream(
  body: Record<string, unknown>,
  modelId: string,
  warnings: SharedV4Warning[]
): ReadableStream<LanguageModelV4StreamPart> {
  return new ReadableStream<LanguageModelV4StreamPart>({
    async start(controller) {
      controller.enqueue({ type: "stream-start", warnings });

      try {
        const response = await openAiChatFetch(body, true);
        controller.enqueue({
          type: "response-metadata",
          id: response.headers.get("x-request-id") ?? undefined,
          timestamp: new Date(),
          modelId,
        });

        if (!response.body) {
          throw new Error("Bedrock OpenAI chat stream returned an empty body.");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let textStarted = false;
        let finishReason: LanguageModelV4FinishReason = { unified: "stop", raw: "stop" };
        let inputTokens: number | undefined;
        let outputTokens: number | undefined;
        let totalTokens: number | undefined;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;

            const payload = trimmed.slice(5).trim();
            if (!payload || payload === "[DONE]") continue;

            let chunk: OpenAiChatCompletionChunk;
            try {
              chunk = JSON.parse(payload) as OpenAiChatCompletionChunk;
            } catch {
              continue;
            }

            const choice = chunk.choices?.[0];
            const delta = choice?.delta?.content;
            if (delta) {
              if (!textStarted) {
                textStarted = true;
                controller.enqueue({ type: "text-start", id: "0" });
              }
              controller.enqueue({ type: "text-delta", id: "0", delta });
            }

            if (choice?.finish_reason) {
              finishReason = mapFinishReason(choice.finish_reason);
            }

            if (chunk.usage) {
              inputTokens = chunk.usage.prompt_tokens;
              outputTokens = chunk.usage.completion_tokens;
              totalTokens = chunk.usage.total_tokens;
            }
          }
        }

        if (textStarted) {
          controller.enqueue({ type: "text-end", id: "0" });
        }

        controller.enqueue({
          type: "finish",
          finishReason,
          usage: buildUsage(inputTokens, outputTokens, totalTokens),
        });
        controller.close();
      } catch (error) {
        controller.enqueue({ type: "error", error });
        controller.close();
      }
    },
  });
}

export function createBedrockOpenAiLanguageModel(modelId: string): LanguageModelV4 {
  return {
    specificationVersion: "v4",
    provider: "bedrock-openai",
    modelId,
    supportedUrls: {},

    async doGenerate(options: LanguageModelV4CallOptions): Promise<LanguageModelV4GenerateResult> {
      const warnings = unsupportedWarnings(options);
      const body = buildChatCompletionBody(modelId, options, false);
      const response = await openAiChatFetch(body, false);
      const data = (await response.json()) as OpenAiChatCompletionResponse;

      const text = data.choices?.[0]?.message?.content ?? "";
      const finishReason = mapFinishReason(data.choices?.[0]?.finish_reason);

      return {
        content: [{ type: "text", text }],
        finishReason,
        usage: buildUsage(
          data.usage?.prompt_tokens,
          data.usage?.completion_tokens,
          data.usage?.total_tokens
        ),
        warnings,
        request: { body },
        response: {
          timestamp: new Date(),
          modelId,
          headers: Object.fromEntries(response.headers.entries()),
        },
      };
    },

    async doStream(options: LanguageModelV4CallOptions): Promise<LanguageModelV4StreamResult> {
      const warnings = unsupportedWarnings(options);
      const body = buildChatCompletionBody(modelId, options, true);

      return {
        stream: createOpenAiChatStream(body, modelId, warnings),
        request: { body },
      };
    },
  };
}
