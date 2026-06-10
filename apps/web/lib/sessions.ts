import "server-only";

import type {
  AnalysisResult,
  CreateSessionInput,
  FollowUpAction,
  SessionDetail,
  SessionStatus,
  SessionSummary
} from "@tour/shared";

import {
  createLocalSession,
  getLocalAnalysis,
  getLocalSessionById,
  listLocalActions,
  listLocalSessions,
  replaceLocalActions,
  setLocalSessionStatus,
  updateLocalActionStatus,
  upsertLocalAnalysis
} from "./local-store";
import { getSupabaseServiceClient } from "./supabase";

type SessionRow = {
  id: string;
  title: string;
  prospect_name: string | null;
  scheduled_at: string | null;
  location: string | null;
  status: SessionStatus;
  overall_score: number | null;
  notes: string | null;
  video_url: string | null;
  audio_url: string | null;
  duration: number | null;
  created_at: string;
};

type AnalysisRow = {
  id: string;
  session_id: string;
  status: "processing" | "ready" | "failed";
  result_json: AnalysisResult;
  created_at: string;
};

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

export async function listSessions(): Promise<SessionSummary[]> {
  try {
    const supabase = getSupabaseServiceClient();
    const { data, error } = await supabase
      .from("sessions")
      .select(
        "id,title,prospect_name,scheduled_at,location,status,overall_score,notes,video_url,audio_url,duration,created_at"
      )
      .order("scheduled_at", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    return (data ?? []).map(mapSessionRow);
  } catch {
    return listLocalSessions();
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
    prospect_name: input.prospectName?.trim() ? input.prospectName.trim() : null,
    notes: input.notes?.trim() ? input.notes.trim() : null,
    status: "scheduled" as const
  };

  try {
    const supabase = getSupabaseServiceClient();
    const { data, error } = await supabase
      .from("sessions")
      .insert(payload as never)
      .select(
        "id,title,prospect_name,scheduled_at,location,status,overall_score,notes,video_url,audio_url,duration,created_at"
      )
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
      prospectName: input.prospectName ?? null,
      notes: input.notes ?? null
    });
  }
}

export async function getSessionById(sessionId: string): Promise<SessionDetail | null> {
  try {
    const supabase = getSupabaseServiceClient();
    const { data, error } = await supabase
      .from("sessions")
      .select(
        "id,title,prospect_name,scheduled_at,location,status,overall_score,notes,video_url,audio_url,duration,created_at"
      )
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

export async function getAnalysisBySessionId(sessionId: string): Promise<AnalysisResult | null> {
  try {
    const supabase = getSupabaseServiceClient();
    const { data, error } = await supabase
      .from("analyses")
      .select("id,session_id,status,result_json,created_at")
      .eq("session_id", sessionId)
      .maybeSingle<AnalysisRow>();

    if (error) {
      throw new Error(`Failed to fetch analysis: ${error.message}`);
    }

    return data?.result_json ?? null;
  } catch {
    return getLocalAnalysis(sessionId);
  }
}

export async function upsertAnalysis(
  sessionId: string,
  analysis: AnalysisResult
): Promise<AnalysisResult> {
  try {
    const supabase = getSupabaseServiceClient();

    const { error: sessionUpdateError } = await supabase
      .from("sessions")
      .update({
        status: "analysis_ready",
        overall_score: analysis.overallScore
      } as never)
      .eq("id", sessionId);

    if (sessionUpdateError) {
      throw new Error(`Failed to update session status: ${sessionUpdateError.message}`);
    }

    const { error } = await supabase.from("analyses").upsert(
      {
        session_id: sessionId,
        status: "ready",
        result_json: analysis
      } as never,
      {
        onConflict: "session_id"
      }
    );

    if (error) {
      throw new Error(`Failed to save analysis: ${error.message}`);
    }

    return analysis;
  } catch {
    await upsertLocalAnalysis(sessionId, analysis);
    return analysis;
  }
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

function mapSessionRow(row: SessionRow): SessionSummary {
  return {
    id: row.id,
    title: row.title,
    prospectName: row.prospect_name,
    scheduledAt: row.scheduled_at,
    location: row.location,
    status: row.status,
    overallScore: row.overall_score,
    createdAt: row.created_at
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
