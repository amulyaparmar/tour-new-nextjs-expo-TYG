import { NextResponse } from "next/server";

import { AdminAuthError, findPropertyForSessionKey } from "@/lib/admin-auth";
import { requireSessionReadAccess } from "@/lib/session-access";
import { getAnalysisRun, getTranscript } from "@/lib/sessions";
import { buildSessionReportPdf } from "@/lib/session-report-pdf";
import { enrichSessionWithAgentName } from "@/lib/session-participants";

export const runtime = "nodejs";

type Context = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, context: Context) {
  const { id } = await context.params;

  try {
    const { workspace, session: rawSession } = await requireSessionReadAccess(request, id);

    const requestUrl = new URL(request.url);
    const version = requestUrl.searchParams.get("version");
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
    const sessionProperty = await findPropertyForSessionKey(rawSession.propertyId).catch(() => null);
    const pdf = await buildSessionReportPdf({
      session,
      analysis: analysisRun.result,
      propertyName: sessionProperty?.name ?? workspace.community.name,
      organizationName: workspace.organization.name,
      rubricName: analysisRun.rubricName,
      analysisVersion: analysisRun.version,
      analysisCreatedAt: analysisRun.createdAt,
      sessionUrl: `${requestUrl.origin}/sessions/${encodeURIComponent(id)}${version ? `?version=${encodeURIComponent(version)}` : ""}`,
      audioDownloadUrl: `${requestUrl.origin}/api/sessions/${encodeURIComponent(id)}/recording?download=1`,
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
    if (error instanceof AdminAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
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
