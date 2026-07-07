export type AiProvider = "bedrock" | "bedrock-openai";

/** Stable app-level model id — stored on rubrics, independent of provider ARNs. */
export type AnalysisModelId =
  | "claude-sonnet-5"
  | "claude-sonnet-4.5"
  | "claude-haiku-4.5"
  | "gpt-5.5"
  | "gpt-5.4";

export const AI_PROVIDER_LABELS: Record<AiProvider, string> = {
  bedrock: "Claude (Amazon Bedrock)",
  "bedrock-openai": "OpenAI (Amazon Bedrock)"
};

export type AnalysisModel = {
  id: AnalysisModelId;
  label: string;
  provider: AiProvider;
  /** Provider-specific model identifier (e.g. Bedrock inference profile or model ARN). */
  providerModelId: string;
  description?: string;
};

export const ANALYSIS_MODELS: readonly AnalysisModel[] = [
  {
    id: "claude-sonnet-5",
    label: "Claude Sonnet 5",
    provider: "bedrock",
    providerModelId: "us.anthropic.claude-sonnet-5",
    description: "Best balance of quality and speed for rubric scoring."
  },
  {
    id: "claude-sonnet-4.5",
    label: "Claude Sonnet 4.5",
    provider: "bedrock",
    providerModelId: "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
    description: "Previous-generation Sonnet — reliable structured output."
  },
  {
    id: "claude-haiku-4.5",
    label: "Claude Haiku 4.5",
    provider: "bedrock",
    providerModelId: "us.anthropic.claude-haiku-4-5-20251001-v1:0",
    description: "Faster and lower cost; suitable for simpler rubrics."
  },
  {
    id: "gpt-5.5",
    label: "GPT-5.5",
    provider: "bedrock-openai",
    providerModelId: "openai.gpt-5.5",
    description: "Latest OpenAI model on Bedrock — strong reasoning for complex rubrics."
  },
  {
    id: "gpt-5.4",
    label: "GPT-5.4",
    provider: "bedrock-openai",
    providerModelId: "openai.gpt-5.4",
    description: "Reliable OpenAI model on Bedrock with structured output support."
  }
] as const;

export const DEFAULT_ANALYSIS_MODEL: AnalysisModelId = "claude-sonnet-4.5";

const MODEL_BY_ID = new Map(ANALYSIS_MODELS.map((model) => [model.id, model]));

export function isAnalysisModelId(value: string): value is AnalysisModelId {
  return MODEL_BY_ID.has(value as AnalysisModelId);
}

export function getAnalysisModel(id: AnalysisModelId): AnalysisModel {
  const model = MODEL_BY_ID.get(id);
  if (!model) throw new Error(`Unknown analysis model: ${id}`);
  return model;
}

export function normalizeAnalysisModelId(
  value: unknown,
  fallback: AnalysisModelId = DEFAULT_ANALYSIS_MODEL
): AnalysisModelId {
  if (typeof value === "string" && isAnalysisModelId(value)) return value;
  return fallback;
}

export function resolveProviderModelId(id: AnalysisModelId): {
  provider: AiProvider;
  modelId: string;
} {
  const model = getAnalysisModel(id);
  return { provider: model.provider, modelId: model.providerModelId };
}
