import type { AnalysisResult, AudioInsights, AudioInsightsStatus, ConversationPhaseSegmentation, FollowUpAction, Rubric, SessionDetail, SessionSummary } from "@tour/shared";
import { fetch as expoFetch } from "expo/fetch";

import { authenticatedFetch, getCurrentSession } from "./auth";
import { getApiBaseUrl } from "./config";
import { uploadLocalFileWithPresign } from "./presignedUpload";

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

export type CheckInLeadPayload = {
  firstName: string;
  lastName?: string | null;
  email: string;
  phone?: string | null;
  wantsSummary?: boolean;
  propertyName?: string | null;
  jobTitle?: string | null;
  reason?: string | null;
  questionAnswers?: Record<string, string>;
  repSlug?: string | null;
};

export async function submitCheckInLead(payload: CheckInLeadPayload) {
  const res = await authenticatedFetch("/api/leads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => null) as { sessionId?: string; grouped?: boolean; error?: string } | null;
  if (!res.ok) {
    throw new Error(body?.error ?? "Check-in failed.");
  }
  return body ?? { sessionId: undefined, grouped: false };
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

export async function deleteSession(sessionId: string) {
  const res = await authenticatedFetch(`/api/sessions/${sessionId}`, { method: "DELETE" });
  if (!res.ok) {
    const body = await res.json().catch(() => null) as { error?: string } | null;
    throw new Error(body?.error ?? "Failed to delete session.");
  }
  return (await res.json().catch(() => ({ ok: true }))) as { ok?: boolean };
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
  const body = await uploadLocalFileWithPresign<{ rubric?: Rubric }>({
    authenticatedFetch,
    presignPath: "/api/rubrics/upload/presign",
    completePath: "/api/rubrics/upload/complete",
    fileUri,
    mimeType,
    fileName,
    completeBody: () => ({
      ...(name?.trim() ? { name: name.trim() } : {}),
    }),
  });
  if (!body?.rubric) {
    throw new Error("Rubric upload failed.");
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

export async function generateAnalysis(
  sessionId: string,
  options?: { rubricId?: string; resegment?: boolean },
) {
  const res = await authenticatedFetch(`/api/sessions/${sessionId}/analysis`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      rubricId: options?.rubricId,
      resegment: options?.resegment,
    }),
  });
  const body = await res.json().catch(() => null) as {
    error?: string;
    analysis?: AnalysisResult;
    async?: boolean;
    runId?: string;
    rubricId?: string;
  } | null;
  if (!res.ok) {
    throw new Error(body?.error ?? "Failed to generate analysis.");
  }
  return body ?? { ok: true };
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

export async function uploadRecording(sessionId: string, fileUri: string, mimeType: string, fileName: string, durationSec?: number) {
  return uploadLocalFileWithPresign<{ url: string; status: string }>({
    authenticatedFetch,
    presignPath: `/api/sessions/${sessionId}/upload/presign`,
    completePath: `/api/sessions/${sessionId}/upload/complete`,
    fileUri,
    mimeType,
    fileName,
    completeBody: () => ({
      ...(durationSec && durationSec > 0 ? { durationSec: Math.round(durationSec) } : {}),
    }),
  });
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

export async function fetchAudioInsights(sessionId: string) {
  const res = await authenticatedFetch(`/api/sessions/${sessionId}/audio-insights`);
  if (!res.ok) {
    throw new Error("Failed to fetch audio insights.");
  }
  return (await res.json()) as {
    status: AudioInsightsStatus;
    insights: AudioInsights | null;
    error?: string | null;
  };
}

export async function startAudioInsights(sessionId: string) {
  const res = await authenticatedFetch(`/api/sessions/${sessionId}/audio-insights`, {
    method: "POST",
  });
  const body = (await res.json().catch(() => null)) as {
    status?: AudioInsightsStatus;
    error?: string | null;
  } | null;
  if (!res.ok) {
    throw new Error(body?.error ?? "Failed to start audio insights.");
  }
  return body ?? { status: "processing" as const };
}

export type LiveSessionChatMessage = {
  role: "user" | "assistant";
  content: string;
};

function liveChatAuthHeaders(responseMode: "stream" | "json" = "stream"): Record<string, string> {
  const session = getCurrentSession();
  if (!session) throw new Error("Sign in is required.");
  return {
    Authorization: `Bearer ${session.accessToken}`,
    "x-admin-community-id": session.workspace.community.id,
    "x-tour-client": "mobile",
    "x-tour-response": responseMode,
    "Content-Type": "application/json",
    Accept: responseMode === "json" ? "application/json" : "application/octet-stream, text/plain, */*",
  };
}

function decodeStreamChunk(value: unknown, decoder: TextDecoder): string {
  if (typeof value === "string") return value;
  if (value instanceof Uint8Array) return decoder.decode(value, { stream: true });
  if (value instanceof ArrayBuffer) return decoder.decode(new Uint8Array(value), { stream: true });
  if (ArrayBuffer.isView(value)) {
    return decoder.decode(new Uint8Array(value.buffer, value.byteOffset, value.byteLength), { stream: true });
  }
  return "";
}

/** Streams Tour AI live-chat tokens via expo/fetch (ReadableStream-capable). */
export async function streamLiveSessionChat(
  sessionId: string,
  payload: {
    messages: LiveSessionChatMessage[];
    liveTranscript?: string;
    propertyContext?: string;
  },
  onChunk: (text: string) => void,
): Promise<string> {
  try {
    return await streamLiveSessionChatResponse(sessionId, payload, onChunk);
  } catch (error) {
    const reply = await fetchLiveSessionChatJson(sessionId, payload);
    if (reply) onChunk(reply);
    if (reply) return reply;
    throw error instanceof Error ? error : new Error("Tour AI could not answer right now.");
  }
}

async function streamLiveSessionChatResponse(
  sessionId: string,
  payload: {
    messages: LiveSessionChatMessage[];
    liveTranscript?: string;
    propertyContext?: string;
  },
  onChunk: (text: string) => void,
): Promise<string> {
  const response = await expoFetch(`${getApiBaseUrl()}/api/sessions/${sessionId}/live-chat`, {
    method: "POST",
    headers: liveChatAuthHeaders("stream"),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let message = "Tour AI could not answer right now.";
    try {
      const body = (await response.json()) as { error?: string };
      if (body?.error) message = body.error;
    } catch {
      try {
        const text = await response.text();
        if (text.trim()) message = text.trim();
      } catch {
        // keep default
      }
    }
    throw new Error(message);
  }

  const body = response.body;
  const reader = body && typeof (body as { getReader?: unknown }).getReader === "function"
    ? (body as ReadableStream<Uint8Array>).getReader()
    : null;

  if (!reader) {
    const text = await response.text();
    const reply = text.trim();
    if (reply) onChunk(reply);
    return reply;
  }

  const decoder = new TextDecoder();
  let full = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decodeStreamChunk(value, decoder);
    if (!chunk) continue;
    full += chunk;
    onChunk(full);
  }
  const trailing = decoder.decode();
  if (trailing) {
    full += trailing;
    onChunk(full);
  }
  return full.trim();
}

async function fetchLiveSessionChatJson(
  sessionId: string,
  payload: {
    messages: LiveSessionChatMessage[];
    liveTranscript?: string;
    propertyContext?: string;
  }
): Promise<string> {
  const response = await authenticatedFetch(`/api/sessions/${sessionId}/live-chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-tour-response": "json",
    },
    body: JSON.stringify({ ...payload, responseMode: "json" }),
  });
  const raw = await response.text().catch(() => "");
  const trimmed = raw.trim();
  let body: { reply?: string; error?: string } | null = null;
  if (trimmed.startsWith("{")) {
    try {
      body = JSON.parse(trimmed) as { reply?: string; error?: string };
    } catch {
      body = null;
    }
  }
  if (!response.ok) {
    throw new Error(body?.error ?? (trimmed || "Tour AI could not answer right now."));
  }
  return typeof body?.reply === "string" ? body.reply.trim() : trimmed;
}

export async function sendLiveSessionChat(
  sessionId: string,
  payload: {
    messages: LiveSessionChatMessage[];
    liveTranscript?: string;
    propertyContext?: string;
  }
) {
  const reply = await streamLiveSessionChat(sessionId, payload, () => {});
  return { reply };
}

export async function fetchLiveSessionSuggestions(
  sessionId: string,
  payload: {
    liveTranscript?: string;
    propertyContext?: string;
  } = {}
) {
  const res = await authenticatedFetch(`/api/sessions/${sessionId}/live-suggestions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => null) as { suggestions?: string[]; error?: string } | null;
  if (!res.ok) {
    throw new Error(body?.error ?? "Could not load live suggestions.");
  }
  const suggestions = Array.isArray(body?.suggestions)
    ? body.suggestions.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
  return { suggestions };
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
  const body = await uploadLocalFileWithPresign<{ material?: Material }>({
    authenticatedFetch,
    presignPath: "/api/materials/upload/presign",
    completePath: "/api/materials/upload/complete",
    fileUri,
    mimeType,
    fileName,
    completeBody: () => ({
      name: fileName.replace(/\.[^.]+$/, "").replace(/[-_]/g, " "),
      type: "other",
    }),
  });
  if (!body?.material) throw new Error("Asset upload failed.");
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
