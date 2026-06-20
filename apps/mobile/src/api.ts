import type { AnalysisResult, FollowUpAction, RubricSummary, SessionDetail, SessionSummary } from "@tour/shared";

import { getApiBaseUrl } from "./config";

const BASE_URL = getApiBaseUrl();

export type FetchSessionsParams = {
  page?: number;
  limit?: number;
  status?: string;
  search?: string;
  sort?: "newest" | "oldest" | "score_desc" | "score_asc";
};

export type PaginatedSessions = {
  sessions: SessionSummary[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
};

export async function fetchSessions(params?: FetchSessionsParams): Promise<PaginatedSessions> {
  const sp = new URLSearchParams();
  if (params?.page) sp.set("page", String(params.page));
  if (params?.limit) sp.set("limit", String(params.limit));
  if (params?.status) sp.set("status", params.status);
  if (params?.search) sp.set("search", params.search);
  if (params?.sort) sp.set("sort", params.sort);
  const qs = sp.toString();
  const res = await fetch(`${BASE_URL}/api/sessions${qs ? `?${qs}` : ""}`);
  if (!res.ok) {
    throw new Error("Failed to fetch sessions.");
  }
  return (await res.json()) as PaginatedSessions;
}

export async function createSession(payload: {
  title: string;
  scheduledAt?: string | null;
  prospectName?: string | null;
  location?: string | null;
  notes?: string | null;
  rubricId?: string | null;
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

export async function fetchRubrics() {
  const res = await fetch(`${BASE_URL}/api/rubrics`);
  if (!res.ok) {
    throw new Error("Failed to fetch rubrics.");
  }
  return (await res.json()) as { rubrics: RubricSummary[] };
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

export async function uploadRecording(sessionId: string, fileUri: string, mimeType: string, fileName: string) {
  const formData = new FormData();
  formData.append("file", {
    uri: fileUri,
    type: mimeType,
    name: fileName,
  } as any);

  const res = await fetch(`${BASE_URL}/api/sessions/${sessionId}/upload`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null) as { error?: string } | null;
    throw new Error(body?.error ?? "Upload failed.");
  }
  return (await res.json()) as { url: string; status: string };
}

export async function processSession(sessionId: string) {
  const res = await fetch(`${BASE_URL}/api/sessions/${sessionId}/process`, {
    method: "POST",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null) as { error?: string } | null;
    throw new Error(body?.error ?? "Processing failed.");
  }
  return (await res.json()) as { ok: boolean; overallScore?: number };
}

export type Material = {
  id: string;
  name: string;
  type: "rubric" | "training" | "recording" | "other";
  description: string;
  sessionId?: string | null;
  createdAt: string;
};

export type SessionComment = {
  id: string;
  sessionId: string;
  authorName: string;
  body: string;
  timestampSec: number | null;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
};

export async function fetchComments(sessionId: string) {
  const res = await fetch(`${BASE_URL}/api/sessions/${sessionId}/comments`);
  if (!res.ok) throw new Error("Failed to fetch comments.");
  return (await res.json()) as { comments: SessionComment[] };
}

export async function postComment(sessionId: string, payload: {
  body: string;
  authorName?: string;
  timestampSec?: number | null;
  parentId?: string | null;
}) {
  const res = await fetch(`${BASE_URL}/api/sessions/${sessionId}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Failed to post comment.");
  return (await res.json()) as { comment: SessionComment };
}

export async function deleteComment(sessionId: string, commentId: string) {
  const res = await fetch(`${BASE_URL}/api/sessions/${sessionId}/comments`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ commentId }),
  });
  if (!res.ok) throw new Error("Failed to delete comment.");
  return (await res.json()) as { ok: boolean };
}

export async function fetchMaterials() {
  const res = await fetch(`${BASE_URL}/api/materials`);
  if (!res.ok) {
    throw new Error("Failed to fetch materials.");
  }
  return (await res.json()) as { materials: Material[] };
}
