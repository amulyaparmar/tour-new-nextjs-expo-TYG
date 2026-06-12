import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

import { getSupabaseServiceClient } from "./supabase";

const BUCKET_NAME = "recordings";
const SIGNED_URL_EXPIRY = 7200; // 2 hours
const LOCAL_UPLOADS_DIR = path.join(process.cwd(), ".local-uploads");

const EXT_MIME: Record<string, string> = {
  mp4: "video/mp4",
  webm: "audio/webm",
  m4a: "audio/mp4",
  wav: "audio/wav",
  mp3: "audio/mpeg",
  ogg: "audio/ogg",
  flac: "audio/flac",
  bin: "application/octet-stream",
};

const RECORDING_EXTENSIONS = ["m4a", "mp4", "webm", "wav", "mp3", "ogg", "flac", "bin"] as const;

export type RecordingFile = {
  buffer: Buffer;
  mimeType: string;
  fileName: string;
};

async function ensureBucket() {
  const supabase = getSupabaseServiceClient();
  const { data: buckets } = await supabase.storage.listBuckets();
  const exists = buckets?.some((b) => b.name === BUCKET_NAME);
  if (!exists) {
    await supabase.storage.createBucket(BUCKET_NAME, { public: true });
  }
}

export async function storeRecording(sessionId: string, file: Blob): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = guessExtension(file.type);
  const fileName = `${sessionId}.${ext}`;
  const contentType = file.type || EXT_MIME[ext] || "application/octet-stream";

  const supabase = getSupabaseServiceClient();
  await ensureBucket();

  const { error } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(fileName, buffer, { contentType, upsert: true });

  if (error) throw new Error(`Supabase upload failed: ${error.message}`);

  // Persist a stable playback path — clients resolve via /api/sessions/:id/recording
  return getRecordingPlaybackPath(sessionId);
}

/** Relative API path used for playback (proxied, works on web + mobile). */
export function getRecordingPlaybackPath(sessionId: string): string {
  return `/api/sessions/${sessionId}/recording`;
}

export function isPlayableRecordingUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  if (url.includes("local-uploads")) return false;
  return (
    url.startsWith("http://") ||
    url.startsWith("https://") ||
    url.startsWith("/api/sessions/") && url.endsWith("/recording")
  );
}

export function isLegacyLocalUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return url.includes("local-uploads") || (url.startsWith("/") && !url.startsWith("/api/"));
}

/** Fresh signed URL for direct Supabase access (optional; prefer playback proxy). */
export async function getRecordingSignedUrl(sessionId: string): Promise<string | null> {
  const fileName = await findRecordingFileName(sessionId);
  if (!fileName) return null;

  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .createSignedUrl(fileName, SIGNED_URL_EXPIRY);

  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

export async function getRecordingUrl(sessionId: string): Promise<string | null> {
  const file = await fetchRecordingFile(sessionId);
  if (!file) return null;
  return getRecordingPlaybackPath(sessionId);
}

/** Load recording bytes from Supabase Storage, with local dev fallback. */
export async function fetchRecordingFile(sessionId: string): Promise<RecordingFile | null> {
  const supabase = getSupabaseServiceClient();

  for (const ext of RECORDING_EXTENSIONS) {
    const fileName = `${sessionId}.${ext}`;
    const { data, error } = await supabase.storage.from(BUCKET_NAME).download(fileName);
    if (!error && data) {
      const buffer = Buffer.from(await data.arrayBuffer());
      if (buffer.length > 0) {
        return { buffer, mimeType: EXT_MIME[ext] ?? "application/octet-stream", fileName };
      }
    }
  }

  // Local dev fallback for pre-migration files
  for (const ext of RECORDING_EXTENSIONS) {
    const fileName = `${sessionId}.${ext}`;
    const localPath = path.join(LOCAL_UPLOADS_DIR, fileName);
    try {
      const buffer = await readFile(localPath);
      if (buffer.length > 0) {
        return { buffer, mimeType: EXT_MIME[ext] ?? "application/octet-stream", fileName };
      }
    } catch {
      continue;
    }
  }

  return null;
}

async function findRecordingFileName(sessionId: string): Promise<string | null> {
  const supabase = getSupabaseServiceClient();

  const { data: listed } = await supabase.storage.from(BUCKET_NAME).list("", {
    search: sessionId,
    limit: 20,
  });

  const match = listed?.find((f) => f.name.startsWith(sessionId));
  if (match) return match.name;

  for (const ext of RECORDING_EXTENSIONS) {
    const fileName = `${sessionId}.${ext}`;
    const { data, error } = await supabase.storage.from(BUCKET_NAME).download(fileName);
    if (!error && data) return fileName;
  }

  for (const ext of RECORDING_EXTENSIONS) {
    const fileName = `${sessionId}.${ext}`;
    try {
      await readFile(path.join(LOCAL_UPLOADS_DIR, fileName));
      return fileName;
    } catch {
      continue;
    }
  }

  return null;
}

function guessExtension(mimeType: string): string {
  if (mimeType.includes("mp4") && mimeType.includes("audio")) return "m4a";
  if (mimeType.includes("mp4")) return "mp4";
  if (mimeType.includes("webm")) return "webm";
  if (mimeType.includes("m4a") || mimeType.includes("mp4a")) return "m4a";
  if (mimeType.includes("wav")) return "wav";
  if (mimeType.includes("mpeg") || mimeType.includes("mp3")) return "mp3";
  if (mimeType.includes("ogg")) return "ogg";
  return "m4a";
}
