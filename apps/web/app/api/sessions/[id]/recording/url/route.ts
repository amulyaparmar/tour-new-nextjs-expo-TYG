import { NextResponse } from "next/server";

import { AdminAuthError } from "@/lib/admin-auth";
import { requireSessionReadAccess } from "@/lib/session-access";
import { getRecordingSignedUrl } from "@/lib/storage";

const SIGNED_URL_EXPIRY_SEC = 7200;

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  const { id } = await context.params;

  try {
    await requireSessionReadAccess(request, id);

    const signedUrl = await getRecordingSignedUrl(id);
    if (!signedUrl) {
      return NextResponse.json({ error: "Recording not found." }, { status: 404 });
    }

    return NextResponse.json({
      signedUrl,
      expiresAt: new Date(Date.now() + SIGNED_URL_EXPIRY_SEC * 1000).toISOString(),
    });
  } catch (error) {
    const status = error instanceof AdminAuthError ? error.status : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to resolve recording URL." },
      { status },
    );
  }
}
