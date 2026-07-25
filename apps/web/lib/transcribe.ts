import "server-only";

import {
  DEFAULT_TRANSCRIBE_PROVIDER,
  type TranscribeProviderId,
} from "@tour/shared";

export type TranscriptSegment = {
  id: string;
  speaker: string;
  startTime: number;
  endTime: number;
  text: string;
};

/**
 * Dispatch session transcription to the provider stored on the rubric.
 * New rubrics default to ElevenLabs Scribe. Provider modules fail explicitly when
 * their required credentials are missing rather than silently changing providers.
 */
export async function transcribeAudio(
  sessionId: string,
  audioBuffer: Buffer,
  mimeType: string,
  fileName?: string,
  provider: TranscribeProviderId = DEFAULT_TRANSCRIBE_PROVIDER,
): Promise<TranscriptSegment[]> {
  switch (provider) {
    case "deepgram": {
      const { transcribeWithDeepgram } = await import("./transcribe-deepgram");
      return transcribeWithDeepgram(sessionId, audioBuffer, mimeType);
    }
    case "elevenlabs": {
      const { transcribeWithElevenLabs } = await import("./transcribe-elevenlabs");
      return transcribeWithElevenLabs(sessionId, audioBuffer, mimeType, fileName);
    }
    case "gemini": {
      const { transcribeWithGemini } = await import("./transcribe-gemini");
      return transcribeWithGemini(sessionId, audioBuffer, mimeType, fileName);
    }
    case "aws": {
      const { transcribeWithAws } = await import("./transcribe-aws");
      return transcribeWithAws(sessionId, audioBuffer, mimeType);
    }
    case "whisper": {
      const { transcribeWithWhisper } = await import("./transcribe-whisper");
      return transcribeWithWhisper(sessionId, audioBuffer, mimeType, fileName);
    }
  }
}
