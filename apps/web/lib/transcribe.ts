import "server-only";

export type TranscriptSegment = {
  id: string;
  speaker: string;
  startTime: number;
  endTime: number;
  text: string;
};

/**
 * Transcription dispatcher. Four selectable providers:
 *  - "whisper" (default): original OpenAI pipeline — Whisper-1 + a separate LLM
 *    diarization call. Just OPENAI_API_KEY. Note: 25MB upload cap, diarization is
 *    an LLM guess.
 *  - "deepgram": hosted Deepgram nova-3, native diarization. Just DEEPGRAM_API_KEY.
 *    One fast request, no size cap.
 *  - "elevenlabs": ElevenLabs Scribe STT + native diarization. Just ELEVENLABS_API_KEY.
 *    One synchronous request, up to 5GB uploads.
 *  - "aws": AWS Transcribe batch, native diarization. Keeps audio in your AWS
 *    account (stages to S3, polls to completion). Needs IAM keys + TRANSCRIBE_S3_BUCKET.
 *
 * Select with TRANSCRIBE_PROVIDER=whisper|deepgram|elevenlabs|aws (defaults to whisper).
 * If the requested provider is missing credentials, falls back to the first
 * configured provider in order: deepgram → elevenlabs → whisper → aws.
 * Each provider module is dynamically imported so an unconfigured provider's deps
 * never affect the active path. Public signature is stable so /process is untouched.
 */
type TranscribeProvider = "whisper" | "deepgram" | "elevenlabs" | "aws";

function isProviderConfigured(provider: TranscribeProvider): boolean {
  switch (provider) {
    case "deepgram":
      return Boolean(process.env.DEEPGRAM_API_KEY?.trim());
    case "elevenlabs":
      return Boolean(process.env.ELEVENLABS_API_KEY?.trim());
    case "aws":
      return Boolean(
        process.env.TRANSCRIBE_S3_BUCKET?.trim() &&
          process.env.AWS_ACCESS_KEY_ID?.trim() &&
          process.env.AWS_SECRET_ACCESS_KEY?.trim()
      );
    case "whisper":
      return Boolean(process.env.OPENAI_API_KEY?.trim());
  }
}

function resolveTranscribeProvider(): TranscribeProvider {
  const requested = (process.env.TRANSCRIBE_PROVIDER || "whisper").toLowerCase();
  const requestedProvider =
    requested === "deepgram" ||
    requested === "elevenlabs" ||
    requested === "aws" ||
    requested === "whisper"
      ? requested
      : "whisper";

  if (isProviderConfigured(requestedProvider)) {
    return requestedProvider;
  }

  const fallbackOrder: TranscribeProvider[] = ["deepgram", "elevenlabs", "whisper", "aws"];
  const fallback = fallbackOrder.find((provider) => isProviderConfigured(provider));
  if (!fallback) {
    throw new Error(
      "No transcription provider is configured. Set DEEPGRAM_API_KEY, ELEVENLABS_API_KEY, OPENAI_API_KEY, or AWS Transcribe credentials (TRANSCRIBE_S3_BUCKET + AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY)."
    );
  }

  console.warn(
    `[transcribe] TRANSCRIBE_PROVIDER=${requestedProvider} is not configured; falling back to ${fallback}.`
  );
  return fallback;
}

export async function transcribeAudio(
  sessionId: string,
  audioBuffer: Buffer,
  mimeType: string,
  fileName?: string
): Promise<TranscriptSegment[]> {
  const provider = resolveTranscribeProvider();

  if (provider === "deepgram") {
    const { transcribeWithDeepgram } = await import("./transcribe-deepgram");
    return transcribeWithDeepgram(sessionId, audioBuffer, mimeType);
  }

  if (provider === "elevenlabs") {
    const { transcribeWithElevenLabs } = await import("./transcribe-elevenlabs");
    return transcribeWithElevenLabs(sessionId, audioBuffer, mimeType, fileName);
  }

  if (provider === "aws") {
    const { transcribeWithAws } = await import("./transcribe-aws");
    return transcribeWithAws(sessionId, audioBuffer, mimeType);
  }

  const { transcribeWithWhisper } = await import("./transcribe-whisper");
  return transcribeWithWhisper(sessionId, audioBuffer, mimeType, fileName);
}
