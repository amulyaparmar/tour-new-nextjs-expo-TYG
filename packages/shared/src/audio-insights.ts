import {
  normalizeParticipantName,
  type SessionParticipants,
} from "./speaker-labels";

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

/** Gong-style conversation metrics extracted from audio. */
export type AudioConversationStats = {
  /** Rep/agent share of total talk time (0–100). */
  talkRatioPercent: number;
  /** Total seconds the rep/agent spoke. */
  repTalkTimeSeconds: number;
  /** Longest uninterrupted prospect/customer monologue in seconds. */
  longestProspectTalkSeconds: number;
  /** Longest uninterrupted monologue by either party in seconds. */
  longestTalkSeconds: number;
  /** Meaningful back-and-forth quality score, 0-5. */
  interactivityScore: number;
  /** Interactivity score denominator. Normalized to 5. */
  interactivityTotal: number;
  /** Average pause in seconds after the prospect stops before the rep responds. */
  patienceSeconds: number;
  /** Rep/agent speaking rate in words per minute. */
  talkSpeedWordsPerMinute: number;
  /** Optional brief note on interactivity / engagement quality. */
  interactivityNotes?: string;
};

/** Gemini Files API reference for follow-up chat with the recording. */
export type GeminiAudioFileRef = {
  uri: string;
  mimeType: string;
  name?: string;
  createdAt?: string;
  expiresAt?: string;
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
  /** Conversation intelligence stats (talk ratio, interactivity, etc.). */
  conversationStats?: AudioConversationStats;
  /** Participant names inferred from direct audio understanding. */
  participants?: SessionParticipants;
  /** Uploaded recording on Gemini Files API for chat. */
  audioFile?: GeminiAudioFileRef;
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
    conversationStats: normalizeConversationStats(raw.conversationStats),
    participants: normalizeAudioParticipants(raw.participants),
    audioFile: normalizeAudioFileRef(raw.audioFile),
  };
}

function normalizeAudioParticipants(value: unknown): SessionParticipants | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Partial<SessionParticipants>;
  const agentName = normalizeParticipantName(raw.agentName);
  const prospectName = normalizeParticipantName(raw.prospectName);
  if (!agentName && !prospectName) return undefined;
  return { agentName, prospectName };
}

function normalizeAudioFileRef(value: unknown): GeminiAudioFileRef | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Partial<GeminiAudioFileRef>;
  if (typeof raw.uri !== "string" || typeof raw.mimeType !== "string") return undefined;
  return {
    uri: raw.uri,
    mimeType: raw.mimeType,
    name: typeof raw.name === "string" ? raw.name : undefined,
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : undefined,
    expiresAt: typeof raw.expiresAt === "string" ? raw.expiresAt : undefined,
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

function normalizeConversationStats(value: unknown): AudioConversationStats | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Partial<AudioConversationStats>;
  if (typeof raw.talkRatioPercent !== "number") return undefined;
  if (typeof raw.repTalkTimeSeconds !== "number") return undefined;
  if (typeof raw.longestProspectTalkSeconds !== "number") return undefined;
  if (typeof raw.longestTalkSeconds !== "number") return undefined;
  if (typeof raw.interactivityScore !== "number") return undefined;
  if (typeof raw.interactivityTotal !== "number") return undefined;
  if (typeof raw.patienceSeconds !== "number") return undefined;
  if (typeof raw.talkSpeedWordsPerMinute !== "number") return undefined;

  const rawInteractivityTotal = Math.max(0, Math.round(raw.interactivityTotal));
  const rawInteractivityScore = Math.max(0, raw.interactivityScore);
  const interactivityTotal = 5;
  const interactivityScore = rawInteractivityTotal > 10
    ? Math.round(clampNumber((rawInteractivityScore / rawInteractivityTotal) * interactivityTotal, 0, interactivityTotal))
    : Math.round(clampNumber(rawInteractivityScore, 0, interactivityTotal));

  return {
    talkRatioPercent: clampNumber(raw.talkRatioPercent, 0, 100),
    repTalkTimeSeconds: Math.max(0, raw.repTalkTimeSeconds),
    longestProspectTalkSeconds: Math.max(0, raw.longestProspectTalkSeconds),
    longestTalkSeconds: Math.max(0, raw.longestTalkSeconds),
    interactivityScore,
    interactivityTotal,
    patienceSeconds: Math.max(0, raw.patienceSeconds),
    talkSpeedWordsPerMinute: Math.max(0, raw.talkSpeedWordsPerMinute),
    interactivityNotes:
      typeof raw.interactivityNotes === "string" && raw.interactivityNotes.trim()
        ? raw.interactivityNotes.trim()
        : undefined,
  };
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
