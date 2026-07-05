import { FatalError } from "workflow";

import { generateAnalysis, generateFollowUpActions } from "@/lib/analysis";
import { segmentConversationPhases } from "@/lib/conversation-phases";
import { createMaterial, findMaterialBySessionId } from "@/lib/materials";
import { getRubricForSession } from "@/lib/rubrics";
import { extractScreenshots } from "@/lib/screenshots";
import {
  getAnalysisBySessionId,
  getSessionById,
  getTranscript,
  replaceFollowUpActions,
  saveConversationPhases,
  saveTranscript,
  setSessionStatus,
  upsertAnalysis
} from "@/lib/sessions";
import { transcribeAudio } from "@/lib/transcribe";
import { fetchRecordingFile } from "@/lib/storage";

export async function transcribeSessionStep(sessionId: string) {
  "use step";

  await setSessionStatus(sessionId, "transcribing");
  const session = await getSessionById(sessionId);
  if (!session) throw new FatalError("Session not found.");

  const file = await fetchRecordingFile(sessionId);
  if (!file) throw new FatalError("No recording found in storage for this session.");

  const transcript = await transcribeAudio(sessionId, file.buffer, file.mimeType);
  await saveTranscript(
    sessionId,
    transcript.map((seg) => ({ ...seg, sessionId }))
  );

  return { segmentCount: transcript.length };
}

export async function segmentPhasesStep(sessionId: string) {
  "use step";

  await setSessionStatus(sessionId, "segmenting");
  const transcript = await getTranscript(sessionId);
  const segmentation = await segmentConversationPhases(transcript);
  await saveConversationPhases(sessionId, segmentation);

  return { spanCount: segmentation.spans.length };
}

export async function analyzeSessionStep(sessionId: string) {
  "use step";

  await setSessionStatus(sessionId, "analyzing");
  const session = await getSessionById(sessionId);
  if (!session) throw new FatalError("Session not found.");

  const transcript = await getTranscript(sessionId);
  const rubric = await getRubricForSession(session.rubricId);
  const analysis = await generateAnalysis({
    title: session.title,
    prospectName: session.prospectName,
    location: session.location,
    notes: session.notes,
    transcript,
    rubricDefinition: rubric.definition
  });

  await upsertAnalysis(sessionId, analysis);
  return { overallScore: analysis.overallScore };
}

export async function extractScreenshotsStep(sessionId: string) {
  "use step";

  await setSessionStatus(sessionId, "extracting_screenshots");
  const analysis = await getAnalysisBySessionId(sessionId);
  if (!analysis) throw new FatalError("Analysis missing before screenshot extraction.");

  const momentTimestamps = analysis.exactMoments
    .map((m) => ({
      seconds: parseTimestamp(m.timestamp),
      label: m.explanation
    }))
    .filter((t) => t.seconds >= 0);

  await extractScreenshots(sessionId, momentTimestamps);
  return { screenshotCount: momentTimestamps.length };
}

export async function followUpActionsStep(sessionId: string) {
  "use step";

  const session = await getSessionById(sessionId);
  const analysis = await getAnalysisBySessionId(sessionId);
  if (!session || !analysis) throw new FatalError("Session or analysis missing for follow-up actions.");

  const actions = await generateFollowUpActions(analysis, {
    title: session.title,
    prospectName: session.prospectName,
    notes: session.notes
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
  if (!existing) {
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
  }

  return { overallScore: analysis.overallScore };
}

export async function markSessionFailedStep(sessionId: string) {
  "use step";
  await setSessionStatus(sessionId, "failed").catch(() => {});
}

function parseTimestamp(ts: string): number {
  const parts = ts.split(":").map(Number);
  if (parts.length === 2 && parts.every((n) => !isNaN(n))) {
    return parts[0]! * 60 + parts[1]!;
  }
  if (parts.length === 3 && parts.every((n) => !isNaN(n))) {
    return parts[0]! * 3600 + parts[1]! * 60 + parts[2]!;
  }
  return -1;
}
