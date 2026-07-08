import "server-only";

import type {
  AnalysisResult,
  AnalysisRun,
  AnalysisRunSummary,
  AnalysisRunTrigger,
  AudioInsights,
  AudioInsightsStatus,
  ConversationPhaseSegmentation,
  CreateSessionInput,
  FollowUpAction,
  SessionDetail,
  SessionLead,
  SessionSource,
  SessionStatus,
  SessionSummary
} from "@tour/shared";
import { normalizeAudioInsights, normalizeAudioInsightsStatus, normalizeConversationPhaseSegmentation, normalizeParticipantName, normalizeSessionStatus } from "@tour/shared";

import {
  addLocalSessionLead,
  createLocalSession,
  deleteLocalSession,
  findOpenLocalQrSession,
  getLocalAnalysis,
  getLocalAnalysisRun,
  getLocalAudioInsights,
  getLocalConversationPhases,
  getLocalSessionById,
  getLocalTranscript,
  listLocalActions,
  listLocalAnalysisRuns,
  listLocalSessions,
  replaceLocalActions,
  saveLocalAnalysisRun,
  saveLocalAudioInsights,
  saveLocalConversationPhases,
  saveLocalTranscript,
  setLocalAudioInsightsStatus,
  clearLocalAudioInsights,
  setLocalSessionStatus,
  updateLocalActionStatus,
  updateLocalSession,
} from "./local-store";
import { getSupabaseServiceClient } from "./supabase";

type SessionRow = {
  id: string;
  title: string;
  prospect_name: string | null;
  agent_name: string | null;
  scheduled_at: string | null;
  location: string | null;
  status: SessionStatus;
  source: SessionSource | null;
  leads: SessionLead[] | null;
  rubric_id: string | null;
  agent_id?: string | null;
  property_id?: string | null;
  unit_label?: string | null;
  external_provider?: string | null;
  external_event_id?: string | null;
  external_application_id?: string | null;
  overall_score: number | null;
  notes: string | null;
  video_url: string | null;
  audio_url: string | null;
  duration: number | null;
  created_at: string;
  audio_insights_status: AudioInsightsStatus | null;
};

const SESSION_COLUMNS =
  "id,title,prospect_name,agent_name,scheduled_at,location,status,source,leads,rubric_id,agent_id,property_id,unit_label,external_provider,external_event_id,external_application_id,overall_score,notes,video_url,audio_url,duration,created_at,audio_insights_status";

type AnalysisRow = {
  id: string;
  session_id: string;
  status: "processing" | "ready" | "failed";
  result_json: AnalysisResult;
  created_at: string;
  version?: number | null;
  is_current?: boolean | null;
  rubric_id?: string | null;
  rubric_name?: string | null;
  trigger?: string | null;
};

function mapAnalysisRunSummary(row: AnalysisRow): AnalysisRunSummary {
  return {
    id: row.id,
    sessionId: row.session_id,
    version: row.version ?? 1,
    isCurrent: row.is_current ?? true,
    overallScore: row.result_json.overallScore,
    rubricId: row.rubric_id ?? null,
    rubricName: row.rubric_name ?? null,
    trigger: row.trigger === "initial" || row.trigger === "reanalyze" ? row.trigger : null,
    createdAt: row.created_at,
  };
}

function mapAnalysisRun(row: AnalysisRow): AnalysisRun {
  return {
    ...mapAnalysisRunSummary(row),
    result: row.result_json,
  };
}

function resolveVersionFilter(version?: string | null) {
  if (!version) return null;
  const uuidPattern = /^[0-9a-f-]{36}$/i;
  if (uuidPattern.test(version)) {
    return { kind: "id" as const, value: version };
  }
  const versionNumber = Number(version);
  if (!Number.isNaN(versionNumber) && versionNumber > 0) {
    return { kind: "version" as const, value: versionNumber };
  }
  return null;
}

type FollowUpActionRow = {
  id: string;
  session_id: string;
  title: string;
  description: string;
  priority: "low" | "medium" | "high";
  status: "open" | "completed" | "dismissed";
  suggested_message: string | null;
  created_at: string;
};

export type ListSessionsParams = {
  page?: number;
  limit?: number;
  status?: SessionStatus;
  statuses?: SessionStatus[];
  search?: string;
  sort?: "newest" | "oldest" | "score_desc" | "score_asc" | "scheduled_asc";
  propertyId?: string;
  propertyIds?: string[];
  agentId?: string;
  excludeScheduled?: boolean;
  upcomingFrom?: string;
};

export type PaginatedSessions = {
  sessions: SessionSummary[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
};

export async function listSessions(params?: ListSessionsParams): Promise<SessionSummary[]> {
  const result = await listSessionsPaginated(params);
  return result.sessions;
}

export async function listSessionsPaginated(params?: ListSessionsParams): Promise<PaginatedSessions> {
  const page = Math.max(1, params?.page ?? 1);
  const limit = Math.min(100, Math.max(1, params?.limit ?? 20));
  const offset = (page - 1) * limit;

  try {
    const supabase = getSupabaseServiceClient();
    let query = supabase
      .from("sessions")
      .select(SESSION_COLUMNS, { count: "exact" });

    if (params?.status) {
      query = query.eq("status", params.status);
    } else if (params?.statuses?.length) {
      query = query.in("status", params.statuses);
    }

    if (params?.excludeScheduled) {
      query = query.neq("status", "scheduled");
    }
    if (params?.upcomingFrom) {
      query = query.or(
        `status.eq.in_progress,and(status.eq.scheduled,scheduled_at.gte.${params.upcomingFrom})`
      );
    }

    if (params?.propertyId) {
      query = query.eq("property_id", params.propertyId);
    } else if (params?.propertyIds?.length) {
      query = query.in("property_id", params.propertyIds);
    }

    if (params?.agentId) {
      query = query.eq("agent_id", params.agentId);
    }

    if (params?.search) {
      const term = `%${params.search}%`;
      query = query.or(`title.ilike.${term},prospect_name.ilike.${term},location.ilike.${term}`);
    }

    const sort = params?.sort ?? "newest";
    switch (sort) {
      case "oldest":
        query = query.order("created_at", { ascending: true });
        break;
      case "score_desc":
        query = query.order("overall_score", { ascending: false, nullsFirst: false });
        break;
      case "score_asc":
        query = query.order("overall_score", { ascending: true, nullsFirst: false });
        break;
      case "scheduled_asc":
        query = query.order("scheduled_at", { ascending: true, nullsFirst: false });
        break;
      default:
        query = query.order("created_at", { ascending: false });
    }

    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      throw new Error(error.message);
    }

    const sessions = (data ?? []).map(mapSessionRow);
    if (params?.sort === "scheduled_asc") {
      sessions.sort((a, b) => {
        if (a.status === "in_progress" && b.status !== "in_progress") return -1;
        if (b.status === "in_progress" && a.status !== "in_progress") return 1;
        return new Date(a.scheduledAt ?? a.createdAt).getTime() - new Date(b.scheduledAt ?? b.createdAt).getTime();
      });
    }
    const total = count ?? sessions.length;

    return { sessions, total, page, limit, hasMore: offset + sessions.length < total };
  } catch {
    let all = await listLocalSessions();

    if (params?.excludeScheduled) {
      all = all.filter((session) => session.status !== "scheduled");
    }
    if (params?.upcomingFrom) {
      const cutoff = new Date(params.upcomingFrom).getTime();
      all = all.filter((session) =>
        session.status === "in_progress" ||
        (
          session.status === "scheduled" &&
          session.scheduledAt !== null &&
          new Date(session.scheduledAt).getTime() >= cutoff
        )
      );
    }
    if (params?.status) {
      all = all.filter((session) => session.status === params.status);
    } else if (params?.statuses?.length) {
      all = all.filter((session) => params.statuses!.includes(session.status));
    }
    if (params?.propertyId) {
      all = all.filter((session) => session.propertyId === params.propertyId);
    } else if (params?.propertyIds?.length) {
      all = all.filter((session) => session.propertyId && params.propertyIds!.includes(session.propertyId));
    }
    if (params?.agentId) {
      all = all.filter((session) => session.agentId === params.agentId);
    }
    if (params?.search) {
      const term = params.search.toLowerCase();
      all = all.filter((session) =>
        session.title.toLowerCase().includes(term) ||
        session.prospectName?.toLowerCase().includes(term) ||
        session.location?.toLowerCase().includes(term)
      );
    }

    if (params?.sort === "scheduled_asc") {
      all.sort((a, b) => {
        if (a.status === "in_progress" && b.status !== "in_progress") return -1;
        if (b.status === "in_progress" && a.status !== "in_progress") return 1;
        return new Date(a.scheduledAt ?? a.createdAt).getTime() - new Date(b.scheduledAt ?? b.createdAt).getTime();
      });
    }

    const total = all.length;
    const offset = (page - 1) * limit;
    const sessions = all.slice(offset, offset + limit);
    return { sessions, total, page, limit, hasMore: offset + sessions.length < total };
  }
}

export async function createSession(input: CreateSessionInput): Promise<SessionSummary> {
  const normalizedTitle = input.title.trim();

  if (!normalizedTitle) {
    throw new Error("Session title is required.");
  }

  const payload = {
    title: normalizedTitle,
    scheduled_at: input.scheduledAt ?? null,
    location: input.location?.trim() ? input.location.trim() : null,
    prospect_name: normalizeParticipantName(input.prospectName),
    agent_name: normalizeParticipantName(input.agentName),
    notes: input.notes?.trim() ? input.notes.trim() : null,
    status: "scheduled" as const,
    source: input.source ?? "manual",
    leads: input.leads ?? [],
    rubric_id: input.rubricId ?? null,
    agent_id: input.agentId ?? null,
    property_id: input.propertyId ?? null,
    unit_label: input.unitLabel ?? null
  };

  try {
    const supabase = getSupabaseServiceClient();
    const { data, error } = await supabase
      .from("sessions")
      .insert(payload as never)
      .select(SESSION_COLUMNS)
      .single<SessionRow>();

    if (error || !data) {
      throw new Error(`Failed to create session: ${error?.message ?? "Unknown error"}`);
    }

    return mapSessionRow(data);
  } catch {
    return createLocalSession({
      title: normalizedTitle,
      scheduledAt: input.scheduledAt ?? null,
      location: input.location ?? null,
      prospectName: normalizeParticipantName(input.prospectName),
      agentName: normalizeParticipantName(input.agentName),
      notes: input.notes ?? null,
      source: input.source ?? "manual",
      leads: input.leads ?? [],
      rubricId: input.rubricId ?? null
    });
  }
}

const QR_GROUP_WINDOW_MS = 2 * 60 * 60 * 1000;

/**
 * Most recent QR-created session still in `scheduled` within the grouping
 * window — additional prospects scanning the same QR join this session group
 * instead of creating duplicates.
 */
export async function findOpenQrSession(): Promise<SessionSummary | null> {
  const cutoff = new Date(Date.now() - QR_GROUP_WINDOW_MS).toISOString();
  try {
    const supabase = getSupabaseServiceClient();
    const { data, error } = await supabase
      .from("sessions")
      .select(SESSION_COLUMNS)
      .eq("source", "qr")
      .eq("status", "scheduled")
      .gte("created_at", cutoff)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<SessionRow>();

    if (error) throw new Error(error.message);
    return data ? mapSessionRow(data) : null;
  } catch {
    return findOpenLocalQrSession(cutoff);
  }
}

export async function addSessionLead(sessionId: string, lead: SessionLead): Promise<void> {
  try {
    const supabase = getSupabaseServiceClient();
    const { data, error } = await supabase
      .from("sessions")
      .select("leads")
      .eq("id", sessionId)
      .single<{ leads: SessionLead[] | null }>();

    if (error) throw new Error(error.message);

    const leads = [...(data?.leads ?? []), lead];
    const { error: updateError } = await supabase
      .from("sessions")
      .update({ leads } as never)
      .eq("id", sessionId);

    if (updateError) throw new Error(updateError.message);
  } catch {
    await addLocalSessionLead(sessionId, lead);
  }
}

export async function updateSession(
  sessionId: string,
  fields: {
    title?: string;
    scheduledAt?: string | null;
    prospectName?: string | null;
    agentName?: string | null;
    location?: string | null;
    notes?: string | null;
    videoUrl?: string | null;
    audioUrl?: string | null;
    duration?: number | null;
    rubricId?: string | null;
    agentId?: string | null;
    propertyId?: string | null;
    unitLabel?: string | null;
  }
) {
  try {
    const supabase = getSupabaseServiceClient();
    const row: Record<string, unknown> = {};
    if (fields.title !== undefined) row.title = fields.title;
    if (fields.scheduledAt !== undefined) row.scheduled_at = fields.scheduledAt;
    if (fields.prospectName !== undefined) row.prospect_name = normalizeParticipantName(fields.prospectName);
    if (fields.agentName !== undefined) row.agent_name = normalizeParticipantName(fields.agentName);
    if (fields.location !== undefined) row.location = fields.location;
    if (fields.notes !== undefined) row.notes = fields.notes;
    if (fields.videoUrl !== undefined) row.video_url = fields.videoUrl;
    if (fields.audioUrl !== undefined) row.audio_url = fields.audioUrl;
    if (fields.duration !== undefined) row.duration = fields.duration;
    if (fields.rubricId !== undefined) row.rubric_id = fields.rubricId;
    if (fields.agentId !== undefined) row.agent_id = fields.agentId;
    if (fields.propertyId !== undefined) row.property_id = fields.propertyId;
    if (fields.unitLabel !== undefined) row.unit_label = fields.unitLabel;

    const { error } = await supabase.from("sessions").update(row as never).eq("id", sessionId);
    if (error) throw error;
  } catch {
    await updateLocalSession(sessionId, {
      ...fields,
      prospectName: fields.prospectName === undefined ? undefined : normalizeParticipantName(fields.prospectName),
      agentName: fields.agentName === undefined ? undefined : normalizeParticipantName(fields.agentName),
    });
  }
}

export async function deleteSession(sessionId: string): Promise<void> {
  try {
    const supabase = getSupabaseServiceClient();
    const { error } = await supabase.from("sessions").delete().eq("id", sessionId);
    if (error) {
      throw new Error(`Failed to delete session: ${error.message}`);
    }
  } catch {
    await deleteLocalSession(sessionId);
  }
}

export async function getSessionById(sessionId: string): Promise<SessionDetail | null> {
  try {
    const supabase = getSupabaseServiceClient();
    const { data, error } = await supabase
      .from("sessions")
      .select(SESSION_COLUMNS)
      .eq("id", sessionId)
      .maybeSingle<SessionRow>();

    if (error) {
      throw new Error(`Failed to fetch session: ${error.message}`);
    }

    if (!data) {
      return null;
    }

    return mapSessionDetailRow(data);
  } catch {
    return getLocalSessionById(sessionId);
  }
}

export async function listAnalysisRuns(sessionId: string): Promise<AnalysisRunSummary[]> {
  try {
    const supabase = getSupabaseServiceClient();
    const { data, error } = await supabase
      .from("analyses")
      .select("id,session_id,status,result_json,created_at,version,is_current,rubric_id,rubric_name,trigger")
      .eq("session_id", sessionId)
      .order("version", { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    return ((data as AnalysisRow[] | null) ?? []).map(mapAnalysisRunSummary);
  } catch {
    return listLocalAnalysisRuns(sessionId);
  }
}

export async function getAnalysisRun(
  sessionId: string,
  version?: string | null
): Promise<AnalysisRun | null> {
  const filter = resolveVersionFilter(version);

  try {
    const supabase = getSupabaseServiceClient();

    if (filter?.kind === "id") {
      const { data, error } = await supabase
        .from("analyses")
        .select("id,session_id,status,result_json,created_at,version,is_current,rubric_id,rubric_name,trigger")
        .eq("session_id", sessionId)
        .eq("id", filter.value)
        .maybeSingle<AnalysisRow>();
      if (error) throw new Error(error.message);
      if (data) return mapAnalysisRun(data);
    } else if (filter?.kind === "version") {
      const { data, error } = await supabase
        .from("analyses")
        .select("id,session_id,status,result_json,created_at,version,is_current,rubric_id,rubric_name,trigger")
        .eq("session_id", sessionId)
        .eq("version", filter.value)
        .maybeSingle<AnalysisRow>();
      if (error) throw new Error(error.message);
      if (data) return mapAnalysisRun(data);
    } else {
      const { data, error } = await supabase
        .from("analyses")
        .select("id,session_id,status,result_json,created_at,version,is_current,rubric_id,rubric_name,trigger")
        .eq("session_id", sessionId)
        .eq("is_current", true)
        .order("version", { ascending: false })
        .limit(1);
      if (error) throw new Error(error.message);
      const row = (data as AnalysisRow[] | null)?.[0];
      if (row) return mapAnalysisRun(row);
    }
  } catch {
    return getLocalAnalysisRun(sessionId, version);
  }

  return null;
}

export async function getAnalysisBySessionId(
  sessionId: string,
  version?: string | null
): Promise<AnalysisResult | null> {
  if (version) {
    return (await getAnalysisRun(sessionId, version))?.result ?? null;
  }

  try {
    const supabase = getSupabaseServiceClient();
    const { data, error } = await supabase
      .from("analyses")
      .select("id,session_id,status,result_json,created_at,version,is_current,rubric_id,rubric_name,trigger")
      .eq("session_id", sessionId)
      .eq("is_current", true)
      .order("version", { ascending: false })
      .limit(1);

    if (error) {
      throw new Error(`Failed to fetch analysis: ${error.message}`);
    }

    return ((data as AnalysisRow[] | null)?.[0]?.result_json) ?? null;
  } catch {
    return getLocalAnalysis(sessionId);
  }
}

export async function saveAnalysisRun(
  sessionId: string,
  analysis: AnalysisResult,
  meta?: {
    rubricId?: string | null;
    rubricName?: string | null;
    trigger?: AnalysisRunTrigger;
  }
): Promise<{ runId: string; version: number }> {
  try {
    const supabase = getSupabaseServiceClient();

    const { data: existingRows, error: existingError } = await supabase
      .from("analyses")
      .select("version")
      .eq("session_id", sessionId)
      .order("version", { ascending: false })
      .limit(1);

    if (existingError) {
      throw new Error(existingError.message);
    }

    const nextVersion = ((existingRows as Array<{ version: number | null }> | null)?.[0]?.version ?? 0) + 1;
    const trigger = meta?.trigger ?? (nextVersion > 1 ? "reanalyze" : "initial");

    const { data, error } = await supabase.from("analyses").insert(
      {
        session_id: sessionId,
        version: nextVersion,
        is_current: false,
        status: "ready",
        result_json: analysis,
        rubric_id: meta?.rubricId ?? null,
        rubric_name: meta?.rubricName ?? null,
        trigger,
      } as never
    ).select("id,version").single<{ id: string; version: number }>();

    if (error) {
      throw new Error(`Failed to save analysis: ${error.message}`);
    }

    const { error: clearCurrentError } = await supabase
      .from("analyses")
      .update({ is_current: false } as never)
      .eq("session_id", sessionId)
      .eq("is_current", true);

    if (clearCurrentError) {
      throw new Error(clearCurrentError.message);
    }

    const { error: markCurrentError } = await supabase
      .from("analyses")
      .update({ is_current: true } as never)
      .eq("id", data.id);

    if (markCurrentError) {
      throw new Error(markCurrentError.message);
    }

    const { error: sessionUpdateError } = await supabase
      .from("sessions")
      .update({
        status: "analysis_ready",
        overall_score: analysis.overallScore,
      } as never)
      .eq("id", sessionId);

    if (sessionUpdateError) {
      throw new Error(`Failed to update session status: ${sessionUpdateError.message}`);
    }

    return { runId: data.id, version: data.version };
  } catch {
    return saveLocalAnalysisRun(sessionId, analysis, meta);
  }
}

export async function upsertAnalysis(
  sessionId: string,
  analysis: AnalysisResult,
  meta?: {
    rubricId?: string | null;
    rubricName?: string | null;
    trigger?: AnalysisRunTrigger;
  }
): Promise<AnalysisResult> {
  await saveAnalysisRun(sessionId, analysis, meta);
  return analysis;
}

export async function listFollowUpActions(sessionId: string): Promise<FollowUpAction[]> {
  try {
    const supabase = getSupabaseServiceClient();
    const { data, error } = await supabase
      .from("follow_up_actions")
      .select("id,session_id,title,description,priority,status,suggested_message,created_at")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(`Failed to list actions: ${error.message}`);
    }

    return ((data as FollowUpActionRow[] | null) ?? []).map(mapFollowUpActionRow);
  } catch {
    return listLocalActions(sessionId);
  }
}

export async function replaceFollowUpActions(
  sessionId: string,
  actions: Array<Omit<FollowUpAction, "id" | "sessionId" | "createdAt">>
): Promise<void> {
  try {
    const supabase = getSupabaseServiceClient();

    const { error: deleteError } = await supabase
      .from("follow_up_actions")
      .delete()
      .eq("session_id", sessionId);

    if (deleteError) {
      throw new Error(`Failed to clear existing actions: ${deleteError.message}`);
    }

    if (actions.length === 0) {
      return;
    }

    const insertRows = actions.map((action) => ({
      session_id: sessionId,
      title: action.title,
      description: action.description,
      priority: action.priority,
      status: action.status,
      suggested_message: action.suggestedMessage
    }));

    const { error: insertError } = await supabase
      .from("follow_up_actions")
      .insert(insertRows as never);

    if (insertError) {
      throw new Error(`Failed to insert actions: ${insertError.message}`);
    }
  } catch {
    await replaceLocalActions(sessionId, actions);
  }
}

export async function updateFollowUpActionStatus(
  actionId: string,
  status: FollowUpAction["status"]
): Promise<void> {
  try {
    const supabase = getSupabaseServiceClient();
    const { error } = await supabase
      .from("follow_up_actions")
      .update({ status } as never)
      .eq("id", actionId);

    if (error) {
      throw new Error(`Failed to update action status: ${error.message}`);
    }
  } catch {
    await updateLocalActionStatus(actionId, status);
  }
}

export async function setSessionStatus(
  sessionId: string,
  status: SessionStatus,
  overallScore?: number
): Promise<void> {
  try {
    const supabase = getSupabaseServiceClient();
    const patch =
      typeof overallScore === "number"
        ? ({ status, overall_score: overallScore } as const)
        : ({ status } as const);
    const { error } = await supabase
      .from("sessions")
      .update(patch as never)
      .eq("id", sessionId);

    if (error) {
      throw new Error(`Failed to set session status: ${error.message}`);
    }
  } catch {
    await setLocalSessionStatus(sessionId, status, overallScore);
  }
}

export type StoredTranscriptSegment = {
  id: string;
  sessionId: string;
  speaker: string;
  startTime: number;
  endTime: number;
  text: string;
};

export async function saveTranscript(sessionId: string, segments: StoredTranscriptSegment[]) {
  try {
    const supabase = getSupabaseServiceClient();
    const json = segments.map((seg) => ({
      speaker: seg.speaker,
      startTime: seg.startTime,
      endTime: seg.endTime,
      text: seg.text
    }));

    const { error } = await supabase
      .from("sessions")
      .update({ transcript_json: json } as never)
      .eq("id", sessionId);

    if (error) throw error;
  } catch {
    await saveLocalTranscript(sessionId, segments);
  }
}

export async function getTranscript(sessionId: string): Promise<StoredTranscriptSegment[]> {
  try {
    const supabase = getSupabaseServiceClient();
    const { data, error } = await supabase
      .from("sessions")
      .select("transcript_json")
      .eq("id", sessionId)
      .single<{ transcript_json: Array<{ speaker: string; startTime: number; endTime: number; text: string }> }>();

    if (error) throw error;

    const arr = data?.transcript_json ?? [];
    if (arr.length > 0) {
      return arr.map((seg, i) => ({
        id: `${sessionId}-t${i}`,
        sessionId,
        speaker: seg.speaker,
        startTime: seg.startTime,
        endTime: seg.endTime,
        text: seg.text
      }));
    }

    return getLocalTranscript(sessionId);
  } catch {
    return getLocalTranscript(sessionId);
  }
}

export async function saveConversationPhases(
  sessionId: string,
  segmentation: ConversationPhaseSegmentation
) {
  try {
    const supabase = getSupabaseServiceClient();
    const { error } = await supabase
      .from("sessions")
      .update({ conversation_phases_json: segmentation } as never)
      .eq("id", sessionId);

    if (error) throw error;
  } catch {
    await saveLocalConversationPhases(sessionId, segmentation);
  }
}

export async function getConversationPhases(
  sessionId: string
): Promise<ConversationPhaseSegmentation | null> {
  try {
    const supabase = getSupabaseServiceClient();
    const { data, error } = await supabase
      .from("sessions")
      .select("conversation_phases_json")
      .eq("id", sessionId)
      .single<{ conversation_phases_json: ConversationPhaseSegmentation | null }>();

    if (error) throw error;

    const raw = data?.conversation_phases_json;
    const normalized = normalizeConversationPhaseSegmentation(raw);
    if (normalized) return normalized;

    return normalizeConversationPhaseSegmentation(await getLocalConversationPhases(sessionId));
  } catch {
    return normalizeConversationPhaseSegmentation(await getLocalConversationPhases(sessionId));
  }
}

export async function saveAudioInsights(sessionId: string, insights: AudioInsights) {
  try {
    const supabase = getSupabaseServiceClient();
    const { error } = await supabase
      .from("sessions")
      .update({
        audio_insights_json: insights,
        audio_insights_status: "ready",
      } as never)
      .eq("id", sessionId);

    if (error) throw error;
  } catch {
    await saveLocalAudioInsights(sessionId, insights);
    await setLocalAudioInsightsStatus(sessionId, "ready");
  }
}

export async function clearAudioInsights(sessionId: string) {
  try {
    const supabase = getSupabaseServiceClient();
    const { error } = await supabase
      .from("sessions")
      .update({ audio_insights_json: null } as never)
      .eq("id", sessionId);

    if (error) throw error;
  } catch {
    await clearLocalAudioInsights(sessionId);
  }
}

export async function setAudioInsightsStatus(
  sessionId: string,
  status: AudioInsightsStatus
) {
  try {
    const supabase = getSupabaseServiceClient();
    const { error } = await supabase
      .from("sessions")
      .update({ audio_insights_status: status } as never)
      .eq("id", sessionId);

    if (error) throw error;
  } catch {
    await setLocalAudioInsightsStatus(sessionId, status);
  }
}

export async function getAudioInsights(sessionId: string): Promise<AudioInsights | null> {
  try {
    const supabase = getSupabaseServiceClient();
    const { data, error } = await supabase
      .from("sessions")
      .select("audio_insights_json")
      .eq("id", sessionId)
      .single<{ audio_insights_json: AudioInsights | null }>();

    if (error) throw error;

    const normalized = normalizeAudioInsights(data?.audio_insights_json);
    if (normalized) return normalized;

    return normalizeAudioInsights(await getLocalAudioInsights(sessionId));
  } catch {
    return normalizeAudioInsights(await getLocalAudioInsights(sessionId));
  }
}

function mapSessionRow(row: SessionRow): SessionSummary {
  return {
    id: row.id,
    title: row.title,
    prospectName: normalizeParticipantName(row.prospect_name),
    agentName: normalizeParticipantName(row.agent_name),
    scheduledAt: row.scheduled_at,
    location: row.location,
    status: normalizeSessionStatus(row.status),
    source: row.source ?? "manual",
    leads: row.leads ?? [],
    rubricId: row.rubric_id ?? null,
    agentId: row.agent_id ?? null,
    propertyId: row.property_id ?? null,
    unitLabel: row.unit_label ?? null,
    overallScore: row.overall_score,
    duration: row.duration,
    createdAt: row.created_at,
    audioInsightsStatus: normalizeAudioInsightsStatus(row.audio_insights_status),
  };
}

function mapSessionDetailRow(row: SessionRow): SessionDetail {
  return {
    ...mapSessionRow(row),
    notes: row.notes,
    videoUrl: row.video_url,
    audioUrl: row.audio_url,
    duration: row.duration
  };
}

function mapFollowUpActionRow(row: FollowUpActionRow): FollowUpAction {
  return {
    id: row.id,
    sessionId: row.session_id,
    title: row.title,
    description: row.description,
    priority: row.priority,
    status: row.status,
    suggestedMessage: row.suggested_message,
    createdAt: row.created_at
  };
}
