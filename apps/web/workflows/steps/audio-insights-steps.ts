import { FatalError } from "workflow";

import { generateAudioInsights } from "@/lib/audio-insights";
import { isGeminiConfigured } from "@/lib/gemini-client";
import {
  getTranscript,
  getSessionById,
  saveAudioInsights,
  setAudioInsightsStatus,
  updateSession,
} from "@/lib/sessions";
import { fetchRecordingFile } from "@/lib/storage";

export async function prepareAudioInsightsAfterAnalysisStep(sessionId: string) {
  "use step";

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

  const file = await fetchRecordingFile(sessionId);
  if (!file) {
    throw new FatalError("No recording found in storage for audio insights.");
  }

  const transcript = await getTranscript(sessionId);
  const insights = await generateAudioInsights({
    audioBuffer: file.buffer,
    mimeType: file.mimeType,
    fileName: file.fileName,
    transcript,
  });
  await saveAudioInsights(sessionId, insights);
  const nameUpdates: { agentName?: string; prospectName?: string } = {};
  if (!session.agentName && insights.participants?.agentName) {
    nameUpdates.agentName = insights.participants.agentName;
  }
  if (!session.prospectName && insights.participants?.prospectName) {
    nameUpdates.prospectName = insights.participants.prospectName;
  }
  if (Object.keys(nameUpdates).length > 0) {
    await updateSession(sessionId, nameUpdates);
  }
  await setAudioInsightsStatus(sessionId, "ready");

  return {
    segmentCount: insights.segments.length,
    sentiment: insights.overallSentiment,
  };
}
analyzeAudioInsightsStep.maxRetries = 3;

export async function markAudioInsightsFailedStep(sessionId: string) {
  "use step";
  await setAudioInsightsStatus(sessionId, "failed").catch(() => {});
}
