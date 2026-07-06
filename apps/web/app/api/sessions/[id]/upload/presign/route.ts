import { NextResponse } from "next/server";

import { getSessionById } from "@/lib/sessions";
import {
  createPresignedUpload,
  resolveUploadExtension,
} from "@/lib/storage";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  const { id } = await context.params;

  try {
    const session = await getSessionById(id);
    if (!session) {
      return NextResponse.json({ error: "Session not found." }, { status: 404 });
    }

    const body = (await request.json()) as {
      fileName?: string;
      contentType?: string;
    };

    const fileName = String(body.fileName ?? "recording.m4a").trim() || "recording.m4a";
    const contentType = String(body.contentType ?? "application/octet-stream").trim()
      || "application/octet-stream";
    const ext = resolveUploadExtension(fileName, contentType);
    const objectKey = `${id}.${ext}`;

    const presign = await createPresignedUpload(objectKey);
    return NextResponse.json(presign);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to prepare upload." },
      { status: 500 }
    );
  }
}
