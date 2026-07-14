import "server-only";

import { getSupabaseServiceClient } from "./supabase";

export type SessionCommentKind = "comment" | "key_moment";

export type SessionComment = {
  id: string;
  sessionId: string;
  authorName: string;
  body: string;
  kind: SessionCommentKind;
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
  kind?: SessionCommentKind | null;
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
    kind: row.kind === "key_moment" ? "key_moment" : "comment",
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
      .select("id,session_id,author_name,body,kind,timestamp_sec,parent_id,created_at,updated_at")
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
  kind?: SessionCommentKind;
  timestampSec?: number | null;
  parentId?: string | null;
}): Promise<SessionComment> {
  const kind = input.kind ?? "comment";

  if (kind === "key_moment") {
    if (input.timestampSec == null || !Number.isFinite(input.timestampSec)) {
      throw new Error("Key moments require a timestamp.");
    }
    if (input.parentId) {
      throw new Error("Key moments cannot be replies.");
    }
  }

  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from("session_comments")
    .insert({
      session_id: input.sessionId,
      author_name: input.authorName ?? "Reviewer",
      body: input.body.trim(),
      kind,
      timestamp_sec: input.timestampSec ?? null,
      parent_id: input.parentId ?? null,
    } as never)
    .select("id,session_id,author_name,body,kind,timestamp_sec,parent_id,created_at,updated_at")
    .single<CommentRow>();

  if (error || !data) throw new Error(`Failed to create comment: ${error?.message ?? "Unknown"}`);
  const comment = mapRow(data);
  void (async () => {
    try {
      const { notifySessionComment } = await import("./push");
      await notifySessionComment({
        sessionId: comment.sessionId,
        authorName: comment.authorName,
        body: comment.body,
        kind: comment.kind,
      });
    } catch {
      // Ignore push failures.
    }
  })();
  return comment;
}

export async function deleteComment(commentId: string): Promise<void> {
  const supabase = getSupabaseServiceClient();
  const { error } = await supabase.from("session_comments").delete().eq("id", commentId);
  if (error) throw new Error(`Failed to delete comment: ${error.message}`);
}

export async function updateComment(commentId: string, body: string): Promise<SessionComment> {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from("session_comments")
    .update({ body: body.trim(), updated_at: new Date().toISOString() } as never)
    .eq("id", commentId)
    .select("id,session_id,author_name,body,kind,timestamp_sec,parent_id,created_at,updated_at")
    .single<CommentRow>();

  if (error || !data) throw new Error(`Failed to update comment: ${error?.message ?? "Unknown"}`);
  return mapRow(data);
}
