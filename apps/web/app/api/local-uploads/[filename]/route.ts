import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";

type Context = { params: Promise<{ filename: string }> };

const MIME_TYPES: Record<string, string> = {
  mp4: "video/mp4",
  webm: "audio/webm",
  m4a: "audio/mp4",
  wav: "audio/wav",
  mp3: "audio/mpeg",
  ogg: "audio/ogg",
  bin: "audio/webm",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
};

export async function GET(_request: Request, context: Context) {
  const { filename } = await context.params;
  const filePath = path.join(process.cwd(), ".local-uploads", filename);

  try {
    const data = await readFile(filePath);
    const ext = filename.split(".").pop() ?? "";
    const contentType = MIME_TYPES[ext] ?? "application/octet-stream";

    return new NextResponse(data, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(data.length),
        "Cache-Control": "public, max-age=3600"
      }
    });
  } catch {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
}
