import { NextResponse } from "next/server";

import { AdminAuthError } from "@/lib/admin-auth";
import { requireSessionReadAccess } from "@/lib/session-access";
import { fetchRecordingFile } from "@/lib/storage";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  const { id } = await context.params;

  try {
    await requireSessionReadAccess(request, id);
    const file = await fetchRecordingFile(id);
    if (!file) {
      return NextResponse.json({ error: "Recording not found." }, { status: 404 });
    }

    const range = request.headers.get("range");
    const wantsDownload = new URL(request.url).searchParams.get("download") === "1";
    const total = file.buffer.length;
    const downloadHeader: Record<string, string> = wantsDownload
      ? { "Content-Disposition": `attachment; filename="${file.fileName.split("/").at(-1) || `${id}.bin`}"` }
      : {};

    if (range) {
      const match = /^bytes=(\d+)-(\d*)$/.exec(range);
      if (match) {
        const start = parseInt(match[1]!, 10);
        const end = match[2] ? parseInt(match[2], 10) : total - 1;
        const chunk = file.buffer.subarray(start, end + 1);

        return new NextResponse(new Uint8Array(chunk), {
          status: 206,
          headers: {
            "Content-Type": file.mimeType,
            "Content-Length": String(chunk.length),
            "Content-Range": `bytes ${start}-${end}/${total}`,
            "Accept-Ranges": "bytes",
            "Cache-Control": "private, max-age=3600",
            ...downloadHeader,
          },
        });
      }
    }

    return new NextResponse(new Uint8Array(file.buffer), {
      headers: {
        "Content-Type": file.mimeType,
        "Content-Length": String(total),
        "Accept-Ranges": "bytes",
        "Cache-Control": "private, max-age=3600",
        ...downloadHeader,
      },
    });
  } catch (error) {
    const status = error instanceof AdminAuthError ? error.status : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load recording." },
      { status }
    );
  }
}
