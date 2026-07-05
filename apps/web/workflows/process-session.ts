import {
  analyzeSessionStep,
  extractScreenshotsStep,
  finalizeSessionStep,
  followUpActionsStep,
  markSessionFailedStep,
  segmentPhasesStep,
  transcribeSessionStep
} from "./steps/process-session-steps";

export async function processSessionWorkflow(sessionId: string) {
  "use workflow";

  try {
    const { segmentCount: transcriptSegments } = await transcribeSessionStep(sessionId);
    await segmentPhasesStep(sessionId);
    const { overallScore } = await analyzeSessionStep(sessionId);
    await extractScreenshotsStep(sessionId);
    const { actionsGenerated } = await followUpActionsStep(sessionId);
    await finalizeSessionStep(sessionId);

    return {
      ok: true,
      overallScore,
      transcriptSegments,
      actionsGenerated
    };
  } catch (error) {
    await markSessionFailedStep(sessionId);
    throw error;
  }
}
