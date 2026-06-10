import "server-only";

import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);

export type Screenshot = {
  id: string;
  sessionId: string;
  timestamp: number;
  filename: string;
  reason: "key_moment" | "interval";
  label: string;
};

type StoreShape = Record<string, Screenshot[]>;

const STORE_PATH = path.join(process.cwd(), ".codex", "screenshots-store.json");
const UPLOADS_DIR = path.join(process.cwd(), ".local-uploads");

async function loadStore(): Promise<StoreShape> {
  try {
    const raw = await readFile(STORE_PATH, "utf8");
    return JSON.parse(raw) as StoreShape;
  } catch {
    return {};
  }
}

async function saveStore(store: StoreShape) {
  await mkdir(path.dirname(STORE_PATH), { recursive: true });
  await writeFile(STORE_PATH, JSON.stringify(store, null, 2), "utf8");
}

export async function getScreenshots(sessionId: string): Promise<Screenshot[]> {
  const store = await loadStore();
  return store[sessionId] ?? [];
}

/**
 * Extract screenshots from a video file at specified timestamps using ffmpeg.
 * Falls back to interval-based extraction if no timestamps are provided.
 */
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

  const screenshots: Screenshot[] = [];

  for (let i = 0; i < allTimestamps.length; i++) {
    const ts = allTimestamps[i];
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
        screenshots.push({
          id: `${sessionId}-s${i}`,
          sessionId,
          timestamp: ts.seconds,
          filename,
          reason: isKeyMoment ? "key_moment" : "interval",
          label: ts.label
        });
      }
    } catch {
      // Skip frames that fail to extract
    }
  }

  const store = await loadStore();
  store[sessionId] = screenshots;
  await saveStore(store);

  return screenshots;
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
