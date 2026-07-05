import type { AnalysisResult, ConversationPhaseSegmentation, FollowUpAction, Rubric, SessionDetail, SessionSummary } from "@tour/shared";

import { authenticatedFetch } from "./auth";

export type FetchSessionsParams = {
  page?: number;
  limit?: number;
  status?: string;
  search?: string;
  sort?: "newest" | "oldest" | "score_desc" | "score_asc" | "scheduled_asc";
  upcoming?: boolean;
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
  if (params?.upcoming) sp.set("upcoming", "true");
  const qs = sp.toString();
  const res = await authenticatedFetch(`/api/sessions${qs ? `?${qs}` : ""}`);
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
  const res = await authenticatedFetch("/api/sessions", {
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
  const res = await authenticatedFetch(`/api/sessions/${sessionId}`);
  if (!res.ok) {
    throw new Error("Failed to fetch session detail.");
  }
  return (await res.json()) as {
    session: SessionDetail;
    analysis?: AnalysisResult | null;
    phases?: ConversationPhaseSegmentation | null;
  };
}

export async function fetchRubrics() {
  const res = await authenticatedFetch("/api/admin/rubrics");
  if (!res.ok) {
    throw new Error("Failed to fetch rubrics.");
  }
  return (await res.json()) as { rubrics: Rubric[] };
}

export async function uploadRubric(
  fileUri: string,
  mimeType: string,
  fileName: string,
  name?: string
) {
  const formData = new FormData();
  formData.append("file", {
    uri: fileUri,
    type: mimeType,
    name: fileName,
  } as any);
  if (name?.trim()) formData.append("name", name.trim());

  const res = await authenticatedFetch("/api/rubrics/upload", {
    method: "POST",
    body: formData,
  });
  const body = await res.json().catch(() => null) as { rubric?: Rubric; error?: string } | null;
  if (!res.ok || !body?.rubric) {
    throw new Error(body?.error ?? "Rubric upload failed.");
  }
  return body.rubric;
}

export async function applyRubricToSession(sessionId: string, rubricId: string) {
  const res = await authenticatedFetch(`/api/sessions/${sessionId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rubricId }),
  });
  const body = await res.json().catch(() => null) as { error?: string } | null;
  if (!res.ok) throw new Error(body?.error ?? "Could not apply rubric.");
  return { ok: true as const };
}

export async function generateAnalysis(sessionId: string) {
  const res = await authenticatedFetch(`/api/sessions/${sessionId}/analysis`, {
    method: "POST"
  });
  if (!res.ok) {
    throw new Error("Failed to generate analysis.");
  }
  return (await res.json()) as { analysis: AnalysisResult };
}

export async function fetchAnalysis(sessionId: string) {
  const res = await authenticatedFetch(`/api/sessions/${sessionId}/analysis`);
  if (!res.ok) {
    throw new Error("Failed to fetch analysis.");
  }
  return (await res.json()) as { analysis: AnalysisResult | null };
}

export async function fetchActions(sessionId: string) {
  const res = await authenticatedFetch(`/api/sessions/${sessionId}/actions`);
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
  const res = await authenticatedFetch(`/api/sessions/${sessionId}/actions`, {
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
  const res = await authenticatedFetch(`/api/sessions/${sessionId}/transcript`);
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
  const res = await authenticatedFetch(`/api/sessions/${sessionId}/screenshots`);
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

export async function uploadRecording(sessionId: string, fileUri: string, mimeType: string, fileName: string, durationSec?: number) {
  const formData = new FormData();
  formData.append("file", {
    uri: fileUri,
    type: mimeType,
    name: fileName,
  } as any);
  if (durationSec && durationSec > 0) formData.append("durationSec", String(Math.round(durationSec)));

  const res = await authenticatedFetch(`/api/sessions/${sessionId}/upload`, {
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
  const res = await authenticatedFetch(`/api/sessions/${sessionId}/process`, {
    method: "POST",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null) as { error?: string } | null;
    throw new Error(body?.error ?? "Processing failed.");
  }

  const started = (await res.json()) as { ok: boolean; async?: boolean; overallScore?: number };
  if (res.status === 202 || started.async) {
    return waitForSessionProcessing(sessionId);
  }
  return started;
}

async function waitForSessionProcessing(sessionId: string, timeoutMs = 15 * 60 * 1000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const { session } = await fetchSession(sessionId);
    if (session.status === "analysis_ready" || session.status === "reviewed") {
      return { ok: true, overallScore: session.overallScore ?? undefined };
    }
    if (session.status === "failed") {
      throw new Error("Session processing failed.");
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  throw new Error("Processing timed out. Check back on the session page.");
}

export type Material = {
  id: string;
  name: string;
  type: "rubric" | "training" | "recording" | "other";
  description: string;
  fileUrl?: string | null;
  sessionId?: string | null;
  propertyId?: string | null;
  createdAt: string;
  media?: {
    sourceKey: string;
    videoUrl: string | null;
    imageUrl: string | null;
    gifUrl: string | null;
    iframeUrl: string | null;
  };
};

export function materialUrl(material: Material) {
  return material.media?.videoUrl ?? material.media?.iframeUrl ?? material.fileUrl ?? null;
}

export function assetNoteSnippet(asset: Material) {
  const url = materialUrl(asset);
  return [
    `Follow-up asset: ${asset.name}`,
    asset.description || null,
    url ? `Link: ${url}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

export type CalendarEvent = {
  id: string;
  session_id: string | null;
  external_event_id: string;
  external_application_id: string | null;
  event_type: "in_person" | "virtual" | "other";
  status: string;
  appointment_date: string;
  time_from: string | null;
  time_to: string | null;
  prospect_name: string | null;
  prospect_email: string | null;
  prospect_phone: string | null;
  notes: string | null;
  synced_at: string;
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
  const res = await authenticatedFetch(`/api/sessions/${sessionId}/comments`);
  if (!res.ok) throw new Error("Failed to fetch comments.");
  return (await res.json()) as { comments: SessionComment[] };
}

export async function postComment(sessionId: string, payload: {
  body: string;
  authorName?: string;
  timestampSec?: number | null;
  parentId?: string | null;
}) {
  const res = await authenticatedFetch(`/api/sessions/${sessionId}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Failed to post comment.");
  return (await res.json()) as { comment: SessionComment };
}

export async function deleteComment(sessionId: string, commentId: string) {
  const res = await authenticatedFetch(`/api/sessions/${sessionId}/comments`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ commentId }),
  });
  if (!res.ok) throw new Error("Failed to delete comment.");
  return (await res.json()) as { ok: boolean };
}

export async function sendSessionFollowUp(
  sessionId: string,
  payload: { phone?: string; includeCardImage?: boolean }
) {
  const res = await authenticatedFetch(`/api/sessions/${sessionId}/send-follow-up`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => null) as {
    ok?: boolean;
    skipped?: boolean;
    followUpUrl?: string;
    error?: string;
  } | null;
  if (!res.ok) {
    throw new Error(body?.error ?? "Failed to send follow-up.");
  }
  return body ?? { ok: true };
}

export async function fetchMaterials() {
  const res = await authenticatedFetch("/api/materials");
  if (!res.ok) {
    throw new Error("Failed to fetch materials.");
  }
  return (await res.json()) as { materials: Material[] };
}

export async function uploadMaterial(fileUri: string, mimeType: string, fileName: string) {
  const formData = new FormData();
  formData.append("file", {
    uri: fileUri,
    type: mimeType,
    name: fileName,
  } as any);
  formData.append("name", fileName.replace(/\.[^.]+$/, "").replace(/[-_]/g, " "));
  formData.append("type", "other");

  const res = await authenticatedFetch("/api/materials/upload", {
    method: "POST",
    body: formData,
  });
  const body = await res.json().catch(() => null) as { material?: Material; error?: string } | null;
  if (!res.ok || !body?.material) throw new Error(body?.error ?? "Asset upload failed.");
  return body.material;
}

export async function fetchCalendarEvents(fromDate?: string, toDate?: string) {
  const params = new URLSearchParams();
  if (fromDate) params.set("fromDate", fromDate);
  if (toDate) params.set("toDate", toDate);
  const query = params.toString();
  const res = await authenticatedFetch(`/api/admin/calendar/scheduled${query ? `?${query}` : ""}`);
  if (!res.ok) throw new Error("Failed to fetch Entrata calendar.");
  return (await res.json()) as {
    community: { id: string; name: string };
    events: CalendarEvent[];
  };
}

export async function syncCalendar() {
  const res = await authenticatedFetch("/api/admin/calendar/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  const body = await res.json().catch(() => null) as {
    sync?: { eventsSynced: number; prospectsEnriched?: number };
    error?: string;
  } | null;
  if (!res.ok) throw new Error(body?.error ?? "Entrata sync failed.");
  return body?.sync;
}
