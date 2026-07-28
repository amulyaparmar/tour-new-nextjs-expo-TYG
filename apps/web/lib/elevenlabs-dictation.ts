import "server-only";

const ELEVENLABS_STT_URL = "https://api.elevenlabs.io/v1/speech-to-text";

type ElevenLabsDictationResponse = {
  text?: unknown;
  transcripts?: Array<{ text?: unknown }>;
};

export async function transcribeDictationWithElevenLabs(
  audio: Blob,
  fileName = "dictation.webm"
): Promise<string> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error("ELEVENLABS_API_KEY is not configured.");
  }
  if (audio.size === 0) {
    throw new Error("The dictation recording is empty.");
  }

  const formData = new FormData();
  formData.append("file", audio, fileName);
  formData.append(
    "model_id",
    process.env.ELEVENLABS_DICTATION_MODEL?.trim()
      || process.env.ELEVENLABS_MODEL?.trim()
      || "scribe_v2"
  );
  formData.append("diarize", "false");
  formData.append("tag_audio_events", "false");

  const response = await fetch(ELEVENLABS_STT_URL, {
    method: "POST",
    headers: { "xi-api-key": apiKey },
    body: formData,
    signal: AbortSignal.timeout(60_000),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`ElevenLabs dictation failed (${response.status}): ${detail}`);
  }

  const payload = (await response.json()) as ElevenLabsDictationResponse;
  const text =
    typeof payload.text === "string"
      ? payload.text.trim()
      : payload.transcripts
          ?.map((transcript) => typeof transcript.text === "string" ? transcript.text.trim() : "")
          .filter(Boolean)
          .join(" ")
          .trim();

  if (!text) {
    throw new Error("ElevenLabs could not detect any speech.");
  }

  return text;
}
