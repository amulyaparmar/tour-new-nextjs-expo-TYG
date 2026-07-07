import "server-only";

import type { ClaudeTool } from "./bedrock";

type JsonSchema = Record<string, unknown>;

function isObjectSchema(schema: JsonSchema): boolean {
  return schema.type === "object" || typeof schema.properties === "object";
}

/**
 * Normalizes a JSON Schema for Bedrock structured outputs.
 * @see https://docs.aws.amazon.com/bedrock/latest/userguide/structured-output.html
 */
export function prepareStructuredJsonSchema(schema: JsonSchema): JsonSchema {
  const result = { ...schema };

  if (isObjectSchema(result)) {
    result.type ??= "object";
    result.additionalProperties = false;

    if (result.properties && typeof result.properties === "object") {
      const properties: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(result.properties as Record<string, unknown>)) {
        properties[key] = prepareStructuredJsonSchema(value as JsonSchema);
      }
      result.properties = properties;
    }
  }

  if (result.type === "array" && result.items) {
    const items = result.items;
    result.items = Array.isArray(items)
      ? items.map((item) => prepareStructuredJsonSchema(item as JsonSchema))
      : prepareStructuredJsonSchema(items as JsonSchema);
  }

  for (const combinator of ["anyOf", "allOf", "oneOf"] as const) {
    const branches = result[combinator];
    if (Array.isArray(branches)) {
      result[combinator] = branches.map((branch) => prepareStructuredJsonSchema(branch as JsonSchema));
    }
  }

  return result;
}

export type StructuredClaudeTool = ClaudeTool & { strict?: true };

/** Newer Anthropic models on Bedrock reject legacy InvokeModel parameters. */
export function isRestrictedAnthropicBedrockModel(modelId: string): boolean {
  const id = modelId.toLowerCase();
  return (
    id.includes("claude-sonnet-5")
    || id.includes("claude-opus-4-7")
    || id.includes("claude-opus-4-8")
  );
}

/** Bedrock Messages API rejects tools[].strict on newer Anthropic model families. */
export function bedrockSupportsStrictTools(modelId: string): boolean {
  if (isRestrictedAnthropicBedrockModel(modelId)) return false;
  return modelId.toLowerCase().includes("anthropic.claude");
}

/** Sonnet 5 / Opus 4.7+ reject non-default temperature, top_p, and top_k. */
export function bedrockSupportsSamplingParams(modelId: string): boolean {
  return !isRestrictedAnthropicBedrockModel(modelId);
}

/** Applies schema normalization and optional strict tool-use when the model supports it. */
export function prepareStructuredTool(
  tool: ClaudeTool,
  options?: { modelId?: string }
): StructuredClaudeTool {
  const input_schema = prepareStructuredJsonSchema(tool.input_schema);
  const modelId = options?.modelId ?? "";
  if (modelId && bedrockSupportsStrictTools(modelId)) {
    return { ...tool, strict: true, input_schema };
  }
  return { ...tool, input_schema };
}

export type BedrockJsonSchemaOutputConfig = {
  type: "json_schema";
  schema: JsonSchema;
};

/** InvokeModel output_config.format for Anthropic Claude models. */
export function buildInvokeModelJsonOutputConfig(schema: JsonSchema): {
  output_config: { format: BedrockJsonSchemaOutputConfig };
} {
  return {
    output_config: {
      format: {
        type: "json_schema",
        schema: prepareStructuredJsonSchema(schema)
      }
    }
  };
}

/** Converse API outputConfig.textFormat for Anthropic Claude models. */
export function buildConverseJsonOutputConfig(
  schema: JsonSchema,
  options?: { name?: string; description?: string }
) {
  const prepared = prepareStructuredJsonSchema(schema);
  return {
    outputConfig: {
      textFormat: {
        type: "json_schema" as const,
        structure: {
          jsonSchema: {
            schema: JSON.stringify(prepared),
            name: options?.name ?? "structured_output",
            ...(options?.description ? { description: options.description } : {})
          }
        }
      }
    }
  };
}
