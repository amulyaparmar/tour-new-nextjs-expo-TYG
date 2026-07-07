import { NextResponse } from "next/server";

import { startReanalyzeSessionWorkflow } from "@/lib/start-reanalyze-session-workflow";
import { getAnalysisRun, getSessionById } from "@/lib/sessions";

type Context = { params: Promise<{ id: string }> };

const PROCESSING_STATUSES = new Set([
  "transcribing",
  "segmenting",
  "analyzing",
  "extracting_screenshots",
]);

type ReanalyzeBody = {
  rubricId?: string;
  resegment?: boolean;
};

export async function GET(request: Request, context: Context) {
  const { id } = await context.params;
  const version = new URL(request.url).searchParams.get("version");

  try {
    const run = await getAnalysisRun(id, version);
    return NextResponse.json({ analysis: run?.result ?? null, run });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch analysis." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request, context: Context) {
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

    const body = await request.json().catch(() => ({})) as ReanalyzeBody;
    const { runId, rubricId, resegment } = await startReanalyzeSessionWorkflow(id, {
      rubricId: body.rubricId,
      resegment: body.resegment,
    });

    return NextResponse.json(
      {
        ok: true,
        async: true,
        runId,
        rubricId,
        resegment,
        message: "Re-analysis started.",
      },
      { status: 202 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to start re-analysis." },
      { status: 500 }
    );
  }
}
