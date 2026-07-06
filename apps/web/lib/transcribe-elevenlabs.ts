import "server-only";

import { extensionFromMimeType, mimeTypeForExtension } from "./recording-format";
import type { TranscriptSegment } from "./transcribe";

const ELEVENLABS_STT_URL = "https://api.elevenlabs.io/v1/speech-to-text";

type ElevenLabsWord = {
  text: string;
  start: number | null;
  end: number | null;
  type: string;
  speaker_id: string | null;
};

type ElevenLabsChunk = {
  text: string;
  words: ElevenLabsWord[];
};

/**
 * ElevenLabs Scribe STT + native diarization. Just ELEVENLABS_API_KEY.
 * Uses scribe_v2 with diarize + detect_speaker_roles (agent/customer labels).
 */
export async function transcribeWithElevenLabs(
  sessionId: string,
  audioBuffer: Buffer,
  mimeType: string,
  fileName?: string
): Promise<TranscriptSegment[]> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY is not configured");
  if (audioBuffer.length === 0) throw new Error("Empty audio buffer");

  const modelId = process.env.ELEVENLABS_MODEL || "scribe_v2";
  const ext = fileName?.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase()
    ?? extensionFromMimeType(mimeType)
    ?? "mp3";
  const uploadMime = mimeTypeForExtension(ext);

  const formData = new FormData();
  const blob = new Blob([new Uint8Array(audioBuffer)], { type: uploadMime });
  formData.append("file", blob, `recording.${ext}`);
  formData.append("model_id", modelId);
  formData.append("diarize", "true");
  formData.append("detect_speaker_roles", "true");
  formData.append("timestamps_granularity", "word");

  const languageCode = process.env.ELEVENLABS_LANGUAGE_CODE?.trim();
  if (languageCode) formData.append("language_code", languageCode);

  const numSpeakers = process.env.ELEVENLABS_NUM_SPEAKERS?.trim();
  if (numSpeakers) formData.append("num_speakers", numSpeakers);

  const response = await fetch(ELEVENLABS_STT_URL, {
    method: "POST",
    headers: { "xi-api-key": apiKey },
    body: formData
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`ElevenLabs STT error ${response.status}: ${errText}`);
  }

  const payload = (await response.json()) as Record<string, unknown>;
  const chunk = extractChunk(payload);
  if (!chunk) throw new Error("ElevenLabs returned no transcript");

  const grouped = groupWordsIntoSegments(chunk.words);
  if (!grouped.length) {
    const text = chunk.text.trim();
    if (!text) throw new Error("ElevenLabs returned no words");
    return [{
      id: `${sessionId}-t0`,
      speaker: "Unknown",
      startTime: 0,
      endTime: 0,
      text
    }];
  }

  const labels = labelSpeakers(grouped);
  return grouped.map((segment, i) => ({
    id: `${sessionId}-t${i}`,
    speaker: labels.get(segment.speakerId) ?? "Unknown",
    startTime: Math.round(segment.start),
    endTime: Math.round(segment.end),
    text: segment.text.trim()
  }));
}

function extractChunk(payload: Record<string, unknown>): ElevenLabsChunk | null {
  if (Array.isArray(payload.words)) {
    return {
      text: typeof payload.text === "string" ? payload.text : "",
      words: payload.words as ElevenLabsWord[]
    };
  }

  if (Array.isArray(payload.transcripts)) {
    const transcripts = payload.transcripts as ElevenLabsChunk[];
    if (transcripts.length === 1) return transcripts[0]!;

    const words = transcripts
      .flatMap((t) => t.words ?? [])
      .sort((a, b) => (a.start ?? 0) - (b.start ?? 0));
    const text = transcripts.map((t) => t.text).filter(Boolean).join("\n");
    return { text, words };
  }

  return null;
}

type GroupedSegment = {
  speakerId: string;
  start: number;
  end: number;
  text: string;
};

function groupWordsIntoSegments(words: ElevenLabsWord[]): GroupedSegment[] {
  const segments: GroupedSegment[] = [];

  for (const word of words) {
    if (word.type !== "word") continue;

    const speakerId = word.speaker_id ?? "unknown";
    const start = word.start ?? 0;
    const end = word.end ?? start;
    const last = segments[segments.length - 1];

    if (last && last.speakerId === speakerId) {
      last.text = `${last.text} ${word.text}`;
      last.end = end;
    } else {
      segments.push({ speakerId, start, end, text: word.text });
    }
  }

  return segments;
}

function labelSpeakers(segments: GroupedSegment[]): Map<string, string> {
  const labels = new Map<string, string>();

  for (const segment of segments) {
    if (labels.has(segment.speakerId)) continue;
    labels.set(segment.speakerId, mapSpeakerRole(segment.speakerId));
  }

  const unmapped = segments.filter((s) => labels.get(s.speakerId) === "Unknown");
  if (unmapped.length === 0) return labels;

  const talkTime = new Map<string, number>();
  for (const segment of unmapped) {
    talkTime.set(
      segment.speakerId,
      (talkTime.get(segment.speakerId) ?? 0) + Math.max(0, segment.end - segment.start)
    );
  }

  const ranked = [...talkTime.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
  ranked.forEach((speakerId, rank) => {
    labels.set(
      speakerId,
      rank === 0 ? "Agent" : rank === 1 ? "Prospect" : `Speaker ${rank + 1}`
    );
  });

  return labels;
}

function mapSpeakerRole(speakerId: string): string {
  switch (speakerId.toLowerCase()) {
    case "agent":
      return "Agent";
    case "customer":
      return "Prospect";
    default:
      return "Unknown";
  }
}
