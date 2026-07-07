import "server-only";

import {
  bedrockSupportsSamplingParams,
  buildInvokeModelJsonOutputConfig,
  prepareStructuredTool,
  type StructuredClaudeTool
} from "./bedrock-structured-output";

/**
 * Minimal AWS Bedrock client for Claude, using the long-term Bedrock API key
 * (bearer-token auth) rather than SigV4 signing. Plain fetch — no aws-sdk dep.
 *
 * Structured outputs apply schema normalization on every tool request.
 * `strict: true` and sampling params are only sent for models that accept them.
 *
 * Env:
 *   AWS_BEARER_TOKEN_BEDROCK  long-term Bedrock API key
 *   AWS_REGION                e.g. us-east-1
 *   BEDROCK_MODEL_ID          e.g. us.anthropic.claude-sonnet-4-5-20250929-v1:0
 */

export type ClaudeMessage = {
  role: "user" | "assistant";
  content: string | ClaudeContentBlock[];
};

export type ClaudeContentBlock =
  | { type: "text"; text: string }
  | {
      type: "document";
      source: {
        type: "base64";
        media_type: "application/pdf";
        data: string;
      };
    };

export type ClaudeTool = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
};

type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: string; [key: string]: unknown };

type ClaudeResponse = {
  content?: ContentBlock[];
  stop_reason?: string;
};

export function getBedrockRuntimeConfig() {
  const token = process.env.AWS_BEARER_TOKEN_BEDROCK;
  const region = process.env.AWS_REGION || "us-east-1";
  const modelId = process.env.BEDROCK_MODEL_ID;
  if (!token) throw new Error("AWS_BEARER_TOKEN_BEDROCK is not configured");
  if (!modelId) throw new Error("BEDROCK_MODEL_ID is not configured");
  return { token, region, modelId };
}

function getConfig() {
  return getBedrockRuntimeConfig();
}

function appendSamplingParams(
  body: Record<string, unknown>,
  modelId: string,
  temperature?: number
): void {
  if (bedrockSupportsSamplingParams(modelId)) {
    body.temperature = temperature ?? 0.3;
  }
}

async function invokeRaw(body: Record<string, unknown>, modelId?: string): Promise<ClaudeResponse> {
  const { token, region, modelId: defaultModelId } = getConfig();
  const resolvedModelId = modelId ?? defaultModelId;
  const url = `https://bedrock-runtime.${region}.amazonaws.com/model/${encodeURIComponent(resolvedModelId)}/invoke`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ anthropic_version: "bedrock-2023-05-31", ...body })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Bedrock invoke error ${response.status}: ${errText}`);
  }

  return (await response.json()) as ClaudeResponse;
}

export type InvokeClaudeParams = {
  system?: string;
  messages: ClaudeMessage[];
  maxTokens?: number;
  temperature?: number;
  /** When set, constrains the response to this JSON schema via output_config.format. */
  outputSchema?: Record<string, unknown>;
  /** Bedrock model id override (from standardized analysis model mapping). */
  modelId?: string;
};

/** Plain text completion. Returns the concatenated text blocks, or parsed JSON when outputSchema is set. */
export async function invokeClaude(params: InvokeClaudeParams): Promise<string> {
  const resolvedModelId = params.modelId ?? getConfig().modelId;
  const body: Record<string, unknown> = {
    max_tokens: params.maxTokens ?? 4096,
    ...(params.system ? { system: params.system } : {}),
    messages: params.messages,
    ...(params.outputSchema ? buildInvokeModelJsonOutputConfig(params.outputSchema) : {})
  };
  appendSamplingParams(body, resolvedModelId, params.temperature);
  const data = await invokeRaw(body, params.modelId);

  const text = (data.content ?? [])
    .filter((b): b is { type: "text"; text: string } => b.type === "text")
    .map((b) => b.text)
    .join("");

  if (params.outputSchema) {
    try {
      JSON.parse(text);
    } catch {
      throw new Error("Bedrock structured output was not valid JSON");
    }
  }

  return text;
}

export type InvokeClaudeToolParams = Omit<InvokeClaudeParams, "outputSchema"> & {
  tool: ClaudeTool | StructuredClaudeTool;
};

/**
 * Forces Claude to call `tool` and returns its validated `input` object.
 * Schema is normalized; strict tool use is applied only when the model supports it.
 */
export async function invokeClaudeTool<T = Record<string, unknown>>(
  params: InvokeClaudeToolParams
): Promise<T> {
  const resolvedModelId = params.modelId ?? getConfig().modelId;
  const tool = prepareStructuredTool(params.tool, { modelId: resolvedModelId });
  const body: Record<string, unknown> = {
    max_tokens: params.maxTokens ?? 8192,
    ...(params.system ? { system: params.system } : {}),
    messages: params.messages,
    tools: [tool],
    tool_choice: { type: "tool", name: tool.name }
  };
  appendSamplingParams(body, resolvedModelId, params.temperature);
  const data = await invokeRaw(body, params.modelId);

  const toolUse = (data.content ?? []).find(
    (b): b is { type: "tool_use"; id: string; name: string; input: Record<string, unknown> } =>
      b.type === "tool_use" && b.name === tool.name
  );

  if (!toolUse) {
    throw new Error(`Bedrock response did not include a ${tool.name} tool call`);
  }

  return toolUse.input as T;
}
