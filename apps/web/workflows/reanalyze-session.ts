import {
  analyzeSessionStep,
  applySessionRubricStep,
  finalizeSessionStep,
  followUpActionsStep,
  markSessionFailedStep,
  segmentPhasesStep,
} from "./steps/process-session-steps";

export async function reanalyzeSessionWorkflow(
  sessionId: string,
  rubricId: string,
  resegment: boolean,
) {
  "use workflow";

  try {
    await applySessionRubricStep(sessionId, rubricId);
    if (resegment) {
      await segmentPhasesStep(sessionId);
    }
    const { overallScore } = await analyzeSessionStep(sessionId);
    const { actionsGenerated } = await followUpActionsStep(sessionId);
    await finalizeSessionStep(sessionId);

    return {
      ok: true,
      overallScore,
      actionsGenerated,
      rubricId,
      resegment,
    };
  } catch (error) {
    await markSessionFailedStep(sessionId);
    throw error;
  }
}
