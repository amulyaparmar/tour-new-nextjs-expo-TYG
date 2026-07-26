import {
  analyzeSessionStep,
  applySessionRubricStep,
  finalizeSessionStep,
  followUpActionsStep,
  markReanalysisFailedStep,
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
    // Participant identity belongs to the recording, not the selected scoring
    // rubric. Preserve the initial/Gemini-resolved names and inferred title
    // while creating a new rubric analysis version.
    const { overallScore } = await analyzeSessionStep(sessionId, false);
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
    await markReanalysisFailedStep(
      sessionId,
      error instanceof Error ? error.message : "Session re-analysis workflow failed."
    );
    throw error;
  }
}
