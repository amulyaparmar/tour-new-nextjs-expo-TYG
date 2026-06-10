import "server-only";

import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

import { getSupabaseServiceClient } from "./supabase";

const exec = promisify(execFile);

export type Screenshot = {
  id: string;
  sessionId: string;
  timestamp: number;
  imageUrl: string;
  reason: "key_moment" | "interval";
  label: string;
};

type ScreenshotJson = {
  timestamp: number;
  storagePath: string;
  reason: "key_moment" | "interval";
  label: string;
};

const BUCKET_NAME = "screenshots";
const UPLOADS_DIR = path.join(process.cwd(), ".local-uploads");

// ── Local fallback store ────────────────────────────────
type LocalScreenshot = Screenshot & { filename?: string };
type StoreShape = Record<string, LocalScreenshot[]>;
const STORE_PATH = path.join(process.cwd(), ".codex", "screenshots-store.json");

async function loadLocalStore(): Promise<StoreShape> {
  try {
    const raw = await readFile(STORE_PATH, "utf8");
    return JSON.parse(raw) as StoreShape;
  } catch {
    return {};
  }
}

async function saveLocalStore(store: StoreShape) {
  await mkdir(path.dirname(STORE_PATH), { recursive: true });
  await writeFile(STORE_PATH, JSON.stringify(store, null, 2), "utf8");
}

// ── Public API ──────────────────────────────────────────

export async function getScreenshots(sessionId: string): Promise<Screenshot[]> {
  try {
    const supabase = getSupabaseServiceClient();
    const { data, error } = await supabase
      .from("sessions")
      .select("screenshots_json")
      .eq("id", sessionId)
      .single<{ screenshots_json: ScreenshotJson[] }>();

    if (error) throw error;

    const arr = data?.screenshots_json ?? [];
    if (arr.length > 0) {
      const { data: urlData } = supabase.storage.from(BUCKET_NAME).getPublicUrl("_placeholder_");
      const baseUrl = urlData.publicUrl.replace("_placeholder_", "");

      return arr.map((s, i) => ({
        id: `${sessionId}-s${i}`,
        sessionId,
        timestamp: s.timestamp,
        imageUrl: `${baseUrl}${s.storagePath}`,
        reason: s.reason,
        label: s.label
      }));
    }

    // Supabase column is empty — check local store for pre-migration data
    return getLocalScreenshots(sessionId);
  } catch {
    return getLocalScreenshots(sessionId);
  }
}

async function getLocalScreenshots(sessionId: string): Promise<Screenshot[]> {
  const store = await loadLocalStore();
  return (store[sessionId] ?? []).map((s) => ({
    id: s.id,
    sessionId: s.sessionId,
    timestamp: s.timestamp,
    imageUrl: s.imageUrl || `/api/local-uploads/${s.filename ?? ""}`,
    reason: s.reason,
    label: s.label
  }));
}

export async function extractScreenshots(
  sessionId: string,
  timestamps: Array<{ seconds: number; label: string }>
): Promise<Screenshot[]> {
  const videoPath = await findVideoFile(sessionId);
  if (!videoPath) return [];

  await mkdir(UPLOADS_DIR, { recursive: true });

  const duration = await getVideoDuration(videoPath);
  const allTimestamps = [...timestamps];

  if (duration > 0) {
    const intervalSeconds = Math.max(30, Math.floor(duration / 8));
    for (let t = intervalSeconds; t < duration - 5; t += intervalSeconds) {
      const alreadyCovered = allTimestamps.some((ts) => Math.abs(ts.seconds - t) < 15);
      if (!alreadyCovered) {
        allTimestamps.push({ seconds: t, label: `Interval capture at ${fmtTime(t)}` });
      }
    }
  }

  allTimestamps.sort((a, b) => a.seconds - b.seconds);

  const extracted: Array<{ localPath: string; filename: string; timestamp: number; reason: "key_moment" | "interval"; label: string }> = [];

  for (let i = 0; i < allTimestamps.length; i++) {
    const ts = allTimestamps[i]!;
    const isKeyMoment = timestamps.some((t) => t.seconds === ts.seconds);
    const filename = `${sessionId}-screenshot-${i}.jpg`;
    const outputPath = path.join(UPLOADS_DIR, filename);

    try {
      await exec("ffmpeg", [
        "-y",
        "-ss", String(ts.seconds),
        "-i", videoPath,
        "-frames:v", "1",
        "-q:v", "3",
        "-vf", "scale=640:-2",
        outputPath
      ], { timeout: 15000 });

      if (existsSync(outputPath)) {
        extracted.push({
          localPath: outputPath,
          filename,
          timestamp: ts.seconds,
          reason: isKeyMoment ? "key_moment" : "interval",
          label: ts.label
        });
      }
    } catch {
      // Skip frames that fail
    }
  }

  if (extracted.length === 0) return [];

  try {
    const supabase = getSupabaseServiceClient();

    const { data: buckets } = await supabase.storage.listBuckets();
    if (!buckets?.some((b) => b.name === BUCKET_NAME)) {
      await supabase.storage.createBucket(BUCKET_NAME, { public: true });
    }

    const screenshotJson: ScreenshotJson[] = [];
    const results: Screenshot[] = [];

    for (const item of extracted) {
      const fileBuffer = await readFile(item.localPath);
      const storagePath = `${sessionId}/${item.filename}`;

      await supabase.storage.from(BUCKET_NAME).upload(storagePath, fileBuffer, {
        contentType: "image/jpeg",
        upsert: true
      });

      const { data: urlData } = supabase.storage.from(BUCKET_NAME).getPublicUrl(storagePath);

      screenshotJson.push({
        timestamp: item.timestamp,
        storagePath,
        reason: item.reason,
        label: item.label
      });

      results.push({
        id: `${sessionId}-s${results.length}`,
        sessionId,
        timestamp: item.timestamp,
        imageUrl: urlData.publicUrl,
        reason: item.reason,
        label: item.label
      });
    }

    await supabase
      .from("sessions")
      .update({ screenshots_json: screenshotJson } as never)
      .eq("id", sessionId);

    return results;
  } catch {
    const screenshots: Screenshot[] = extracted.map((item, i) => ({
      id: `${sessionId}-s${i}`,
      sessionId,
      timestamp: item.timestamp,
      imageUrl: `/api/local-uploads/${item.filename}`,
      reason: item.reason,
      label: item.label
    }));

    const store = await loadLocalStore();
    store[sessionId] = screenshots.map((s, i) => ({ ...s, filename: extracted[i]!.filename }));
    await saveLocalStore(store);

    return screenshots;
  }
}

async function findVideoFile(sessionId: string): Promise<string | null> {
  const extensions = ["webm", "mp4", "mov", "m4a", "wav"];
  for (const ext of extensions) {
    const filePath = path.join(UPLOADS_DIR, `${sessionId}.${ext}`);
    if (existsSync(filePath)) return filePath;
  }
  return null;
}

async function getVideoDuration(filePath: string): Promise<number> {
  try {
    const { stdout } = await exec("ffprobe", [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      filePath
    ], { timeout: 10000 });
    return parseFloat(stdout.trim()) || 0;
  } catch {
    return 0;
  }
}

function fmtTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
