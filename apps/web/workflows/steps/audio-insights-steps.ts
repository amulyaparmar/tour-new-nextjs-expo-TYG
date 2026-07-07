import { FatalError } from "workflow";

import { generateAudioInsights } from "@/lib/audio-insights";
import {
  getTranscript,
  getSessionById,
  saveAudioInsights,
  setAudioInsightsStatus,
} from "@/lib/sessions";
import { fetchRecordingFile } from "@/lib/storage";

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
  await setAudioInsightsStatus(sessionId, "ready");

  return {
    segmentCount: insights.segments.length,
    sentiment: insights.overallSentiment,
  };
}

export async function markAudioInsightsFailedStep(sessionId: string) {
  "use step";
  await setAudioInsightsStatus(sessionId, "failed").catch(() => {});
}
