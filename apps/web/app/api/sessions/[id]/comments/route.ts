import { NextResponse } from "next/server";

import { AdminAuthError } from "@/lib/admin-auth";
import { createComment, deleteComment, getCommentSessionId, listComments, updateComment } from "@/lib/comments";
import { requireSessionReadAccess } from "@/lib/session-access";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  const { id } = await context.params;
  try {
    await requireSessionReadAccess(request, id);
    const comments = await listComments(id);
    return NextResponse.json({ comments });
  } catch (error) {
    const status = error instanceof AdminAuthError ? error.status : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch comments." },
      { status }
    );
  }
}

export async function POST(request: Request, context: Context) {
  const { id } = await context.params;
  try {
    await requireSessionReadAccess(request, id);
    const body = (await request.json()) as {
      body?: string;
      authorName?: string;
      kind?: "comment" | "key_moment";
      timestampSec?: number | null;
      parentId?: string | null;
    };

    if (!body.body?.trim()) {
      return NextResponse.json({ error: "Comment body is required." }, { status: 400 });
    }

    const kind = body.kind ?? "comment";
    if (kind === "key_moment" && (body.timestampSec == null || !Number.isFinite(body.timestampSec))) {
      return NextResponse.json({ error: "Key moments require timestampSec." }, { status: 400 });
    }

    const comment = await createComment({
      sessionId: id,
      authorName: body.authorName,
      body: body.body,
      kind,
      timestampSec: body.timestampSec,
      parentId: body.parentId,
    });

    return NextResponse.json({ comment }, { status: 201 });
  } catch (error) {
    const status = error instanceof AdminAuthError ? error.status : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create comment." },
      { status }
    );
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    const { commentId } = (await request.json()) as { commentId?: string };
    if (!commentId) {
      return NextResponse.json({ error: "commentId is required." }, { status: 400 });
    }
    await requireMatchingCommentAccess(request, id, commentId);
    await deleteComment(commentId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const status = error instanceof AdminAuthError ? error.status : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete comment." },
      { status }
    );
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as { commentId?: string; body?: string };
    if (!body.commentId) {
      return NextResponse.json({ error: "commentId is required." }, { status: 400 });
    }
    if (!body.body?.trim()) {
      return NextResponse.json({ error: "Comment body is required." }, { status: 400 });
    }
    await requireMatchingCommentAccess(request, id, body.commentId);

    const comment = await updateComment(body.commentId, body.body);
    return NextResponse.json({ comment });
  } catch (error) {
    const status = error instanceof AdminAuthError ? error.status : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update comment." },
      { status }
    );
  }
}

async function requireMatchingCommentAccess(request: Request, routeSessionId: string, commentId: string) {
  const commentSessionId = await getCommentSessionId(commentId);
  if (!commentSessionId || commentSessionId !== routeSessionId) {
    throw new AdminAuthError("This comment does not belong to the selected session.", 403);
  }
  await requireSessionReadAccess(request, routeSessionId);
}
