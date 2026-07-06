import { NextResponse } from "next/server";

import { getSessionById, setSessionStatus, updateSession } from "@/lib/sessions";
import {
  getRecordingPlaybackPath,
  storageObjectExists,
} from "@/lib/storage";

type Context = { params: Promise<{ id: string }> };

function isVideoMime(mimeType: string): boolean {
  return mimeType.startsWith("video/");
}

export async function POST(request: Request, context: Context) {
  const { id } = await context.params;

  try {
    const session = await getSessionById(id);
    if (!session) {
      return NextResponse.json({ error: "Session not found." }, { status: 404 });
    }

    const body = (await request.json()) as {
      objectKey?: string;
      contentType?: string;
      durationSec?: number;
    };

    const objectKey = String(body.objectKey ?? "").trim();
    if (!objectKey || !objectKey.startsWith(`${id}.`)) {
      return NextResponse.json({ error: "Invalid upload object key." }, { status: 400 });
    }

    const exists = await storageObjectExists(objectKey);
    if (!exists) {
      return NextResponse.json({ error: "Uploaded file not found in storage." }, { status: 400 });
    }

    const contentType = String(body.contentType ?? "application/octet-stream").trim()
      || "application/octet-stream";
    const url = getRecordingPlaybackPath(id);
    const parsedDuration = Number(body.durationSec);
    const isVideo = isVideoMime(contentType);

    await updateSession(id, {
      ...(isVideo ? { videoUrl: url } : { audioUrl: url }),
      ...(Number.isFinite(parsedDuration) && parsedDuration > 0
        ? { duration: Math.round(parsedDuration) }
        : {}),
    });
    await setSessionStatus(id, "uploaded");

    return NextResponse.json({ url, status: "uploaded" });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to finalize upload." },
      { status: 500 }
    );
  }
}
