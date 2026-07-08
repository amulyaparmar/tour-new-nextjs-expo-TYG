import { NextResponse } from "next/server";

import { startAudioInsightsWorkflow } from "@/lib/start-audio-insights-workflow";
import { getAudioInsights, getSessionById } from "@/lib/sessions";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  const { id } = await context.params;

  try {
    const session = await getSessionById(id);
    if (!session) {
      return NextResponse.json({ error: "Session not found." }, { status: 404 });
    }

    let status = session.audioInsightsStatus;
    if (status === "pending" && session.status === "analysis_ready") {
      try {
        const run = await startAudioInsightsWorkflow(id);
        status = run.skipped ? "unavailable" : "processing";
      } catch (error) {
        console.error(`[audio-insights] Failed to start workflow for session ${id}:`, error);
        status = "failed";
      }
    }

    const insights =
      status === "ready"
        ? await getAudioInsights(id)
        : null;

    return NextResponse.json({
      status,
      insights,
      error: status === "failed"
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
