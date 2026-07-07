import { NextResponse } from "next/server";

import { getAudioInsights, getSessionById } from "@/lib/sessions";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  const { id } = await context.params;

  try {
    const session = await getSessionById(id);
    if (!session) {
      return NextResponse.json({ error: "Session not found." }, { status: 404 });
    }

    const insights =
      session.audioInsightsStatus === "ready"
        ? await getAudioInsights(id)
        : null;

    return NextResponse.json({
      status: session.audioInsightsStatus,
      insights,
      error: session.audioInsightsStatus === "failed"
        ? "Audio insights analysis failed."
        : null,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load audio insights." },
      { status: 500 }
    );
  }
}
