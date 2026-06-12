import { NextResponse } from "next/server";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

type Context = { params: Promise<{ filename: string }> };

const MIME_TYPES: Record<string, string> = {
  mp4: "video/mp4",
  webm: "video/webm",
  m4a: "audio/mp4",
  wav: "audio/wav",
  mp3: "audio/mpeg",
  ogg: "audio/ogg",
  bin: "audio/webm",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  mov: "video/quicktime",
  pdf: "application/pdf",
};

export async function GET(request: Request, context: Context) {
  const { filename } = await context.params;
  const filePath = path.join(process.cwd(), ".local-uploads", filename);

  try {
    const ext = filename.split(".").pop() ?? "";
    const contentType = MIME_TYPES[ext] ?? "application/octet-stream";
    const fileStat = await stat(filePath);
    const range = request.headers.get("range");

    if (range) {
      const match = range.match(/^bytes=(\d*)-(\d*)$/);
      if (match) {
        const start = match[1] ? Number(match[1]) : 0;
        const end = match[2] ? Number(match[2]) : fileStat.size - 1;
        const safeEnd = Math.min(end, fileStat.size - 1);

        if (start <= safeEnd && start < fileStat.size) {
          const data = await readFile(filePath);
          const chunk = data.subarray(start, safeEnd + 1);

          return new NextResponse(chunk, {
            status: 206,
            headers: {
              "Accept-Ranges": "bytes",
              "Content-Range": `bytes ${start}-${safeEnd}/${fileStat.size}`,
              "Content-Type": contentType,
              "Content-Length": String(chunk.length),
              "Cache-Control": "public, max-age=3600"
            }
          });
        }
      }
    }

    const data = await readFile(filePath);
    return new NextResponse(data, {
      headers: {
        "Accept-Ranges": "bytes",
        "Content-Type": contentType,
        "Content-Length": String(data.length),
        "Cache-Control": "public, max-age=3600"
      }
    });
  } catch {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
}
