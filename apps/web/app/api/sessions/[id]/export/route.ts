import { NextResponse } from "next/server";

import { getAnalysisRun, getSessionById, getTranscript } from "@/lib/sessions";
import { buildSessionReportPdf } from "@/lib/session-report-pdf";
import { enrichSessionWithAgentName } from "@/lib/session-participants";
import { requireTourWorkspace } from "@/lib/tour-auth";

export const runtime = "nodejs";

type Context = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, context: Context) {
  const { id } = await context.params;

  try {
    const workspace = await requireTourWorkspace();
    const rawSession = await getSessionById(id);
    if (!rawSession || rawSession.propertyId !== workspace.community.id) {
      return NextResponse.json({ error: "Session not found." }, { status: 404 });
    }

    const version = new URL(request.url).searchParams.get("version");
    const analysisRun = await getAnalysisRun(id, version);
    if (!analysisRun) {
      return NextResponse.json({ error: "No completed analysis is available for export." }, { status: 404 });
    }

    const enrichedSession = await enrichSessionWithAgentName(rawSession, workspace);
    const transcript = enrichedSession.duration ? [] : await getTranscript(id);
    const transcriptDuration = transcript.reduce(
      (longest, segment) => Math.max(longest, segment.endTime || segment.startTime),
      0
    );
    const session = {
      ...enrichedSession,
      duration: enrichedSession.duration ?? (transcriptDuration > 0 ? transcriptDuration : null),
    };
    const pdf = await buildSessionReportPdf({
      session,
      analysis: analysisRun.result,
      propertyName: workspace.community.name,
      organizationName: workspace.organization.name,
      rubricName: analysisRun.rubricName,
      analysisVersion: analysisRun.version,
      analysisCreatedAt: analysisRun.createdAt,
    });
    const filename = `${safeFilename(session.title) || "session"}-evaluation.pdf`;

    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to export session report." },
      { status: 500 }
    );
  }
}

function safeFilename(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .toLowerCase();
}
