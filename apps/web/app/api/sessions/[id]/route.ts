import { NextResponse } from "next/server";

import type { SessionStatus } from "@tour/shared";
import { deleteSession, getSessionById, setSessionStatus, updateSession } from "@/lib/sessions";
import { getRecordingPlaybackPath, getRecordingUrl, isLegacyLocalUrl } from "@/lib/storage";

const VALID_STATUSES: SessionStatus[] = [
  "scheduled", "in_progress", "uploaded", "transcribing", "extracting_screenshots",
  "analyzing", "analysis_ready", "reviewed", "failed",
];

type Context = {
  params: Promise<{
    id: string;
  }>;
};

async function attachPlaybackUrls(session: NonNullable<Awaited<ReturnType<typeof getSessionById>>>) {
  const playbackPath = await getRecordingUrl(session.id);
  if (!playbackPath) return session;

  const isVideo = Boolean(session.videoUrl && !session.audioUrl);
  const needsUpdate =
    isLegacyLocalUrl(session.audioUrl) ||
    isLegacyLocalUrl(session.videoUrl) ||
    !session.audioUrl && !session.videoUrl;

  if (needsUpdate || session.audioUrl?.includes("supabase") || session.videoUrl?.includes("supabase")) {
    const path = getRecordingPlaybackPath(session.id);
    if (isVideo) {
      session.videoUrl = path;
    } else {
      session.audioUrl = path;
    }
  }

  return session;
}

export async function GET(_request: Request, context: Context) {
  const { id } = await context.params;

  try {
    const session = await getSessionById(id);
    if (!session) {
      return NextResponse.json({ error: "Session not found." }, { status: 404 });
    }

    await attachPlaybackUrls(session);

    return NextResponse.json({ session });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch session." },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request, context: Context) {
  const { id } = await context.params;
  try {
    const body = await request.json() as Record<string, unknown>;

    if (typeof body.status === "string") {
      if (!VALID_STATUSES.includes(body.status as SessionStatus)) {
        return NextResponse.json({ error: "Invalid status." }, { status: 400 });
      }
      await setSessionStatus(id, body.status as SessionStatus);
    }

    const fields = {
      title: typeof body.title === "string" ? body.title : undefined,
      scheduledAt: typeof body.scheduledAt === "string" ? body.scheduledAt : undefined,
      prospectName: typeof body.prospectName === "string" ? body.prospectName : undefined,
      location: typeof body.location === "string" ? body.location : undefined,
      notes: typeof body.notes === "string" ? body.notes : undefined,
    };
    if (Object.values(fields).some((value) => value !== undefined)) {
      await updateSession(id, fields);
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Update failed." },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: Request, context: Context) {
  const { id } = await context.params;
  try {
    await deleteSession(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Delete failed." },
      { status: 500 }
    );
  }
}
