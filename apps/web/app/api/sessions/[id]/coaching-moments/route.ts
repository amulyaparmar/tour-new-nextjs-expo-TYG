import { NextResponse } from "next/server";

import type { AnalysisResult } from "@tour/shared";

import { AdminAuthError } from "@/lib/admin-auth";
import { requireSessionReadAccess } from "@/lib/session-access";
import { getAnalysisRun } from "@/lib/sessions";

type Context = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, context: Context) {
  const { id } = await context.params;

  try {
    const { session } = await requireSessionReadAccess(request, id);
    const requestUrl = new URL(request.url);
    const analysisRun = await getAnalysisRun(id, requestUrl.searchParams.get("version"));

    if (!analysisRun) {
      return NextResponse.json({ error: "No completed analysis is available." }, { status: 404 });
    }
    if (!analysisRun.result.exactMoments.length) {
      return NextResponse.json({ error: "No coaching moments are available for download." }, { status: 404 });
    }

    const filename = `${safeFilename(session.title) || "session"}-coaching-moments.txt`;
    const body = formatCoachingMoments(
      session.title,
      analysisRun.result.exactMoments,
      analysisRun.version,
      analysisRun.rubricName
    );

    return new Response(body, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to download coaching moments." },
      { status: 500 }
    );
  }
}

function formatCoachingMoments(
  title: string,
  moments: AnalysisResult["exactMoments"],
  version: number,
  rubricName: string | null
) {
  const heading = [
    cleanLine(title) || "Session",
    "Coaching moments",
    `Analysis version: ${version}`,
    ...(rubricName ? [`Rubric: ${cleanLine(rubricName)}`] : []),
  ];
  const entries = moments.flatMap((moment, index) => [
    `Moment ${index + 1} | ${cleanLine(moment.timestamp) || "--:--"}`,
    `Transcript: "${cleanLine(moment.transcriptQuote) || "No quote captured."}"`,
    `Coaching observation: ${cleanLine(moment.explanation) || "No explanation captured."}`,
    `Try instead: ${cleanLine(moment.suggestedImprovement) || "No suggested improvement captured."}`,
  ].concat(index < moments.length - 1 ? [""] : []));

  return `${heading.concat("", entries).join("\n")}\n`;
}

function cleanLine(value: unknown) {
  return String(value ?? "").replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
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
