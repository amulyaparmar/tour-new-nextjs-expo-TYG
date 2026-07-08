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

import {
  bedrockOpenAiSupportsSamplingParams,
  buildOpenAiResponsesInput,
  getBedrockOpenAiConfig,
} from "./bedrock-openai";

type OpenAiChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type ResponsesMessageOutput = {
  type: "message";
  content?: Array<{ type: string; text?: string }>;
};

type ResponsesResult = {
  output?: Array<ResponsesMessageOutput | { type: string; [key: string]: unknown }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
  };
  status?: string;
  incomplete_details?: { reason?: string } | null;
  error?: { message?: string } | null;
};

type ResponsesStreamEvent = {
  type: string;
  delta?: string;
  error?: { message?: string };
  response?: ResponsesResult;
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

function mapFinishReason(
  status?: string,
  incompleteReason?: string | null
): LanguageModelV4FinishReason {
  if (incompleteReason === "max_output_tokens" || incompleteReason === "max_tokens") {
    return { unified: "length", raw: incompleteReason };
  }
  if (status === "incomplete") {
    return { unified: "length", raw: incompleteReason ?? "incomplete" };
  }
  return { unified: "stop", raw: status ?? "completed" };
}

function extractResponseText(data: ResponsesResult): string {
  const parts: string[] = [];

  for (const item of data.output ?? []) {
    if (item.type !== "message") continue;
    const message = item as ResponsesMessageOutput;
    for (const part of message.content ?? []) {
      if (part.type === "output_text" && part.text) {
        parts.push(part.text);
      }
    }
  }

  return parts.join("");
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

function buildResponsesBody(modelId: string, options: LanguageModelV4CallOptions, stream: boolean) {
  const messages = convertPromptToOpenAiMessages(options.prompt);
  const systemParts = messages.filter((message) => message.role === "system").map((message) => message.content);
  const conversation = messages.filter(
    (message): message is { role: "user" | "assistant"; content: string } => message.role !== "system"
  );

  const body: Record<string, unknown> = {
    model: modelId,
    stream,
    input: buildOpenAiResponsesInput(conversation),
  };

  if (systemParts.length > 0) {
    body.instructions = systemParts.join("\n\n");
  }

  if (options.maxOutputTokens != null) body.max_output_tokens = options.maxOutputTokens;
  if (bedrockOpenAiSupportsSamplingParams(modelId)) {
    if (options.temperature != null) body.temperature = options.temperature;
    if (options.topP != null) body.top_p = options.topP;
  }

  return body;
}

async function openAiResponsesFetch(
  body: Record<string, unknown>,
  stream: boolean
): Promise<Response> {
  const { token, baseUrl } = getBedrockOpenAiConfig();
  const response = await fetch(`${baseUrl}/responses`, {
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
    throw new Error(`Bedrock OpenAI responses error ${response.status}: ${errText}`);
  }

  return response;
}

function parseResponsesStreamEvent(payload: string): ResponsesStreamEvent | null {
  if (!payload || payload === "[DONE]") return null;
  try {
    return JSON.parse(payload) as ResponsesStreamEvent;
  } catch {
    return null;
  }
}

function createOpenAiResponsesStream(
  body: Record<string, unknown>,
  modelId: string,
  warnings: SharedV4Warning[]
): ReadableStream<LanguageModelV4StreamPart> {
  return new ReadableStream<LanguageModelV4StreamPart>({
    async start(controller) {
      controller.enqueue({ type: "stream-start", warnings });

      try {
        const response = await openAiResponsesFetch(body, true);
        controller.enqueue({
          type: "response-metadata",
          id: response.headers.get("x-request-id") ?? undefined,
          timestamp: new Date(),
          modelId,
        });

        if (!response.body) {
          throw new Error("Bedrock OpenAI responses stream returned an empty body.");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let textStarted = false;
        let finishReason: LanguageModelV4FinishReason = { unified: "stop", raw: "completed" };
        let inputTokens: number | undefined;
        let outputTokens: number | undefined;
        let totalTokens: number | undefined;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const blocks = buffer.split("\n\n");
          buffer = blocks.pop() ?? "";

          for (const block of blocks) {
            for (const line of block.split("\n")) {
              const trimmed = line.trim();
              if (!trimmed.startsWith("data:")) continue;

              const event = parseResponsesStreamEvent(trimmed.slice(5).trim());
              if (!event) continue;

              if (event.type === "response.output_text.delta" && event.delta) {
                if (!textStarted) {
                  textStarted = true;
                  controller.enqueue({ type: "text-start", id: "0" });
                }
                controller.enqueue({ type: "text-delta", id: "0", delta: event.delta });
              }

              if (event.type === "error" || event.type === "response.failed") {
                throw new Error(event.error?.message ?? "Bedrock OpenAI responses stream failed.");
              }

              if (event.type === "response.completed" && event.response) {
                finishReason = mapFinishReason(
                  event.response.status,
                  event.response.incomplete_details?.reason
                );
                inputTokens = event.response.usage?.input_tokens;
                outputTokens = event.response.usage?.output_tokens;
                totalTokens = event.response.usage?.total_tokens;
              }
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
      const body = buildResponsesBody(modelId, options, false);
      const response = await openAiResponsesFetch(body, false);
      const data = (await response.json()) as ResponsesResult;

      if (data.error) {
        throw new Error(`Bedrock OpenAI error: ${data.error.message ?? "unknown error"}`);
      }

      const text = extractResponseText(data);
      const finishReason = mapFinishReason(data.status, data.incomplete_details?.reason);

      return {
        content: [{ type: "text", text }],
        finishReason,
        usage: buildUsage(
          data.usage?.input_tokens,
          data.usage?.output_tokens,
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
      const body = buildResponsesBody(modelId, options, true);

      return {
        stream: createOpenAiResponsesStream(body, modelId, warnings),
        request: { body },
      };
    },
  };
}
