import "server-only";

export type TranscriptSegment = {
  id: string;
  speaker: string;
  startTime: number;
  endTime: number;
  text: string;
};

/**
 * Production transcription is intentionally fixed to ElevenLabs Scribe.
 * Gemini is reserved for the independent post-analysis audio-insights workflow.
 * If ElevenLabs is not configured, fail closed instead of silently changing providers.
 */
export async function transcribeAudio(
  sessionId: string,
  audioBuffer: Buffer,
  mimeType: string,
  fileName?: string
): Promise<TranscriptSegment[]> {
  const { transcribeWithElevenLabs } = await import("./transcribe-elevenlabs");
  return transcribeWithElevenLabs(sessionId, audioBuffer, mimeType, fileName);
}
