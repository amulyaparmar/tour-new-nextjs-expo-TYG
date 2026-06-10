import "server-only";

import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { getSupabaseServiceClient } from "./supabase";

const BUCKET_NAME = "recordings";

export async function storeRecording(sessionId: string, file: Blob): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = guessExtension(file.type);
  const fileName = `${sessionId}.${ext}`;

  try {
    const supabase = getSupabaseServiceClient();

    const { data: buckets } = await supabase.storage.listBuckets();
    const bucketExists = buckets?.some((b) => b.name === BUCKET_NAME);
    if (!bucketExists) {
      await supabase.storage.createBucket(BUCKET_NAME, { public: false });
    }

    const { error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(fileName, buffer, {
        contentType: file.type || "application/octet-stream",
        upsert: true
      });

    if (error) throw error;

    const { data: urlData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(fileName);

    return urlData.publicUrl;
  } catch {
    const localDir = path.join(process.cwd(), ".local-uploads");
    await mkdir(localDir, { recursive: true });
    const localPath = path.join(localDir, fileName);
    await writeFile(localPath, buffer);
    return `/local-uploads/${fileName}`;
  }
}

function guessExtension(mimeType: string): string {
  if (mimeType.includes("mp4")) return "mp4";
  if (mimeType.includes("webm")) return "webm";
  if (mimeType.includes("m4a") || mimeType.includes("mp4a")) return "m4a";
  if (mimeType.includes("wav")) return "wav";
  if (mimeType.includes("mpeg") || mimeType.includes("mp3")) return "mp3";
  if (mimeType.includes("ogg")) return "ogg";
  return "bin";
}
