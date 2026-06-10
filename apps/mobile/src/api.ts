import type { AnalysisResult, FollowUpAction, SessionDetail, SessionSummary } from "@tour/shared";

import { getApiBaseUrl } from "./config";

const BASE_URL = getApiBaseUrl();

export async function fetchSessions() {
  const res = await fetch(`${BASE_URL}/api/sessions`);
  if (!res.ok) {
    throw new Error("Failed to fetch sessions.");
  }
  return (await res.json()) as { sessions: SessionSummary[] };
}

export async function createSession(payload: {
  title: string;
  scheduledAt?: string | null;
  prospectName?: string | null;
  location?: string | null;
  notes?: string | null;
}) {
  const res = await fetch(`${BASE_URL}/api/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    throw new Error("Failed to create session.");
  }
  return (await res.json()) as { session: SessionSummary };
}

export async function fetchSession(sessionId: string) {
  const res = await fetch(`${BASE_URL}/api/sessions/${sessionId}`);
  if (!res.ok) {
    throw new Error("Failed to fetch session detail.");
  }
  return (await res.json()) as { session: SessionDetail };
}

export async function generateAnalysis(sessionId: string) {
  const res = await fetch(`${BASE_URL}/api/sessions/${sessionId}/analysis`, {
    method: "POST"
  });
  if (!res.ok) {
    throw new Error("Failed to generate analysis.");
  }
  return (await res.json()) as { analysis: AnalysisResult };
}

export async function fetchAnalysis(sessionId: string) {
  const res = await fetch(`${BASE_URL}/api/sessions/${sessionId}/analysis`);
  if (!res.ok) {
    throw new Error("Failed to fetch analysis.");
  }
  return (await res.json()) as { analysis: AnalysisResult | null };
}

export async function fetchActions(sessionId: string) {
  const res = await fetch(`${BASE_URL}/api/sessions/${sessionId}/actions`);
  if (!res.ok) {
    throw new Error("Failed to fetch actions.");
  }
  return (await res.json()) as { actions: FollowUpAction[] };
}

export async function updateActionStatus(
  sessionId: string,
  actionId: string,
  status: "open" | "completed" | "dismissed"
) {
  const res = await fetch(`${BASE_URL}/api/sessions/${sessionId}/actions`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      actionId,
      status
    })
  });

  if (!res.ok) {
    throw new Error("Failed to update action status.");
  }

  return (await res.json()) as { ok: true };
}

export async function fetchTranscript(sessionId: string) {
  const res = await fetch(`${BASE_URL}/api/sessions/${sessionId}/transcript`);
  if (!res.ok) {
    throw new Error("Failed to fetch transcript.");
  }
  return (await res.json()) as {
    transcript: Array<{
      id: string;
      sessionId: string;
      speaker: string;
      startTime: number;
      endTime: number;
      text: string;
    }>;
  };
}

export async function fetchScreenshots(sessionId: string) {
  const res = await fetch(`${BASE_URL}/api/sessions/${sessionId}/screenshots`);
  if (!res.ok) {
    throw new Error("Failed to fetch screenshots.");
  }
  return (await res.json()) as {
    screenshots: Array<{
      id: string;
      sessionId: string;
      timestamp: number;
      imageUrl: string;
      reason: "interval" | "ai_key_moment" | "rubric_evidence";
      summary?: string;
    }>;
  };
}
