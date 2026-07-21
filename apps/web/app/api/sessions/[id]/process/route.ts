import { NextResponse } from "next/server";
import { start } from "workflow/api";

import {
  prepareAudioInsightsProcessing,
} from "@/lib/start-audio-insights-workflow";
import { getSessionById, setSessionStatus } from "@/lib/sessions";
import { processSessionWorkflow } from "@/workflows/process-session";

type Context = { params: Promise<{ id: string }> };

const PROCESSING_STATUSES = new Set([
  "transcribing",
  "segmenting",
  "analyzing",
  "extracting_screenshots", // legacy rows still in flight
]);

export async function POST(_request: Request, context: Context) {
  const { id } = await context.params;

  try {
    const session = await getSessionById(id);
    if (!session) {
      return NextResponse.json({ error: "Session not found." }, { status: 404 });
    }

    if (PROCESSING_STATUSES.has(session.status)) {
      return NextResponse.json(
        { ok: true, async: true, message: "Processing already in progress." },
        { status: 202 }
      );
    }

    await setSessionStatus(id, "transcribing");
    await prepareAudioInsightsProcessing(id);

    const run = await start(processSessionWorkflow, [id]);

    return NextResponse.json(
      {
        ok: true,
        async: true,
        runId: run.runId,
        message: "Processing started."
      },
      { status: 202 }
    );
  } catch (error) {
    await setSessionStatus(id, "failed").catch(() => {});
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to start processing." },
      { status: 500 }
    );
  }
}
