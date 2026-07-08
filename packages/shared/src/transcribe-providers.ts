export type TranscribeProviderId = "whisper" | "deepgram" | "elevenlabs" | "gemini" | "aws";

export type TranscribeProvider = {
  id: TranscribeProviderId;
  label: string;
  description: string;
  /** Supports Gemini multimodal audio understanding (sentiment, emotion, ambience). */
  supportsAudioUnderstanding: boolean;
};

export const TRANSCRIBE_PROVIDERS: readonly TranscribeProvider[] = [
  {
    id: "whisper",
    label: "OpenAI Whisper",
    description: "Whisper-1 STT with LLM diarization. Requires OPENAI_API_KEY.",
    supportsAudioUnderstanding: false,
  },
  {
    id: "deepgram",
    label: "Deepgram",
    description: "Nova-3 hosted STT with native diarization. Requires DEEPGRAM_API_KEY.",
    supportsAudioUnderstanding: false,
  },
  {
    id: "elevenlabs",
    label: "ElevenLabs Scribe",
    description: "Scribe v2 STT with agent/customer role detection (Agent/Prospect labels). Requires ELEVENLABS_API_KEY.",
    supportsAudioUnderstanding: false,
  },
  {
    id: "gemini",
    label: "Google Gemini",
    description: "Multimodal audio transcription plus optional sentiment and ambience insights. Requires GEMINI_API_KEY.",
    supportsAudioUnderstanding: true,
  },
  {
    id: "aws",
    label: "AWS Transcribe",
    description: "Batch transcription via S3. Requires AWS Transcribe credentials.",
    supportsAudioUnderstanding: false,
  },
] as const;

export const DEFAULT_TRANSCRIBE_PROVIDER: TranscribeProviderId = "whisper";

const PROVIDER_BY_ID = new Map(TRANSCRIBE_PROVIDERS.map((provider) => [provider.id, provider]));

export function isTranscribeProviderId(value: string): value is TranscribeProviderId {
  return PROVIDER_BY_ID.has(value as TranscribeProviderId);
}

export function getTranscribeProvider(id: TranscribeProviderId): TranscribeProvider {
  const provider = PROVIDER_BY_ID.get(id);
  if (!provider) throw new Error(`Unknown transcribe provider: ${id}`);
  return provider;
}

export function normalizeTranscribeProviderId(
  value: unknown,
  fallback: TranscribeProviderId = DEFAULT_TRANSCRIBE_PROVIDER
): TranscribeProviderId {
  if (typeof value === "string" && isTranscribeProviderId(value)) return value;
  return fallback;
}

export function transcribeProviderSupportsAudioUnderstanding(id: TranscribeProviderId): boolean {
  return getTranscribeProvider(id).supportsAudioUnderstanding;
}
