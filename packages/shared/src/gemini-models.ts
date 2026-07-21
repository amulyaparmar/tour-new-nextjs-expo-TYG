/** Stable Gemini model ids for audio understanding and chat. */
export type GeminiAudioModelId =
  | "gemini-3.6-flash"
  | "gemini-3.5-flash"
  | "gemini-2.5-flash"
  | "gemini-2.5-pro";

export type GeminiAudioModel = {
  id: GeminiAudioModelId;
  label: string;
  description?: string;
};

export const GEMINI_AUDIO_MODELS: readonly GeminiAudioModel[] = [
  {
    id: "gemini-3.6-flash",
    label: "Gemini 3.6 Flash",
    description: "Default — faster, newer multimodal audio analysis and structured output.",
  },
  {
    id: "gemini-3.5-flash",
    label: "Gemini 3.5 Flash",
    description: "Previous fast multimodal audio analysis and chat model.",
  },
  {
    id: "gemini-2.5-flash",
    label: "Gemini 2.5 Flash",
    description: "Lower latency for quick follow-up questions.",
  },
  {
    id: "gemini-2.5-pro",
    label: "Gemini 2.5 Pro",
    description: "Deeper reasoning for nuanced tone and coaching review.",
  },
] as const;

export const DEFAULT_GEMINI_AUDIO_MODEL: GeminiAudioModelId = "gemini-3.6-flash";

const GEMINI_MODEL_BY_ID = new Map(GEMINI_AUDIO_MODELS.map((model) => [model.id, model]));

export function isGeminiAudioModelId(value: string): value is GeminiAudioModelId {
  return GEMINI_MODEL_BY_ID.has(value as GeminiAudioModelId);
}

export function getGeminiAudioModel(id: GeminiAudioModelId): GeminiAudioModel {
  const model = GEMINI_MODEL_BY_ID.get(id);
  if (!model) throw new Error(`Unknown Gemini audio model: ${id}`);
  return model;
}

export function normalizeGeminiAudioModelId(
  value: unknown,
  fallback: GeminiAudioModelId = DEFAULT_GEMINI_AUDIO_MODEL
): GeminiAudioModelId {
  if (typeof value === "string" && isGeminiAudioModelId(value)) return value;
  return fallback;
}
