import "server-only";

import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import { getSupabaseServiceClient } from "./supabase";

export const RECORDINGS_BUCKET = "recordings";
const BUCKET_NAME = RECORDINGS_BUCKET;
const SIGNED_URL_EXPIRY = 7200; // 2 hours
const LOCAL_UPLOADS_DIR = path.join(process.cwd(), ".local-uploads");

const EXT_MIME: Record<string, string> = {
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "audio/webm",
  m4a: "audio/mp4",
  wav: "audio/wav",
  mp3: "audio/mpeg",
  ogg: "audio/ogg",
  flac: "audio/flac",
  jpg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  pdf: "application/pdf",
  bin: "application/octet-stream",
};

const RECORDING_EXTENSIONS = ["m4a", "mp4", "mov", "webm", "wav", "mp3", "ogg", "flac", "jpg", "png", "gif", "pdf", "bin"] as const;

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
  const fileName = await findRecordingFileName(sessionId);
  if (!fileName) return null;
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
      const fileStat = await stat(path.join(LOCAL_UPLOADS_DIR, fileName));
      if (!fileStat.isFile() || fileStat.size === 0) continue;
      return fileName;
    } catch {
      continue;
    }
  }

  return null;
}

export type PresignedUpload = {
  signedUrl: string;
  token: string;
  path: string;
  objectKey: string;
};

export function extensionFromFileName(fileName: string): string | null {
  const match = /\.([a-z0-9]+)$/i.exec(fileName.trim());
  return match ? match[1]!.toLowerCase() : null;
}

export function resolveUploadExtension(fileName: string, contentType: string): string {
  return extensionFromFileName(fileName) ?? guessExtension(contentType);
}

export async function createPresignedUpload(
  objectKey: string,
  options?: { upsert?: boolean }
): Promise<PresignedUpload> {
  const supabase = getSupabaseServiceClient();
  await ensureBucket();

  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .createSignedUploadUrl(objectKey, { upsert: options?.upsert ?? true });

  if (error || !data?.signedUrl || !data.token || !data.path) {
    throw new Error(error?.message ?? "Failed to create presigned upload URL.");
  }

  return {
    signedUrl: data.signedUrl,
    token: data.token,
    path: data.path,
    objectKey,
  };
}

export async function storageObjectExists(objectKey: string): Promise<boolean> {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase.storage.from(BUCKET_NAME).download(objectKey);
  if (error || !data) return (
    false
  );
  const buffer = Buffer.from(await data.arrayBuffer());
  return buffer.length > 0;
}

export async function downloadStorageObject(objectKey: string): Promise<RecordingFile | null> {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase.storage.from(BUCKET_NAME).download(objectKey);
  if (error || !data) return null;

  const buffer = Buffer.from(await data.arrayBuffer());
  if (buffer.length === 0) return null;

  const ext = extensionFromFileName(objectKey) ?? "bin";
  return {
    buffer,
    mimeType: EXT_MIME[ext] ?? "application/octet-stream",
    fileName: objectKey,
  };
}

function guessExtension(mimeType: string): string {
  if (mimeType.includes("mp4") && mimeType.includes("audio")) return "m4a";
  if (mimeType.includes("mp4")) return "mp4";
  if (mimeType.includes("quicktime")) return "mov";
  if (mimeType.includes("webm")) return "webm";
  if (mimeType.includes("m4a") || mimeType.includes("mp4a")) return "m4a";
  if (mimeType.includes("wav")) return "wav";
  if (mimeType.includes("mpeg") || mimeType.includes("mp3")) return "mp3";
  if (mimeType.includes("ogg")) return "ogg";
  if (mimeType.includes("jpeg") || mimeType.includes("jpg")) return "jpg";
  if (mimeType.includes("png")) return "png";
  if (mimeType.includes("gif")) return "gif";
  if (mimeType.includes("pdf")) return "pdf";
  return "bin";
}
