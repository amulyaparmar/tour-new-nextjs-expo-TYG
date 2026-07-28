const PROVIDER_ERROR_PATTERN =
  /\b(ElevenLabs|Deepgram|Gemini|OpenAI|Bedrock|Anthropic|Whisper|Transcribe|Scribe|Google|AWS)\b/i;

const CONFIG_ERROR_PATTERN =
  /(api[_\s-]?key|not configured|missing|credential|unauthorized|forbidden|permission|service role|bearer token)/i;

const NO_SPEECH_PATTERN =
  /(no speech|detect any speech|no words|no utterances|no transcript|empty transcript)/i;

const TRANSCRIPTION_ERROR_PATTERN =
  /(dictation|transcri|speech-to-text|stt|audio recording|audio file)/i;

export function safeDictationError(error: unknown) {
  const message = errorMessage(error);

  if (CONFIG_ERROR_PATTERN.test(message)) {
    return "Voice input is not configured.";
  }
  if (NO_SPEECH_PATTERN.test(message)) {
    return "We couldn't detect speech in that recording. Try again closer to the mic.";
  }
  if (PROVIDER_ERROR_PATTERN.test(message) || TRANSCRIPTION_ERROR_PATTERN.test(message)) {
    return "Voice input could not be transcribed. Please try again.";
  }

  return message || "Voice input could not be transcribed. Please try again.";
}

export function safeAiChatError(error: unknown) {
  const message = errorMessage(error);

  if (NO_SPEECH_PATTERN.test(message)) {
    return "We couldn't detect usable speech in that recording yet.";
  }
  if (CONFIG_ERROR_PATTERN.test(message)) {
    return "The AI assistant is not configured.";
  }
  if (PROVIDER_ERROR_PATTERN.test(message)) {
    return "The AI assistant could not respond. Please try again.";
  }

  return message || "The AI assistant could not respond. Please try again.";
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "";
}
