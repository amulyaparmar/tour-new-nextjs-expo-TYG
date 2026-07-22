import { start } from "workflow/api";

import { isGeminiConfigured } from "@/lib/gemini-client";
import { getRubricForSession } from "@/lib/rubrics";
import {
  getSessionById,
  setAudioInsightsStatus,
} from "@/lib/sessions";
import { processAudioInsightsWorkflow } from "@/workflows/process-audio-insights";

const ACTIVE_AUDIO_INSIGHTS_STATUSES = new Set(["pending", "processing"]);

async function getAudioInsightsEligibility(sessionId: string) {
  const session = await getSessionById(sessionId);
  if (!session) {
    throw new Error("Session not found for audio insights.");
  }

  const rubric = await getRubricForSession(session.rubricId, session.propertyId);
  if (!rubric.audioUnderstandingEnabled) {
    return { run: false as const, reason: "audio_understanding_disabled" };
  }

  if (!isGeminiConfigured()) {
    return { run: false as const, reason: "gemini_not_configured" };
  }

  return { run: true as const, reason: null };
}

export async function prepareAudioInsightsProcessing(sessionId: string) {
  const eligibility = await getAudioInsightsEligibility(sessionId);
  if (!eligibility.run) {
    await setAudioInsightsStatus(sessionId, "unavailable");
    return { skipped: true as const, reason: eligibility.reason };
  }

  await setAudioInsightsStatus(sessionId, "pending");
  return { skipped: false as const, reason: null };
}

export async function startAudioInsightsWorkflow(sessionId: string) {
  const eligibility = await getAudioInsightsEligibility(sessionId);
  if (!eligibility.run) {
    await setAudioInsightsStatus(sessionId, "unavailable");
    return { skipped: true as const, reason: eligibility.reason };
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
