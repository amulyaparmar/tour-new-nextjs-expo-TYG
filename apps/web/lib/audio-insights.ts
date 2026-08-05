import "server-only";

import {
  normalizeAudioInsights,
  normalizeParticipantName,
  normalizeParticipantNameConfidence,
  type AudioInsights,
  type GeminiAudioFileRef,
  type SessionParticipants,
} from "@tour/shared";

import {
  geminiGenerateJson,
  geminiChatWithAudioFile,
  getGeminiAudioInsightsTimeoutMs,
  getGeminiConfig,
  parseGeminiTimestamp,
  uploadGeminiAudioFile,
  type GeminiChatMessage,
  type GeminiUploadedFile,
} from "./gemini-client";

const GEMINI_FILE_TTL_MS = 48 * 60 * 60 * 1000;
const GEMINI_FILE_EXPIRY_SAFETY_MS = 10 * 60 * 1000;

const AUDIO_INSIGHTS_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    topicSummary: {
      type: "string",
      description: "Concise 1-4 word subject; for tours prefer unit type(s), for calls state the purpose",
    },
    overallSentiment: {
      type: "string",
      enum: ["positive", "neutral", "negative", "mixed"],
    },
    speakerDynamics: {
      type: "array",
      items: {
        type: "object",
        properties: {
          speaker: {
            type: "string",
            description: "Role inferred from the voice's behavior across the full audio",
          },
          talkTimeSeconds: { type: "number" },
          dominantEmotion: {
            type: "string",
            enum: ["happy", "sad", "angry", "neutral", "excited", "concerned"],
          },
          notes: { type: "string" },
        },
        required: ["speaker", "talkTimeSeconds", "dominantEmotion", "notes"],
      },
    },
    segments: {
      type: "array",
      items: {
        type: "object",
        properties: {
          speaker: {
            type: "string",
            description: "Agent or Prospect after tracking the same voice across the recording; split turns whenever the voice changes",
          },
          timestamp: { type: "string" },
          endTimestamp: { type: "string" },
          content: { type: "string" },
          language: { type: "string" },
          emotion: {
            type: "string",
            enum: ["happy", "sad", "angry", "neutral", "excited", "concerned"],
          },
          energy: {
            type: "string",
            enum: ["low", "medium", "high"],
          },
          translation: { type: "string" },
        },
        required: ["speaker", "timestamp", "content", "emotion", "energy"],
      },
    },
    ambienceCues: {
      type: "array",
      items: {
        type: "object",
        properties: {
          timestamp: { type: "string" },
          endTimestamp: { type: "string" },
          label: { type: "string" },
          description: { type: "string" },
        },
        required: ["timestamp", "label", "description"],
      },
    },
    highlights: {
      type: "array",
      items: {
        type: "object",
        properties: {
          timestamp: { type: "string" },
          label: { type: "string" },
          explanation: { type: "string" },
        },
        required: ["timestamp", "label", "explanation"],
      },
    },
    conversationStats: {
      type: "object",
      properties: {
        talkRatioPercent: {
          type: "number",
          description: "Rep/agent share of total talk time, 0-100",
        },
        repTalkTimeSeconds: {
          type: "number",
          description: "Total seconds the rep/agent spoke",
        },
        longestProspectTalkSeconds: {
          type: "number",
          description: "Longest uninterrupted prospect/customer monologue in seconds",
        },
        longestTalkSeconds: {
          type: "number",
          description: "Longest uninterrupted monologue by either party in seconds",
        },
        interactivityScore: {
          type: "number",
          description: "Meaningful back-and-forth quality score from 0-5; passive acks should not count",
        },
        interactivityTotal: {
          type: "number",
          description: "Interactivity denominator; always return 5",
        },
        patienceSeconds: {
          type: "number",
          description: "Average pause in seconds after prospect stops before rep responds",
        },
        talkSpeedWordsPerMinute: {
          type: "number",
          description: "Rep/agent speaking rate in words per minute",
        },
        interactivityNotes: {
          type: "string",
          description: "Brief note on engagement quality and turn-taking patterns",
        },
      },
      required: [
        "talkRatioPercent",
        "repTalkTimeSeconds",
        "longestProspectTalkSeconds",
        "longestTalkSeconds",
        "interactivityScore",
        "interactivityTotal",
        "patienceSeconds",
        "talkSpeedWordsPerMinute",
      ],
    },
  },
  required: [
    "summary",
    "topicSummary",
    "overallSentiment",
    "segments",
    "conversationStats",
  ],
} as const;

const AUDIO_PARTICIPANTS_SCHEMA = {
  type: "object",
  properties: {
    agentName: {
      type: "string",
      description: "Exact spoken name of the leasing agent; empty string when unsupported",
    },
    prospectName: {
      type: "string",
      description: "Exact spoken name of the prospect; empty string when unsupported",
    },
    agentNameConfidence: { type: "number" },
    prospectNameConfidence: { type: "number" },
    agentNameFirstMentionTimestamp: { type: "string" },
    prospectNameFirstMentionTimestamp: { type: "string" },
  },
  required: [
    "agentName",
    "prospectName",
    "agentNameConfidence",
    "prospectNameConfidence",
    "agentNameFirstMentionTimestamp",
    "prospectNameFirstMentionTimestamp",
  ],
} as const;

type GeminiAudioInsightsPayload = {
  summary: string;
  topicSummary: string;
  overallSentiment: AudioInsights["overallSentiment"];
  speakerDynamics?: AudioInsights["speakerDynamics"];
  segments: Array<{
    speaker: string;
    timestamp: string;
    endTimestamp?: string;
    content: string;
    language?: string;
    emotion: AudioInsights["segments"][number]["emotion"];
    energy: AudioInsights["segments"][number]["energy"];
    translation?: string;
  }>;
  ambienceCues?: Array<{
    timestamp: string;
    endTimestamp?: string;
    label: string;
    description: string;
  }>;
  highlights?: Array<{
    timestamp: string;
    label: string;
    explanation: string;
  }>;
  conversationStats: {
    talkRatioPercent: number;
    repTalkTimeSeconds: number;
    longestProspectTalkSeconds: number;
    longestTalkSeconds: number;
    interactivityScore: number;
    interactivityTotal: number;
    patienceSeconds: number;
    talkSpeedWordsPerMinute: number;
    interactivityNotes?: string;
  };
};

export type AudioInsightsRubricContext = {
  name: string;
  sessionType: string;
  criteria: string[];
  analysisInstructions?: string | null;
};

function buildAudioInsightsPrompt(
  rubricContext?: AudioInsightsRubricContext,
): string {
  const lines = [
    "Analyze this leasing tour or phone shop recording for coaching insights.",
    "Use the audio directly — tone, pacing, pauses, enthusiasm, and non-speech ambience matter.",
    "Listen through the audio and establish the distinct voices, who conducts the session, and who is shopping before computing role-based statistics.",
    "",
    "Requirements:",
    "1. Identify distinct speakers and estimate talk time per speaker.",
    "2. Provide MM:SS timestamps for each segment.",
    "3. Detect primary emotion and energy per segment.",
    "4. Note non-speech ambience cues (background noise, doors, music, HVAC, etc.).",
    "5. Flag 3-6 coaching highlights (rapport wins, hesitation, objections, missed closes).",
    "6. Summarize overall sentiment for the interaction.",
    "7. Return topicSummary as a concise 1-4 word subject:",
    "   - For a tour, prefer the unit type or types discussed (for example, \"Studio and 1-Bedroom\").",
    "   - For a call, state the purpose (for example, \"Availability Inquiry\" or \"Application Follow-Up\").",
    "   - Avoid generic labels like \"Tour\" or \"Call\" when the audio supports something more specific.",
    "   - Use an empty string when no specific topic is supported by the recording.",
    "8. Compute conversationStats from the audio:",
    "   - talkRatioPercent: rep/agent talk time ÷ total talk time × 100",
    "   - repTalkTimeSeconds: total rep/agent speaking time",
    "   - longestProspectTalkSeconds: longest uninterrupted prospect/customer monologue",
    "   - longestTalkSeconds: longest uninterrupted monologue by either party",
    "   - interactivityScore: score the quality of meaningful back-and-forth from 0-5; ignore passive acks ('yeah', 'uh-huh', 'right') and brief overlaps",
    "   - interactivityTotal: always 5",
    "   - patienceSeconds: average pause after the prospect finishes before the rep starts (lower = more interruptive)",
    "   - talkSpeedWordsPerMinute: rep/agent words per minute",
    "   - interactivityNotes: 1-2 sentences on engagement quality",
    "Return complete structured JSON matching the provided schema. Use empty strings or empty arrays when unknown/not present.",
    "Use MM:SS timestamps. interactivityTotal must be 5.",
  ];

  if (rubricContext) {
    lines.push(
      "",
      "Rubric context for this recording:",
      `- Rubric: ${rubricContext.name}`,
      `- Session type: ${rubricContext.sessionType}`,
      "- Use the criteria below to prioritize coaching highlights and the summary. Do not invent evidence and do not change the quantitative metric definitions above.",
      ...rubricContext.criteria.slice(0, 80).map((criterion) => `  - ${criterion}`),
    );
    if (rubricContext.analysisInstructions?.trim()) {
      lines.push(
        "- Additional rubric analysis instructions:",
        rubricContext.analysisInstructions.trim().slice(0, 4_000),
      );
    }
  }

  return lines.join("\n");
}

function parseOptionalMentionTimestamp(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^(\d+):([0-5]\d)$/);
  if (!match) return null;
  const minutes = Number(match[1]);
  const seconds = Number(match[2]);
  const totalSeconds = minutes * 60 + seconds;
  return Number.isSafeInteger(minutes) && Number.isSafeInteger(totalSeconds)
    ? totalSeconds
    : null;
}

export async function generateAudioInsights(params: {
  audioBuffer: Buffer;
  mimeType: string;
  fileName?: string;
  rubricContext?: AudioInsightsRubricContext;
}): Promise<AudioInsights> {
  const { model } = getGeminiConfig();
  const uploadedFile = await uploadGeminiAudioFile(
    params.audioBuffer,
    params.mimeType,
    params.fileName ?? "recording"
  );

  const { value: payload, model: resolvedModel } = await geminiGenerateJson<GeminiAudioInsightsPayload>({
    prompt: buildAudioInsightsPrompt(params.rubricContext),
    schema: AUDIO_INSIGHTS_SCHEMA,
    audioBuffer: params.audioBuffer,
    mimeType: params.mimeType,
    fileName: params.fileName,
    model,
    uploadedFile,
    requestOptions: {
      timeoutMs: getGeminiAudioInsightsTimeoutMs(),
      // This is the total per-model retry budget; the SDK divides it across
      // bounded attempts before our audio-model fallback advances.
    },
  });

  const insights: AudioInsights = {
    provider: "gemini",
    model: resolvedModel,
    summary: payload.summary,
    topicSummary: payload.topicSummary,
    overallSentiment: payload.overallSentiment,
    audioFile: buildGeminiAudioFileRef(uploadedFile),
    speakerDynamics: (payload.speakerDynamics ?? []).map((item) => ({
      speaker: item.speaker,
      talkTimeSeconds: item.talkTimeSeconds,
      dominantEmotion: item.dominantEmotion,
      notes: item.notes,
    })),
    segments: (payload.segments ?? []).map((segment) => {
      const startTime = parseGeminiTimestamp(segment.timestamp);
      const endTime = segment.endTimestamp
        ? parseGeminiTimestamp(segment.endTimestamp)
        : startTime;
      return {
        speaker: segment.speaker,
        startTime,
        endTime: Math.max(endTime, startTime),
        text: segment.content,
        language: segment.language,
        emotion: segment.emotion,
        energy: segment.energy,
        translation: segment.translation,
      };
    }),
    ambienceCues: (payload.ambienceCues ?? []).map((cue) => {
      const startTime = parseGeminiTimestamp(cue.timestamp);
      const endTime = cue.endTimestamp ? parseGeminiTimestamp(cue.endTimestamp) : startTime;
      return {
        startTime,
        endTime: Math.max(endTime, startTime),
        label: cue.label,
        description: cue.description,
      };
    }),
    highlights: (payload.highlights ?? []).map((item) => ({
      timestamp: parseGeminiTimestamp(item.timestamp),
      label: item.label,
      explanation: item.explanation,
    })),
    conversationStats: {
      talkRatioPercent: payload.conversationStats.talkRatioPercent,
      repTalkTimeSeconds: payload.conversationStats.repTalkTimeSeconds,
      longestProspectTalkSeconds: payload.conversationStats.longestProspectTalkSeconds,
      longestTalkSeconds: payload.conversationStats.longestTalkSeconds,
      interactivityScore: payload.conversationStats.interactivityScore,
      interactivityTotal: payload.conversationStats.interactivityTotal,
      patienceSeconds: payload.conversationStats.patienceSeconds,
      talkSpeedWordsPerMinute: payload.conversationStats.talkSpeedWordsPerMinute,
      interactivityNotes: payload.conversationStats.interactivityNotes,
    },
  };

  const normalized = normalizeAudioInsights(insights);
  if (!normalized) throw new Error("Gemini audio insights failed normalization");
  return normalized;
}

type GeminiAudioParticipantsPayload = {
  agentName: string;
  prospectName: string;
  agentNameConfidence: number;
  prospectNameConfidence: number;
  agentNameFirstMentionTimestamp: string;
  prospectNameFirstMentionTimestamp: string;
};

const AUDIO_PARTICIPANTS_PROMPT = [
  "Who is the agent and who is the prospect?",
  "Listen only to the recording. First distinguish the voices, then attach a name using a self-introduction or unambiguous direct address, and finally infer the role from what that same voice does across the interaction.",
  "The agent conducts the leasing tour or call. The prospect is shopping for housing.",
  "Do not use a transcript, speaker labels, metadata, rubric context, or prior analysis.",
  "A self-introduction names the speaker; direct address names the listener. Return an empty name with confidence 0 if either the name-to-voice or voice-to-role link is unsupported.",
  "Return exact spoken names, 0-100 confidence, and the earliest audible name mention as MM:SS.",
].join("\n");

export async function identifyAudioParticipants(params: {
  audioBuffer: Buffer;
  mimeType: string;
  fileName?: string;
  model?: string;
  uploadedFile: GeminiUploadedFile;
}): Promise<SessionParticipants> {
  const { value } = await geminiGenerateJson<GeminiAudioParticipantsPayload>({
    prompt: AUDIO_PARTICIPANTS_PROMPT,
    schema: AUDIO_PARTICIPANTS_SCHEMA,
    audioBuffer: params.audioBuffer,
    mimeType: params.mimeType,
    fileName: params.fileName,
    model: params.model,
    uploadedFile: params.uploadedFile,
    temperature: 0,
    requestOptions: {
      timeoutMs: getGeminiAudioInsightsTimeoutMs(),
    },
  });

  return {
    agentName: normalizeParticipantName(value.agentName),
    prospectName: normalizeParticipantName(value.prospectName),
    agentNameConfidence:
      normalizeParticipantNameConfidence(value.agentNameConfidence) ?? 0,
    prospectNameConfidence:
      normalizeParticipantNameConfidence(value.prospectNameConfidence) ?? 0,
    agentNameFirstMentionSeconds: parseOptionalMentionTimestamp(
      value.agentNameFirstMentionTimestamp,
    ),
    prospectNameFirstMentionSeconds: parseOptionalMentionTimestamp(
      value.prospectNameFirstMentionTimestamp,
    ),
  };
}

function buildGeminiAudioFileRef(file: {
  uri: string;
  mimeType: string;
  name?: string;
}): GeminiAudioFileRef {
  const createdAt = new Date();
  return {
    uri: file.uri,
    mimeType: file.mimeType,
    name: file.name,
    createdAt: createdAt.toISOString(),
    expiresAt: new Date(createdAt.getTime() + GEMINI_FILE_TTL_MS).toISOString(),
  };
}

export function isGeminiAudioFileExpired(
  audioFile: GeminiAudioFileRef | null | undefined,
  now = Date.now()
): boolean {
  if (!audioFile?.uri || !audioFile.mimeType) return true;
  if (!audioFile.expiresAt) return true;
  const expiresAt = Date.parse(audioFile.expiresAt);
  if (Number.isNaN(expiresAt)) return true;
  return expiresAt - GEMINI_FILE_EXPIRY_SAFETY_MS <= now;
}

export async function createGeminiAudioFileRef(params: {
  audioBuffer: Buffer;
  mimeType: string;
  fileName?: string;
}): Promise<GeminiAudioFileRef> {
  const uploadedFile = await uploadGeminiAudioFile(
    params.audioBuffer,
    params.mimeType,
    params.fileName ?? "recording"
  );
  return buildGeminiAudioFileRef(uploadedFile);
}

export async function chatWithAudioRecording(params: {
  insights: AudioInsights;
  messages: GeminiChatMessage[];
  model?: string;
}): Promise<string> {
  if (!params.insights.audioFile) {
    throw new Error("Audio file reference is not available for chat.");
  }

  const contextLines = [
    "You are a leasing tour coach with direct access to the session recording.",
    "Answer using what you hear in the audio — tone, pacing, pauses, and non-speech cues matter.",
    "Reference timestamps as MM:SS when helpful.",
    "",
    `Prior analysis summary: ${params.insights.summary}`,
  ];

  const messages = params.messages.map((message, index) => {
    if (index !== 0 || message.role !== "user") return message;
    return {
      ...message,
      content: `${contextLines.join("\n")}\n\nUser question: ${message.content}`,
    };
  });

  return geminiChatWithAudioFile({
    file: params.insights.audioFile,
    messages,
    model: params.model ?? params.insights.model,
  });
}
