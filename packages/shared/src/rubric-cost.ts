import { getAnalysisModel, type AnalysisModelId } from "./ai-models";
import type { GeminiAudioModelId } from "./gemini-models";
import type { AudioAnalysisMode } from "./rubric";
import type { TranscribeProviderId } from "./transcribe-providers";

/** Current standard public list prices, verified 2026-08-06. */
const TRANSCRIPTION_USD_PER_MINUTE: Record<TranscribeProviderId, number> = {
  // Whisper API's published rate.
  whisper: 0.006,
  // Nova-3 monolingual pre-recorded; diarization is included.
  deepgram: 0.0048,
  // Scribe v2 ($0.22/hr) with ElevenLabs role detection (+10%).
  elevenlabs: 0.00403,
  // Calculated with Gemini 3.6 Flash's standard rate and expected transcript output.
  gemini: 0.00393,
  aws: 0.024,
};

const GEMINI_AUDIO_PRICING: Record<GeminiAudioModelId, {
  inputUsdPerMillionTokens: number;
  outputUsdPerMillionTokens: number;
}> = {
  "gemini-3.6-flash": { inputUsdPerMillionTokens: 1.5, outputUsdPerMillionTokens: 7.5 },
  "gemini-3.5-flash": { inputUsdPerMillionTokens: 1.5, outputUsdPerMillionTokens: 9 },
  "gemini-2.5-flash": { inputUsdPerMillionTokens: 1, outputUsdPerMillionTokens: 2.5 },
  "gemini-2.5-pro": { inputUsdPerMillionTokens: 1.25, outputUsdPerMillionTokens: 10 },
};

const GEMINI_AUDIO_INPUT_TOKENS_PER_MINUTE = 1_920;
const AUDIO_INSIGHTS_OUTPUT_TOKENS_PER_MINUTE = 120;
const TEXT_ANALYSIS_TOKENS_PER_AUDIO_MINUTE = { input: 300, output: 120 };
const NAME_EXTRACTION_TOKENS_PER_AUDIO_MINUTE = { input: 140, output: 24 };

export type RubricCostEstimate = {
  transcriptionUsdPerMinute: number;
  textAnalysisUsdPerMinute: number;
  nameExtractionUsdPerMinute: number;
  audioUnderstandingUsdPerMinute: number;
  totalUsdPerMinute: number;
};

function modelTextCostPerMinute(
  modelId: AnalysisModelId,
  tokens: { input: number; output: number },
): number {
  const model = getAnalysisModel(modelId);
  const input = (tokens.input / 1_000_000) * model.inputUsdPerMillionTokens;
  const output = (tokens.output / 1_000_000) * model.outputUsdPerMillionTokens;
  return input + output;
}

function geminiAudioCostPerMinute(modelId: GeminiAudioModelId): number {
  const pricing = GEMINI_AUDIO_PRICING[modelId];
  return (
    (GEMINI_AUDIO_INPUT_TOKENS_PER_MINUTE / 1_000_000) * pricing.inputUsdPerMillionTokens
    + (AUDIO_INSIGHTS_OUTPUT_TOKENS_PER_MINUTE / 1_000_000) * pricing.outputUsdPerMillionTokens
  );
}

export function estimateRubricCostPerAudioMinute(config: {
  transcribeProvider: TranscribeProviderId;
  analysisModel: AnalysisModelId;
  nameExtractionModel: AnalysisModelId;
  audioAnalysisModel: GeminiAudioModelId;
  audioAnalysisModes: readonly AudioAnalysisMode[];
}): RubricCostEstimate {
  const transcriptionUsdPerMinute = TRANSCRIPTION_USD_PER_MINUTE[config.transcribeProvider];
  const textAnalysisUsdPerMinute = modelTextCostPerMinute(
    config.analysisModel,
    TEXT_ANALYSIS_TOKENS_PER_AUDIO_MINUTE,
  );
  const nameExtractionUsdPerMinute = modelTextCostPerMinute(
    config.nameExtractionModel,
    NAME_EXTRACTION_TOKENS_PER_AUDIO_MINUTE,
  );
  const audioUnderstandingUsdPerMinute = config.audioAnalysisModes.length
    ? geminiAudioCostPerMinute(config.audioAnalysisModel)
    : 0;
  const totalUsdPerMinute = transcriptionUsdPerMinute
    + textAnalysisUsdPerMinute
    + nameExtractionUsdPerMinute
    + audioUnderstandingUsdPerMinute;

  return {
    transcriptionUsdPerMinute,
    textAnalysisUsdPerMinute,
    nameExtractionUsdPerMinute,
    audioUnderstandingUsdPerMinute,
    totalUsdPerMinute,
  };
}
