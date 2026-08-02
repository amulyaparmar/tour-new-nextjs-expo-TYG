import { NextResponse } from "next/server";

import { AdminAuthError } from "@/lib/admin-auth";
import { getTranscriptForSession } from "@/lib/evidence";
import { requireSessionReadAccess } from "@/lib/session-access";

type Context = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(request: Request, context: Context) {
  const { id } = await context.params;

  try {
    const { session } = await requireSessionReadAccess(request, id);
    const transcript = await getTranscriptForSession(id);
    const wantsDownload = new URL(request.url).searchParams.get("download") === "1";

    if (!wantsDownload) return NextResponse.json({ transcript });
    if (!transcript.length) {
      return NextResponse.json({ error: "No transcript is available for download." }, { status: 404 });
    }

    const filename = `${safeFilename(session.title) || "session"}-transcript.txt`;
    return new Response(formatTranscriptDownload(session.title, transcript), {
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
      { error: error instanceof Error ? error.message : "Failed to download transcript." },
      { status: 500 }
    );
  }
}

function formatTranscriptDownload(
  title: string,
  transcript: Awaited<ReturnType<typeof getTranscriptForSession>>
) {
  const lines = transcript.map((segment) => {
    const timestamp = segment.endTime > segment.startTime
      ? `${formatTimestamp(segment.startTime)}-${formatTimestamp(segment.endTime)}`
      : formatTimestamp(segment.startTime);
    const speaker = cleanLine(segment.speaker) || "Speaker";
    const text = String(segment.text ?? "").replace(/\r\n?/g, "\n").trim();
    return `[${timestamp}] ${speaker}: ${text}`;
  });

  return `${cleanLine(title) || "Session"}\nSession transcript\n\n${lines.join("\n\n")}\n`;
}

function formatTimestamp(seconds: number) {
  const totalSeconds = Math.max(0, Math.round(Number.isFinite(seconds) ? seconds : 0));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainder = totalSeconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
    : `${minutes}:${String(remainder).padStart(2, "0")}`;
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
