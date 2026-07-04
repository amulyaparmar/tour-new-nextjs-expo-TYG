import { NextResponse } from "next/server";

import { createComment, deleteComment, listComments, updateComment } from "@/lib/comments";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  const { id } = await context.params;
  try {
    const comments = await listComments(id);
    return NextResponse.json({ comments });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch comments." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request, context: Context) {
  const { id } = await context.params;
  try {
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
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create comment." },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const { commentId } = (await request.json()) as { commentId?: string };
    if (!commentId) {
      return NextResponse.json({ error: "commentId is required." }, { status: 400 });
    }
    await deleteComment(commentId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete comment." },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as { commentId?: string; body?: string };
    if (!body.commentId) {
      return NextResponse.json({ error: "commentId is required." }, { status: 400 });
    }
    if (!body.body?.trim()) {
      return NextResponse.json({ error: "Comment body is required." }, { status: 400 });
    }

    const comment = await updateComment(body.commentId, body.body);
    return NextResponse.json({ comment });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update comment." },
      { status: 500 }
    );
  }
}
