import "server-only";

import { prepareStructuredJsonSchema } from "./bedrock-structured-output";

/**
 * OpenAI models hosted on Amazon Bedrock (Mantle / Responses API).
 * Uses the same long-term Bedrock API key as Claude.
 *
 * Env:
 *   AWS_BEARER_TOKEN_BEDROCK  long-term Bedrock API key
 *   AWS_REGION                e.g. us-east-1
 *   BEDROCK_OPENAI_BASE_URL   optional override (default: bedrock-mantle.{region}.api.aws/openai/v1)
 */

export type OpenAiTool = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
};

type ResponsesFunctionCall = {
  type: "function_call";
  name: string;
  arguments: string;
};

type ResponsesOutput = ResponsesFunctionCall | { type: string; [key: string]: unknown };

type ResponsesResult = {
  status?: string;
  output?: ResponsesOutput[];
  error?: { message?: string } | null;
  incomplete_details?: { reason?: string } | null;
};

const BEDROCK_OPENAI_REASONING_MIN_OUTPUT_TOKENS = 16_384;

export function getBedrockOpenAiConfig() {
  const token = process.env.AWS_BEARER_TOKEN_BEDROCK;
  const region = process.env.AWS_REGION || "us-east-1";
  if (!token) throw new Error("AWS_BEARER_TOKEN_BEDROCK is not configured");

  const baseUrl =
    process.env.BEDROCK_OPENAI_BASE_URL?.replace(/\/$/, "") ??
    `https://bedrock-mantle.${region}.api.aws/openai/v1`;

  return { token, region, baseUrl };
}

export function buildOpenAiResponsesInput(
  messages: Array<{ role: "user" | "assistant"; content: string }>
): string | Array<{ role: "user" | "assistant"; content: string }> {
  if (messages.length === 1 && messages[0]?.role === "user") {
    return messages[0].content;
  }
  return messages;
}

/** GPT-5+ models on Bedrock reject non-default temperature and top_p. */
export function bedrockOpenAiSupportsSamplingParams(modelId: string): boolean {
  const id = modelId.toLowerCase();
  return !id.includes("gpt-5");
}

function bedrockOpenAiSupportsReasoningParams(modelId: string): boolean {
  return modelId.toLowerCase().includes("gpt-5");
}

function describeMissingToolCall(data: ResponsesResult): string {
  const outputTypes = Array.from(new Set((data.output ?? []).map((item) => item.type)));
  return [
    data.status ? `status=${data.status}` : null,
    data.incomplete_details?.reason
      ? `reason=${data.incomplete_details.reason}`
      : null,
    outputTypes.length > 0 ? `output=${outputTypes.join(",")}` : "output=empty",
  ].filter(Boolean).join("; ");
}

/** Forces an OpenAI function call and returns the parsed arguments object. */
export async function invokeOpenAiTool<T = Record<string, unknown>>(params: {
  system?: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  tool: OpenAiTool;
  maxTokens?: number;
  temperature?: number;
  modelId: string;
}): Promise<T> {
  const { token, baseUrl } = getBedrockOpenAiConfig();
  const schema = prepareStructuredJsonSchema(params.tool.input_schema);
  const reasoningModel = bedrockOpenAiSupportsReasoningParams(params.modelId);
  const body: Record<string, unknown> = {
    model: params.modelId,
    ...(params.system ? { instructions: params.system } : {}),
    input: buildOpenAiResponsesInput(params.messages),
    max_output_tokens: reasoningModel
      ? Math.max(params.maxTokens ?? 8192, BEDROCK_OPENAI_REASONING_MIN_OUTPUT_TOKENS)
      : params.maxTokens ?? 8192,
    tools: [
      {
        type: "function",
        name: params.tool.name,
        description: params.tool.description,
        parameters: schema,
        strict: true
      }
    ],
    tool_choice: { type: "function", name: params.tool.name },
    store: false
  };

  if (bedrockOpenAiSupportsSamplingParams(params.modelId) && params.temperature != null) {
    body.temperature = params.temperature;
  } else if (bedrockOpenAiSupportsSamplingParams(params.modelId)) {
    body.temperature = 0.3;
  }

  const response = await fetch(`${baseUrl}/responses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Bedrock OpenAI error ${response.status}: ${errText}`);
  }

  const data = (await response.json()) as ResponsesResult;
  if (data.error) {
    throw new Error(`Bedrock OpenAI error: ${data.error.message ?? "unknown error"}`);
  }

  const toolCall = (data.output ?? []).find(
    (item): item is ResponsesFunctionCall =>
      item.type === "function_call" && item.name === params.tool.name
  );

  if (!toolCall?.arguments) {
    throw new Error(
      `Bedrock OpenAI ${params.modelId} response did not include a ${params.tool.name} function call (${describeMissingToolCall(data)})`
    );
  }

  try {
    return JSON.parse(toolCall.arguments) as T;
  } catch {
    throw new Error(
      `Bedrock OpenAI ${params.modelId} function call was not valid JSON: ${toolCall.arguments.slice(0, 200)}`
    );
  }
}
