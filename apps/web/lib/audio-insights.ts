import "server-only";

import {
  normalizeAudioInsights,
  type AudioInsights,
} from "@tour/shared";

import { geminiGenerateJson, getGeminiConfig, parseGeminiTimestamp } from "./gemini-client";
import type { TranscriptSegment } from "./transcribe";

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
  },
  required: ["summary", "overallSentiment", "segments"],
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
  const payload = await geminiGenerateJson<GeminiAudioInsightsPayload>({
    prompt: buildAudioInsightsPrompt(params.transcript),
    schema: AUDIO_INSIGHTS_SCHEMA,
    audioBuffer: params.audioBuffer,
    mimeType: params.mimeType,
    fileName: params.fileName,
    model,
  });

  const insights: AudioInsights = {
    provider: "gemini",
    model,
    summary: payload.summary,
    overallSentiment: payload.overallSentiment,
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
  };

  const normalized = normalizeAudioInsights(insights);
  if (!normalized) throw new Error("Gemini audio insights failed normalization");
  return normalized;
}
