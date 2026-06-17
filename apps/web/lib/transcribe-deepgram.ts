import "server-only";

import type { TranscriptSegment } from "./transcribe";

/**
 * Hosted Deepgram (nova-3) transcription + native diarization. Lowest-setup
 * provider: just DEEPGRAM_API_KEY. One fast synchronous request, no size cap.
 */
export async function transcribeWithDeepgram(
  sessionId: string,
  audioBuffer: Buffer,
  mimeType: string
): Promise<TranscriptSegment[]> {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) throw new Error("DEEPGRAM_API_KEY is not configured");
  if (audioBuffer.length === 0) throw new Error("Empty audio buffer");

  const model = process.env.DEEPGRAM_MODEL || "nova-3";
  const params = new URLSearchParams({
    model,
    diarize: "true",
    punctuate: "true",
    smart_format: "true",
    utterances: "true"
  });

  const response = await fetch(`https://api.deepgram.com/v1/listen?${params.toString()}`, {
    method: "POST",
    headers: {
      Authorization: `Token ${apiKey}`,
      "Content-Type": mimeType || "audio/mpeg"
    },
    body: new Uint8Array(audioBuffer)
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Deepgram API error ${response.status}: ${errText}`);
  }

  const payload = (await response.json()) as {
    results?: {
      utterances?: Array<{ start: number; end: number; transcript: string; speaker?: number }>;
      channels?: Array<{ alternatives?: Array<{ transcript?: string }> }>;
    };
  };

  const utterances = payload.results?.utterances;
  let parsed: Array<{ start: number; end: number; transcript: string; speaker: number }>;

  if (utterances?.length) {
    parsed = utterances.map((u) => ({
      start: u.start,
      end: u.end,
      transcript: u.transcript,
      speaker: u.speaker ?? 0
    }));
  } else {
    const flat = payload.results?.channels?.[0]?.alternatives?.[0]?.transcript;
    if (!flat) throw new Error("Deepgram returned no utterances");
    parsed = [{ start: 0, end: 0, transcript: flat, speaker: 0 }];
  }

  const labels = labelSpeakers(parsed);
  return parsed.map((u, i) => ({
    id: `${sessionId}-t${i}`,
    speaker: labels.get(u.speaker) ?? "Unknown",
    startTime: Math.round(u.start),
    endTime: Math.round(u.end),
    text: u.transcript.trim()
  }));
}

/** Most talk-time → Agent, next → Prospect, others numbered. (Tours are agent-dominant.) */
function labelSpeakers(utterances: Array<{ speaker: number; start: number; end: number }>): Map<number, string> {
  const talkTime = new Map<number, number>();
  for (const u of utterances) {
    talkTime.set(u.speaker, (talkTime.get(u.speaker) ?? 0) + Math.max(0, u.end - u.start));
  }
  const ranked = [...talkTime.entries()].sort((a, b) => b[1] - a[1]).map(([s]) => s);
  const labels = new Map<number, string>();
  ranked.forEach((speaker, rank) => {
    labels.set(speaker, rank === 0 ? "Agent" : rank === 1 ? "Prospect" : `Speaker ${rank + 1}`);
  });
  return labels;
}
