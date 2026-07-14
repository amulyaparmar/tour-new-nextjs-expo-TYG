import { NextResponse } from "next/server";

import { getSessionById } from "@/lib/sessions";
import { getRecordingSignedUrl } from "@/lib/storage";

const SIGNED_URL_EXPIRY_SEC = 7200;

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  const { id } = await context.params;

  try {
    const session = await getSessionById(id);
    if (!session) {
      return NextResponse.json({ error: "Session not found." }, { status: 404 });
    }

    const signedUrl = await getRecordingSignedUrl(id);
    if (!signedUrl) {
      return NextResponse.json({ error: "Recording not found." }, { status: 404 });
    }

    return NextResponse.json({
      signedUrl,
      expiresAt: new Date(Date.now() + SIGNED_URL_EXPIRY_SEC * 1000).toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to resolve recording URL." },
      { status: 500 },
    );
  }
}
