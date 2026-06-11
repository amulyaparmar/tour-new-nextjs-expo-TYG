import "server-only";

import { getSupabaseServiceClient } from "./supabase";

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

type CommentRow = {
  id: string;
  session_id: string;
  author_name: string;
  body: string;
  timestamp_sec: number | null;
  parent_id: string | null;
  created_at: string;
  updated_at: string;
};

function mapRow(row: CommentRow): SessionComment {
  return {
    id: row.id,
    sessionId: row.session_id,
    authorName: row.author_name,
    body: row.body,
    timestampSec: row.timestamp_sec,
    parentId: row.parent_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listComments(sessionId: string): Promise<SessionComment[]> {
  try {
    const supabase = getSupabaseServiceClient();
    const { data, error } = await supabase
      .from("session_comments")
      .select("id,session_id,author_name,body,timestamp_sec,parent_id,created_at,updated_at")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });

    if (error) throw new Error(error.message);
    return ((data as CommentRow[] | null) ?? []).map(mapRow);
  } catch {
    return [];
  }
}

export async function createComment(input: {
  sessionId: string;
  authorName?: string;
  body: string;
  timestampSec?: number | null;
  parentId?: string | null;
}): Promise<SessionComment> {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from("session_comments")
    .insert({
      session_id: input.sessionId,
      author_name: input.authorName ?? "Reviewer",
      body: input.body.trim(),
      timestamp_sec: input.timestampSec ?? null,
      parent_id: input.parentId ?? null,
    } as never)
    .select("id,session_id,author_name,body,timestamp_sec,parent_id,created_at,updated_at")
    .single<CommentRow>();

  if (error || !data) throw new Error(`Failed to create comment: ${error?.message ?? "Unknown"}`);
  return mapRow(data);
}

export async function deleteComment(commentId: string): Promise<void> {
  const supabase = getSupabaseServiceClient();
  const { error } = await supabase.from("session_comments").delete().eq("id", commentId);
  if (error) throw new Error(`Failed to delete comment: ${error.message}`);
}
