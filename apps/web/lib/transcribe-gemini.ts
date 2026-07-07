import "server-only";

import { geminiGenerateJson, getGeminiConfig, parseGeminiTimestamp } from "./gemini-client";
import type { TranscriptSegment } from "./transcribe";

const TRANSCRIPT_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    segments: {
      type: "array",
      items: {
        type: "object",
        properties: {
          speaker: { type: "string" },
          timestamp: { type: "string", description: "Start time in MM:SS format" },
          endTimestamp: { type: "string", description: "End time in MM:SS format" },
          content: { type: "string" },
          language: { type: "string" },
        },
        required: ["speaker", "timestamp", "content"],
      },
    },
  },
  required: ["summary", "segments"],
} as const;

type GeminiTranscriptPayload = {
  summary: string;
  segments: Array<{
    speaker: string;
    timestamp: string;
    endTimestamp?: string;
    content: string;
    language?: string;
  }>;
};

const TRANSCRIPT_PROMPT = [
  "Transcribe this leasing conversation recording for a property tour coaching product.",
  "Identify distinct speakers (Agent, Prospect, or Speaker 1/2).",
  "Provide accurate MM:SS timestamps for each segment.",
  "Detect the spoken language per segment.",
  "Keep the transcript faithful to what was said.",
].join("\n");

/**
 * Gemini multimodal transcription with speaker diarization.
 * @see https://ai.google.dev/gemini-api/docs/audio
 */
export async function transcribeWithGemini(
  sessionId: string,
  audioBuffer: Buffer,
  mimeType: string,
  fileName?: string
): Promise<TranscriptSegment[]> {
  if (audioBuffer.length === 0) throw new Error("Empty audio buffer");

  const { model } = getGeminiConfig();
  const payload = await geminiGenerateJson<GeminiTranscriptPayload>({
    prompt: TRANSCRIPT_PROMPT,
    schema: TRANSCRIPT_SCHEMA,
    audioBuffer,
    mimeType,
    fileName,
    model,
  });

  const segments = payload.segments ?? [];
  if (!segments.length) throw new Error("Gemini returned no transcript segments");

  return segments.map((segment, index) => {
    const startTime = parseGeminiTimestamp(segment.timestamp);
    const endTime = segment.endTimestamp
      ? parseGeminiTimestamp(segment.endTimestamp)
      : startTime;

    return {
      id: `${sessionId}-t${index}`,
      speaker: segment.speaker.trim() || `Speaker ${index + 1}`,
      startTime,
      endTime: Math.max(endTime, startTime),
      text: segment.content.trim(),
    };
  });
}
