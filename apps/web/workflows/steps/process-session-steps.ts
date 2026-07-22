import { FatalError } from "workflow";

import { generateAnalysis, generateFollowUpActions } from "@/lib/analysis";
import { segmentConversationPhases } from "@/lib/conversation-phases";
import { resolveRubricForReanalysis } from "@/lib/reanalyze-session";
import { createMaterial, findMaterialBySessionId } from "@/lib/materials";
import { getRubricForSession } from "@/lib/rubrics";
import {
  getAnalysisBySessionId,
  getSessionById,
  getTranscript,
  replaceFollowUpActions,
  saveConversationPhases,
  saveTranscript,
  setSessionStatus,
  updateSession,
  upsertAnalysis
} from "@/lib/sessions";
import { transcribeAudio } from "@/lib/transcribe";
import { fetchRecordingFile } from "@/lib/storage";
import { startAudioInsightsWorkflow } from "@/lib/start-audio-insights-workflow";
import { deriveSessionTitleFromParticipants } from "@/lib/session-naming";

export async function transcribeSessionStep(sessionId: string) {
  "use step";

  await setSessionStatus(sessionId, "transcribing");
  const session = await getSessionById(sessionId);
  if (!session) throw new FatalError("Session not found.");

  const file = await fetchRecordingFile(sessionId);
  if (!file) throw new FatalError("No recording found in storage for this session.");

  const transcript = await transcribeAudio(
    sessionId,
    file.buffer,
    file.mimeType,
    file.fileName,
  );
  await saveTranscript(
    sessionId,
    transcript.map((seg) => ({ ...seg, sessionId }))
  );

  return { segmentCount: transcript.length };
}

export async function applySessionRubricStep(sessionId: string, rubricId: string) {
  "use step";

  const session = await getSessionById(sessionId);
  if (!session) throw new FatalError("Session not found.");

  const rubric = await resolveRubricForReanalysis(session, rubricId);
  if (rubric.id !== session.rubricId) {
    await updateSession(sessionId, { rubricId: rubric.id });
  }

  return { rubricId: rubric.id };
}

export async function segmentPhasesStep(sessionId: string) {
  "use step";

  await setSessionStatus(sessionId, "segmenting");
  const session = await getSessionById(sessionId);
  if (!session) throw new FatalError("Session not found.");

  const transcript = await getTranscript(sessionId);
  const rubric = await getRubricForSession(session.rubricId, session.propertyId);
  const { segmentation } = await segmentConversationPhases(transcript, {
    segmentationPrompt: rubric.segmentationPrompt,
    sessionType: rubric.sessionType,
  });
  await saveConversationPhases(sessionId, segmentation);

  return { spanCount: segmentation.spans.length };
}

export async function analyzeSessionStep(sessionId: string) {
  "use step";

  await setSessionStatus(sessionId, "analyzing");
  const session = await getSessionById(sessionId);
  if (!session) throw new FatalError("Session not found.");

  const transcript = await getTranscript(sessionId);
  const rubric = await getRubricForSession(session.rubricId, session.propertyId);
  const analysis = await generateAnalysis({
    title: session.title,
    prospectName: session.prospectName,
    location: session.location,
    notes: session.notes,
    transcript,
    rubricDefinition: rubric.definition,
    analysisModel: rubric.analysisModel,
    analysisPrompt: rubric.analysisPrompt,
    sessionType: rubric.sessionType,
  });

  await upsertAnalysis(sessionId, analysis, {
    rubricId: rubric.id,
    rubricName: rubric.name,
  });

  const nameUpdates: { agentName?: string; prospectName?: string; title?: string } = {};
  if (!session.agentName && analysis.participantNames?.agentName) {
    nameUpdates.agentName = analysis.participantNames.agentName;
  }
  if (!session.prospectName && analysis.participantNames?.prospectName) {
    nameUpdates.prospectName = analysis.participantNames.prospectName;
  }
  const derivedTitle = deriveSessionTitleFromParticipants({
    currentTitle: session.title,
    agentName: nameUpdates.agentName ?? session.agentName,
    prospectName: nameUpdates.prospectName ?? session.prospectName,
  });
  if (derivedTitle) nameUpdates.title = derivedTitle;
  if (Object.keys(nameUpdates).length > 0) {
    await updateSession(sessionId, nameUpdates);
  }

  return { overallScore: analysis.overallScore };
}

export async function followUpActionsStep(sessionId: string) {
  "use step";

  const session = await getSessionById(sessionId);
  const analysis = await getAnalysisBySessionId(sessionId);
  if (!session || !analysis) throw new FatalError("Session or analysis missing for follow-up actions.");

  const rubric = await getRubricForSession(session.rubricId, session.propertyId);
  const actions = await generateFollowUpActions(analysis, {
    title: session.title,
    prospectName: session.prospectName,
    notes: session.notes,
    analysisModel: rubric.analysisModel
  });
  await replaceFollowUpActions(sessionId, actions);

  return { actionsGenerated: actions.length };
}

export async function finalizeSessionStep(sessionId: string) {
  "use step";

  const session = await getSessionById(sessionId);
  const analysis = await getAnalysisBySessionId(sessionId);
  if (!session || !analysis) throw new FatalError("Session or analysis missing at finalize.");

  await setSessionStatus(sessionId, "analysis_ready", analysis.overallScore);

  const existing = await findMaterialBySessionId(sessionId);
  let materialIndexed = Boolean(existing);
  let materialIndexError: string | null = null;
  if (!existing) {
    try {
      const transcript = await getTranscript(sessionId);
      const transcriptPreview = transcript
        .slice(0, 10)
        .map((s) => `[${s.startTime.toFixed(1)}s] ${s.text}`)
        .join("\n");

      await createMaterial({
        name: session.title,
        type: "recording",
        description: `Recording from session "${session.title}"${session.prospectName ? ` with ${session.prospectName}` : ""}. Score: ${analysis.overallScore}/100.`,
        sessionId,
        propertyId: session.propertyId,
        parsedText: transcriptPreview || undefined
      });
      materialIndexed = true;
    } catch (error) {
      materialIndexError = error instanceof Error ? error.message : "material_index_failed";
    }
  }

  return { overallScore: analysis.overallScore, materialIndexed, materialIndexError };
}

export async function startAudioInsightsAfterAnalysisStep(sessionId: string) {
  "use step";

  try {
    const run = await startAudioInsightsWorkflow(sessionId);
    return run.skipped
      ? { skipped: true, runId: null }
      : { skipped: false, runId: run.runId };
  } catch (error) {
    return {
      skipped: true,
      runId: null,
      reason: error instanceof Error ? error.message : "audio_insights_start_failed",
    };
  }
}

export async function markSessionFailedStep(sessionId: string) {
  "use step";
  await setSessionStatus(sessionId, "failed").catch(() => {});
}

export async function markReanalysisFailedStep(sessionId: string) {
  "use step";

  const analysis = await getAnalysisBySessionId(sessionId).catch(() => null);
  if (analysis) {
    await setSessionStatus(sessionId, "analysis_ready", analysis.overallScore).catch(() => {});
    return { preservedExistingAnalysis: true };
  }

  await setSessionStatus(sessionId, "failed").catch(() => {});
  return { preservedExistingAnalysis: false };
}
