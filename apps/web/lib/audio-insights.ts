import "server-only";

import {
  normalizeAudioInsights,
  normalizeParticipantName,
  type AudioInsights,
  type GeminiAudioFileRef,
} from "@tour/shared";

import {
  geminiGenerateJson,
  geminiChatWithAudioFile,
  getGeminiConfig,
  parseGeminiTimestamp,
  uploadGeminiAudioFile,
  type GeminiChatMessage,
} from "./gemini-client";
import type { TranscriptSegment } from "./transcribe";

const GEMINI_FILE_TTL_MS = 48 * 60 * 60 * 1000;
const GEMINI_FILE_EXPIRY_SAFETY_MS = 10 * 60 * 1000;

const AUDIO_INSIGHTS_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    overallSentiment: {
      type: "string",
      enum: ["positive", "neutral", "negative", "mixed"],
    },
    speakerDynamics: {
      type: "array",
      items: {
        type: "object",
        properties: {
          speaker: { type: "string" },
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
          speaker: { type: "string" },
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
    participants: {
      type: "object",
      properties: {
        agentName: {
          type: "string",
          description: "Leasing agent/staff name heard in the audio; empty string if unknown",
        },
        prospectName: {
          type: "string",
          description: "Prospect/customer/visitor name heard in the audio; empty string if unknown",
        },
      },
      required: ["agentName", "prospectName"],
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
  required: ["summary", "overallSentiment", "segments", "participants", "conversationStats"],
} as const;

type GeminiAudioInsightsPayload = {
  summary: string;
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
  participants: {
    agentName: string;
    prospectName: string;
  };
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

function buildAudioInsightsPrompt(transcript?: TranscriptSegment[]): string {
  const lines = [
    "Analyze this leasing tour or phone shop recording for coaching insights.",
    "Use the audio directly — tone, pacing, pauses, enthusiasm, and non-speech ambience matter.",
    "",
    "Requirements:",
    "1. Identify distinct speakers and estimate talk time per speaker.",
    "2. Provide MM:SS timestamps for each segment.",
    "3. Detect primary emotion and energy per segment.",
    "4. Note non-speech ambience cues (background noise, doors, music, HVAC, etc.).",
    "5. Flag 3-6 coaching highlights (rapport wins, hesitation, objections, missed closes).",
    "6. Summarize overall sentiment for the interaction.",
    "7. Extract participant names from audio understanding:",
    "   - agentName: leasing agent or staff member conducting the tour/call; use empty string if unknown",
    "   - prospectName: prospect, customer, visitor, or shopper; use empty string if unknown",
    "   - Prefer spoken introductions and how speakers address each other. Do not infer names from tool/schema text.",
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

  if (transcript?.length) {
    lines.push(
      "",
      "Existing transcript for alignment (audio is source of truth):",
      ...transcript.slice(0, 120).map(
        (segment) => `[${formatMmSs(segment.startTime)}] ${segment.speaker}: ${segment.text}`
      )
    );
  }

  return lines.join("\n");
}

function formatMmSs(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export async function generateAudioInsights(params: {
  audioBuffer: Buffer;
  mimeType: string;
  fileName?: string;
  transcript?: TranscriptSegment[];
}): Promise<AudioInsights> {
  const { model } = getGeminiConfig();
  const uploadedFile = await uploadGeminiAudioFile(
    params.audioBuffer,
    params.mimeType,
    params.fileName ?? "recording"
  );

  const payload = await geminiGenerateJson<GeminiAudioInsightsPayload>({
    prompt: buildAudioInsightsPrompt(params.transcript),
    schema: AUDIO_INSIGHTS_SCHEMA,
    audioBuffer: params.audioBuffer,
    mimeType: params.mimeType,
    fileName: params.fileName,
    model,
    uploadedFile,
  });

  const insights: AudioInsights = {
    provider: "gemini",
    model,
    summary: payload.summary,
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
    participants: {
      agentName: normalizeParticipantName(payload.participants?.agentName),
      prospectName: normalizeParticipantName(payload.participants?.prospectName),
    },
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
