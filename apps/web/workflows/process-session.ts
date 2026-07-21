import {
  analyzeSessionStep,
  finalizeSessionStep,
  followUpActionsStep,
  markSessionFailedStep,
  segmentPhasesStep,
  startAudioInsightsAfterAnalysisStep,
  transcribeSessionStep
} from "./steps/process-session-steps";

export async function processSessionWorkflow(sessionId: string) {
  "use workflow";

  let result: {
    ok: true;
    overallScore: number;
    transcriptSegments: number;
    actionsGenerated: number;
  };

  try {
    const { segmentCount: transcriptSegments } = await transcribeSessionStep(sessionId);
    await segmentPhasesStep(sessionId);
    const { overallScore } = await analyzeSessionStep(sessionId);
    const { actionsGenerated } = await followUpActionsStep(sessionId);
    await finalizeSessionStep(sessionId);

    result = {
      ok: true,
      overallScore,
      transcriptSegments,
      actionsGenerated,
    };
  } catch (error) {
    await markSessionFailedStep(sessionId);
    throw error;
  }

  const audioInsights = await startAudioInsightsAfterAnalysisStep(sessionId);
  return { ...result, audioInsights };
}
