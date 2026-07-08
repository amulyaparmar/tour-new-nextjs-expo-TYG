import { start } from "workflow/api";

import { isGeminiConfigured } from "@/lib/gemini-client";
import {
  clearAudioInsights,
  setAudioInsightsStatus,
} from "@/lib/sessions";
import { processAudioInsightsWorkflow } from "@/workflows/process-audio-insights";

const ACTIVE_AUDIO_INSIGHTS_STATUSES = new Set(["pending", "processing"]);

export async function prepareAudioInsightsProcessing(sessionId: string) {
  await clearAudioInsights(sessionId);
  await setAudioInsightsStatus(sessionId, "pending");
}

export async function startAudioInsightsWorkflow(sessionId: string) {
  if (!isGeminiConfigured()) {
    await setAudioInsightsStatus(sessionId, "unavailable");
    return { skipped: true as const };
  }

  await setAudioInsightsStatus(sessionId, "processing");
  try {
    const run = await start(processAudioInsightsWorkflow, [sessionId]);
    return { skipped: false as const, runId: run.runId };
  } catch (error) {
    await setAudioInsightsStatus(sessionId, "failed").catch(() => {});
    throw error;
  }
}

export function isAudioInsightsProcessing(status: string) {
  return ACTIVE_AUDIO_INSIGHTS_STATUSES.has(status);
}
