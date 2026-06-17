import "server-only";

export type TranscriptSegment = {
  id: string;
  speaker: string;
  startTime: number;
  endTime: number;
  text: string;
};

/**
 * Transcription dispatcher. Three selectable providers:
 *  - "whisper" (default): original OpenAI pipeline — Whisper-1 + a separate LLM
 *    diarization call. Just OPENAI_API_KEY. Note: 25MB upload cap, diarization is
 *    an LLM guess.
 *  - "deepgram": hosted Deepgram nova-3, native diarization. Just DEEPGRAM_API_KEY.
 *    One fast request, no size cap.
 *  - "aws": AWS Transcribe batch, native diarization. Keeps audio in your AWS
 *    account (stages to S3, polls to completion). Needs IAM keys + TRANSCRIBE_S3_BUCKET.
 *
 * Select with TRANSCRIBE_PROVIDER=whisper|deepgram|aws (defaults to whisper).
 * Each provider module is dynamically imported so an unconfigured provider's deps
 * never affect the active path. Public signature is stable so /process is untouched.
 */
export async function transcribeAudio(
  sessionId: string,
  audioBuffer: Buffer,
  mimeType: string
): Promise<TranscriptSegment[]> {
  const provider = (process.env.TRANSCRIBE_PROVIDER || "whisper").toLowerCase();

  if (provider === "deepgram") {
    const { transcribeWithDeepgram } = await import("./transcribe-deepgram");
    return transcribeWithDeepgram(sessionId, audioBuffer, mimeType);
  }

  if (provider === "aws") {
    const { transcribeWithAws } = await import("./transcribe-aws");
    return transcribeWithAws(sessionId, audioBuffer, mimeType);
  }

  const { transcribeWithWhisper } = await import("./transcribe-whisper");
  return transcribeWithWhisper(sessionId, audioBuffer, mimeType);
}
