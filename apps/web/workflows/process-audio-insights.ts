import {
  analyzeAudioInsightsStep,
  markAudioInsightsFailedStep,
} from "./steps/audio-insights-steps";

export async function processAudioInsightsWorkflow(sessionId: string) {
  "use workflow";

  try {
    return await analyzeAudioInsightsStep(sessionId);
  } catch (error) {
    await markAudioInsightsFailedStep(sessionId);
    throw error;
  }
}
