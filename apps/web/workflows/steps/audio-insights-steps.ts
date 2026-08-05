import { FatalError } from "workflow";

import {
  decorateParticipantNameByConfidence,
  withRecordingParticipants,
} from "@tour/shared";

import { generateAudioInsights, identifyAudioParticipants } from "@/lib/audio-insights";
import { isGeminiConfigured } from "@/lib/gemini-client";
import { getRubricForSession } from "@/lib/rubrics";
import {
  getSessionById,
  getAudioInsights,
  saveAudioInsights,
  setAudioInsightsStatus,
  recordSessionWorkflowCompleted,
  recordSessionWorkflowFailed,
  updateSession,
} from "@/lib/sessions";
import { deriveSessionTitleFromParticipants } from "@/lib/session-naming";
import { fetchRecordingFile } from "@/lib/storage";

export async function prepareAudioInsightsAfterAnalysisStep(sessionId: string) {
  "use step";

  const session = await getSessionById(sessionId);
  if (!session) {
    throw new FatalError("Session not found for audio insights.");
  }

  const rubric = await getRubricForSession(session.rubricId, session.propertyId);
  if (!rubric.audioUnderstandingEnabled) {
    await setAudioInsightsStatus(sessionId, "unavailable");
    return { run: false, skipped: true, reason: "audio_understanding_disabled" };
  }

  if (!isGeminiConfigured()) {
    await setAudioInsightsStatus(sessionId, "unavailable");
    return { run: false, skipped: true, reason: "gemini_not_configured" };
  }

  await setAudioInsightsStatus(sessionId, "processing");
  return { run: true, skipped: false };
}

export async function analyzeAudioInsightsStep(sessionId: string) {
  "use step";

  await setAudioInsightsStatus(sessionId, "processing");

  const session = await getSessionById(sessionId);
  if (!session) {
    throw new FatalError("Session not found for audio insights.");
  }

  const rubric = await getRubricForSession(session.rubricId, session.propertyId);
  if (!rubric.audioUnderstandingEnabled) {
    await setAudioInsightsStatus(sessionId, "unavailable");
    return {
      skipped: true,
      reason: "audio_understanding_disabled",
    };
  }

  const file = await fetchRecordingFile(sessionId);
  if (!file) {
    throw new FatalError("No recording found in storage for audio insights.");
  }

  const insights = await generateAudioInsights({
    audioBuffer: file.buffer,
    mimeType: file.mimeType,
    fileName: file.fileName,
    rubricContext: {
      name: rubric.name,
      sessionType: rubric.sessionType,
      criteria: rubric.definition.sections.flatMap((section) =>
        section.items.map((item) => `${section.name}: ${item.text}`)
      ),
      analysisInstructions: rubric.analysisPrompt,
    },
  });
  await saveAudioInsights(sessionId, insights, { status: "processing" });

  return {
    segmentCount: insights.segments.length,
    sentiment: insights.overallSentiment,
  };
}
analyzeAudioInsightsStep.maxRetries = 3;

export async function identifyAudioParticipantsStep(sessionId: string) {
  "use step";

  const session = await getSessionById(sessionId);
  if (!session) {
    throw new FatalError("Session not found for participant identification.");
  }

  const [insights, file] = await Promise.all([
    getAudioInsights(sessionId),
    fetchRecordingFile(sessionId),
  ]);
  if (!insights?.audioFile) {
    throw new FatalError("Gemini audio file is missing for participant identification.");
  }
  if (!file) {
    throw new FatalError("No recording found for participant identification.");
  }

  const participants = await identifyAudioParticipants({
    audioBuffer: file.buffer,
    mimeType: file.mimeType,
    fileName: file.fileName,
    model: insights.model,
    uploadedFile: insights.audioFile,
  });
  const updatedInsights = { ...insights, participants };
  await saveAudioInsights(sessionId, updatedInsights, { status: "processing" });

  const rubric = await getRubricForSession(session.rubricId, session.propertyId);
  const nameUpdates: { title?: string; agentName?: string; prospectName?: string } = {};
  const extractedAgentName = decorateParticipantNameByConfidence(
    participants.agentName,
    participants.agentNameConfidence,
  );
  const extractedProspectName = decorateParticipantNameByConfidence(
    participants.prospectName,
    participants.prospectNameConfidence,
  );
  if (
    extractedAgentName
    && extractedAgentName !== session.agentName
  ) {
    nameUpdates.agentName = extractedAgentName;
  }
  if (
    extractedProspectName
    && extractedProspectName !== session.prospectName
  ) {
    nameUpdates.prospectName = extractedProspectName;
  }
  const updatedTitle = withRecordingParticipants(
    session.title,
    nameUpdates.agentName ?? session.agentName,
    nameUpdates.prospectName ?? session.prospectName,
    rubric.sessionType,
    insights.topicSummary,
  );
  if (updatedTitle !== session.title) {
    nameUpdates.title = updatedTitle;
  } else {
    const derivedTitle = deriveSessionTitleFromParticipants({
      currentTitle: session.title,
      agentName: nameUpdates.agentName ?? session.agentName,
      prospectName: nameUpdates.prospectName ?? session.prospectName,
    });
    if (derivedTitle) nameUpdates.title = derivedTitle;
  }
  if (Object.keys(nameUpdates).length > 0) {
    await updateSession(sessionId, nameUpdates);
  }

  return participants;
}
identifyAudioParticipantsStep.maxRetries = 3;

export async function finalizeAudioInsightsStep(sessionId: string) {
  "use step";

  await setAudioInsightsStatus(sessionId, "ready");
  await recordSessionWorkflowCompleted(sessionId, "audioInsights");

  return { ready: true };
}

export async function markAudioInsightsFailedStep(sessionId: string, reason?: string) {
  "use step";
  await setAudioInsightsStatus(sessionId, "failed").catch(() => {});
  await recordSessionWorkflowFailed(sessionId, "audioInsights", reason ?? "Audio insights workflow failed.").catch(() => {});
}
