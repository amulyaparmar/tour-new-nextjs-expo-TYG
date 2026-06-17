/**
 * Isolated transcription smoke test for WHICHEVER provider TRANSCRIBE_PROVIDER
 * selects (whisper | deepgram | aws). Calls the same provider implementation the
 * Next /process route uses, without starting the app.
 *
 * Usage from repo root:
 *   node apps/web/scripts/test-transcribe.mjs path/to/audio.m4a
 * Usage from apps/web:
 *   node scripts/test-transcribe.mjs path/to/audio.m4a
 *
 * Override the provider for one run:
 *   TRANSCRIBE_PROVIDER=deepgram node apps/web/scripts/test-transcribe.mjs tour.m4a
 *
 * Auto-loads .env.local from the repo root and apps/web.
 */
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const audioPath = process.argv[2];
if (!audioPath) {
  console.error("Usage: node scripts/test-transcribe.mjs <audio-file>");
  process.exit(1);
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const webDir = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(webDir, "../..");

const loadedEnvFiles = await loadEnvFiles([
  path.join(repoRoot, ".env.local"),
  path.join(webDir, ".env.local"),
  path.join(process.cwd(), ".env.local")
]);

const provider = (process.env.TRANSCRIBE_PROVIDER || "whisper").toLowerCase();

const REQUIRED = {
  whisper: ["OPENAI_API_KEY"],
  deepgram: ["DEEPGRAM_API_KEY"],
  aws: ["TRANSCRIBE_S3_BUCKET", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"]
};
const missing = (REQUIRED[provider] ?? []).filter((name) => !process.env[name]);
if (missing.length) {
  console.error(`Provider "${provider}" is missing env var(s): ${missing.join(", ")}`);
  console.error(`Loaded env files: ${loadedEnvFiles.join(", ") || "(none)"}`);
  process.exit(1);
}

const absAudioPath = path.resolve(process.cwd(), audioPath);
await access(absAudioPath);

const MODULE = {
  whisper: ["../lib/transcribe-whisper.ts", "transcribeWithWhisper"],
  deepgram: ["../lib/transcribe-deepgram.ts", "transcribeWithDeepgram"],
  aws: ["../lib/transcribe-aws-core.ts", "transcribeWithAws"]
};
const [modulePath, exportName] = MODULE[provider];

const jiti = createJiti(import.meta.url);
const mod = await jiti.import(modulePath);
const transcribe = mod[exportName];

const sessionId = `smoketest-${Date.now()}`;
const mimeType = mimeTypeForPath(absAudioPath);
const buf = await readFile(absAudioPath);
const started = Date.now();

console.log(`Provider: ${provider}`);
console.log(`Audio: ${absAudioPath} (${buf.length} bytes, ${mimeType})`);
console.log("Transcribing...");

try {
  const segments = await transcribe(sessionId, buf, mimeType);
  const elapsed = Math.round((Date.now() - started) / 1000);
  const speakers = [...new Set(segments.map((s) => s.speaker))];
  const preview = segments.map((s) => `${s.speaker}: ${s.text}`).join("\n").slice(0, 400);

  console.log(`\n✓ COMPLETED in ${elapsed}s`);
  console.log(`  segments: ${segments.length}, speakers: ${speakers.join(", ")}`);
  console.log(`\n--- transcript preview ---\n${preview}${preview.length === 400 ? "\n..." : ""}`);
} catch (error) {
  console.error(`\n✗ ${provider} transcription failed:`);
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

async function loadEnvFiles(files) {
  const seen = new Set();
  const loaded = [];
  const shellKeys = new Set(Object.keys(process.env));
  for (const file of files) {
    const normalized = path.resolve(file);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    let text;
    try {
      text = await readFile(normalized, "utf8");
    } catch {
      continue;
    }
    for (const [key, value] of parseDotenv(text)) {
      if (shellKeys.has(key)) continue;
      if (value === "" && process.env[key]) continue;
      process.env[key] = value;
    }
    loaded.push(normalized);
  }
  return loaded;
}

function parseDotenv(text) {
  const entries = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eqIndex = line.indexOf("=");
    if (eqIndex === -1) continue;
    const key = line.slice(0, eqIndex).trim().replace(/^export\s+/, "");
    let value = line.slice(eqIndex + 1).trim();
    if (!key) continue;
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    entries.push([key, value]);
  }
  return entries;
}

function mimeTypeForPath(filePath) {
  const ext = path.extname(filePath).slice(1).toLowerCase();
  switch (ext) {
    case "m4a": return "audio/m4a";
    case "mp4": return "audio/mp4";
    case "webm": return "audio/webm";
    case "wav": return "audio/wav";
    case "ogg": return "audio/ogg";
    case "flac": return "audio/flac";
    case "amr": return "audio/amr";
    default: return "audio/mpeg";
  }
}
