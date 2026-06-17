import "server-only";

import type { TranscriptSegment } from "./transcribe";

/**
 * Original OpenAI pipeline: Whisper-1 for transcription + a separate LLM call for
 * speaker diarization. Kept as a selectable provider (TRANSCRIBE_PROVIDER=whisper).
 * Note: Whisper has a 25MB upload cap and the diarization is an LLM guess — prefer
 * deepgram/aws for long or multi-speaker tours.
 */
export async function transcribeWithWhisper(
  sessionId: string,
  audioBuffer: Buffer,
  mimeType: string
): Promise<TranscriptSegment[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");
  if (audioBuffer.length === 0) throw new Error("Empty audio buffer");

  const rawSegments = await whisperTranscribe(apiKey, audioBuffer, mimeType);
  if (!rawSegments.length) throw new Error("Whisper returned no segments");

  const diarized = await diarizeWithLLM(apiKey, rawSegments);
  return diarized.map((seg, i) => ({
    id: `${sessionId}-t${i}`,
    speaker: seg.speaker,
    startTime: Math.round(seg.start),
    endTime: Math.round(seg.end),
    text: seg.text.trim()
  }));
}

type RawSegment = { start: number; end: number; text: string };

async function whisperTranscribe(
  apiKey: string,
  audioBuffer: Buffer,
  mimeType: string
): Promise<RawSegment[]> {
  const ext = mimeType.includes("mp4") ? "mp4"
    : mimeType.includes("webm") ? "webm"
    : mimeType.includes("m4a") ? "m4a"
    : mimeType.includes("wav") ? "wav"
    : "mp3";

  const formData = new FormData();
  const blob = new Blob([new Uint8Array(audioBuffer)], { type: mimeType || "audio/mpeg" });
  formData.append("file", blob, `recording.${ext}`);
  formData.append("model", "whisper-1");
  formData.append("response_format", "verbose_json");
  formData.append("timestamp_granularities[]", "segment");

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Whisper API error ${response.status}: ${errText}`);
  }

  const payload = await response.json() as {
    segments?: Array<{ id: number; start: number; end: number; text: string }>;
    text?: string;
  };

  if (payload.segments?.length) {
    return payload.segments.map((s) => ({ start: s.start, end: s.end, text: s.text }));
  }

  if (payload.text) {
    return [{ start: 0, end: 60, text: payload.text }];
  }

  return [];
}

async function diarizeWithLLM(
  apiKey: string,
  segments: RawSegment[]
): Promise<Array<{ speaker: string; start: number; end: number; text: string }>> {
  const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";

  const transcript = segments
    .map((s, i) => `[${i}] (${s.start.toFixed(1)}s-${s.end.toFixed(1)}s): ${s.text.trim()}`)
    .join("\n");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: [
            "You are a speaker diarization assistant for apartment tour recordings.",
            "Given timestamped transcript segments, identify distinct speakers.",
            "Typical speakers: Leasing Agent, Prospect/Customer, Manager, etc.",
            "Use context clues: questions about the property suggest Prospect, answers/explanations suggest Agent.",
            "",
            "Return JSON: { \"segments\": [ { \"index\": 0, \"speaker\": \"Agent\" }, ... ] }",
            "Use short labels: Agent, Prospect, Manager, Unknown."
          ].join("\n")
        },
        { role: "user", content: transcript }
      ]
    })
  });

  if (!res.ok) {
    console.error("Diarization LLM error:", res.status);
    return segments.map((seg, i) => ({
      speaker: i % 2 === 0 ? "Agent" : "Prospect",
      start: seg.start,
      end: seg.end,
      text: seg.text
    }));
  }

  const data = await res.json() as {
    choices?: Array<{ message: { content: string } }>;
  };

  const parsed = JSON.parse(data?.choices?.[0]?.message?.content ?? "{}") as {
    segments?: Array<{ index: number; speaker: string }>;
  };

  return segments.map((seg, i) => ({
    speaker: parsed.segments?.find((d) => d.index === i)?.speaker ?? "Unknown",
    start: seg.start,
    end: seg.end,
    text: seg.text
  }));
}
