import "server-only";

/**
 * Minimal AWS Bedrock client for Claude, using the long-term Bedrock API key
 * (bearer-token auth) rather than SigV4 signing. Plain fetch — no aws-sdk dep.
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

function getConfig() {
  const token = process.env.AWS_BEARER_TOKEN_BEDROCK;
  const region = process.env.AWS_REGION || "us-east-1";
  const modelId = process.env.BEDROCK_MODEL_ID;
  if (!token) throw new Error("AWS_BEARER_TOKEN_BEDROCK is not configured");
  if (!modelId) throw new Error("BEDROCK_MODEL_ID is not configured");
  return { token, region, modelId };
}

async function invokeRaw(body: Record<string, unknown>): Promise<ClaudeResponse> {
  const { token, region, modelId } = getConfig();
  const url = `https://bedrock-runtime.${region}.amazonaws.com/model/${encodeURIComponent(modelId)}/invoke`;

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
};

/** Plain text completion. Returns the concatenated text blocks. */
export async function invokeClaude(params: InvokeClaudeParams): Promise<string> {
  const data = await invokeRaw({
    max_tokens: params.maxTokens ?? 4096,
    temperature: params.temperature ?? 0.3,
    ...(params.system ? { system: params.system } : {}),
    messages: params.messages
  });

  return (data.content ?? [])
    .filter((b): b is { type: "text"; text: string } => b.type === "text")
    .map((b) => b.text)
    .join("");
}

export type InvokeClaudeToolParams = InvokeClaudeParams & {
  tool: ClaudeTool;
};

/**
 * Forces Claude to call `tool` and returns its validated `input` object. This is
 * the structured-output guarantee: the model cannot answer in prose, it must emit
 * an object matching the tool's input_schema.
 */
export async function invokeClaudeTool<T = Record<string, unknown>>(
  params: InvokeClaudeToolParams
): Promise<T> {
  const data = await invokeRaw({
    max_tokens: params.maxTokens ?? 8192,
    temperature: params.temperature ?? 0.3,
    ...(params.system ? { system: params.system } : {}),
    messages: params.messages,
    tools: [params.tool],
    tool_choice: { type: "tool", name: params.tool.name }
  });

  const toolUse = (data.content ?? []).find(
    (b): b is { type: "tool_use"; id: string; name: string; input: Record<string, unknown> } =>
      b.type === "tool_use" && b.name === params.tool.name
  );

  if (!toolUse) {
    throw new Error(`Bedrock response did not include a ${params.tool.name} tool call`);
  }

  return toolUse.input as T;
}
