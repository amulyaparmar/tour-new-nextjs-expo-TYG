import {
  analyzeAudioInsightsStep,
  finalizeAudioInsightsStep,
  identifyAudioParticipantsStep,
  markAudioInsightsFailedStep,
} from "./steps/audio-insights-steps";

export async function processAudioInsightsWorkflow(sessionId: string) {
  "use workflow";

  try {
    const audioInsights = await analyzeAudioInsightsStep(sessionId);
    const participants = await identifyAudioParticipantsStep(sessionId);
    await finalizeAudioInsightsStep(sessionId);
    return { ...audioInsights, participants };
  } catch (error) {
    await markAudioInsightsFailedStep(
      sessionId,
      error instanceof Error ? error.message : "Audio insights workflow failed."
    );
    throw error;
  }
}
