export type AudioEmotion = "happy" | "sad" | "angry" | "neutral" | "excited" | "concerned";

export type AudioSentiment = "positive" | "neutral" | "negative" | "mixed";

export type AudioEnergy = "low" | "medium" | "high";

export type AudioInsightSegment = {
  speaker: string;
  startTime: number;
  endTime: number;
  text: string;
  language?: string;
  emotion: AudioEmotion;
  energy: AudioEnergy;
  translation?: string;
};

export type AudioAmbienceCue = {
  startTime: number;
  endTime: number;
  label: string;
  description: string;
};

export type AudioSpeakerDynamic = {
  speaker: string;
  talkTimeSeconds: number;
  dominantEmotion: AudioEmotion;
  notes: string;
};

export type AudioInsightHighlight = {
  timestamp: number;
  label: string;
  explanation: string;
};

/** Gemini multimodal audio analysis stored on a session. */
export type AudioInsights = {
  provider: "gemini";
  model: string;
  summary: string;
  overallSentiment: AudioSentiment;
  speakerDynamics: AudioSpeakerDynamic[];
  segments: AudioInsightSegment[];
  ambienceCues: AudioAmbienceCue[];
  highlights: AudioInsightHighlight[];
};

export function normalizeAudioInsights(value: unknown): AudioInsights | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<AudioInsights>;
  if (raw.provider !== "gemini") return null;
  if (typeof raw.summary !== "string" || typeof raw.model !== "string") return null;
  if (!isSentiment(raw.overallSentiment)) return null;

  const segments = Array.isArray(raw.segments)
    ? raw.segments
        .map(normalizeSegment)
        .filter((segment): segment is AudioInsightSegment => segment != null)
    : [];

  return {
    provider: "gemini",
    model: raw.model,
    summary: raw.summary,
    overallSentiment: raw.overallSentiment,
    speakerDynamics: Array.isArray(raw.speakerDynamics)
      ? raw.speakerDynamics
          .map(normalizeSpeakerDynamic)
          .filter((item): item is AudioSpeakerDynamic => item != null)
      : [],
    segments,
    ambienceCues: Array.isArray(raw.ambienceCues)
      ? raw.ambienceCues
          .map(normalizeAmbienceCue)
          .filter((item): item is AudioAmbienceCue => item != null)
      : [],
    highlights: Array.isArray(raw.highlights)
      ? raw.highlights
          .map(normalizeHighlight)
          .filter((item): item is AudioInsightHighlight => item != null)
      : [],
  };
}

function isSentiment(value: unknown): value is AudioSentiment {
  return value === "positive" || value === "neutral" || value === "negative" || value === "mixed";
}

function isEmotion(value: unknown): value is AudioEmotion {
  return (
    value === "happy"
    || value === "sad"
    || value === "angry"
    || value === "neutral"
    || value === "excited"
    || value === "concerned"
  );
}

function isEnergy(value: unknown): value is AudioEnergy {
  return value === "low" || value === "medium" || value === "high";
}

function normalizeSegment(value: unknown): AudioInsightSegment | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<AudioInsightSegment>;
  if (typeof raw.speaker !== "string" || typeof raw.text !== "string") return null;
  if (typeof raw.startTime !== "number" || typeof raw.endTime !== "number") return null;
  if (!isEmotion(raw.emotion) || !isEnergy(raw.energy)) return null;
  return {
    speaker: raw.speaker,
    startTime: raw.startTime,
    endTime: raw.endTime,
    text: raw.text,
    language: typeof raw.language === "string" ? raw.language : undefined,
    emotion: raw.emotion,
    energy: raw.energy,
    translation: typeof raw.translation === "string" ? raw.translation : undefined,
  };
}

function normalizeSpeakerDynamic(value: unknown): AudioSpeakerDynamic | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<AudioSpeakerDynamic>;
  if (typeof raw.speaker !== "string" || typeof raw.notes !== "string") return null;
  if (typeof raw.talkTimeSeconds !== "number" || !isEmotion(raw.dominantEmotion)) return null;
  return {
    speaker: raw.speaker,
    talkTimeSeconds: raw.talkTimeSeconds,
    dominantEmotion: raw.dominantEmotion,
    notes: raw.notes,
  };
}

function normalizeAmbienceCue(value: unknown): AudioAmbienceCue | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<AudioAmbienceCue>;
  if (typeof raw.label !== "string" || typeof raw.description !== "string") return null;
  if (typeof raw.startTime !== "number" || typeof raw.endTime !== "number") return null;
  return {
    startTime: raw.startTime,
    endTime: raw.endTime,
    label: raw.label,
    description: raw.description,
  };
}

function normalizeHighlight(value: unknown): AudioInsightHighlight | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<AudioInsightHighlight>;
  if (typeof raw.label !== "string" || typeof raw.explanation !== "string") return null;
  if (typeof raw.timestamp !== "number") return null;
  return {
    timestamp: raw.timestamp,
    label: raw.label,
    explanation: raw.explanation,
  };
}
