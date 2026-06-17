/**
 * Isolated AWS Transcribe smoke test. This calls the same transcribeWithAws
 * implementation used by the Next route, without starting the app.
 *
 * Usage from repo root:
 *   node apps/web/scripts/test-transcribe-aws.mjs path/to/audio.m4a
 *
 * Usage from apps/web:
 *   node scripts/test-transcribe-aws.mjs path/to/audio.m4a
 *
 * The script auto-loads .env.local from the repo root and apps/web. It does not
 * require the AWS CLI; the S3 bucket still must already exist in AWS.
 */
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const audioPath = process.argv[2];
if (!audioPath) {
  console.error("Usage: node scripts/test-transcribe-aws.mjs <audio-file>");
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

const required = ["TRANSCRIBE_S3_BUCKET", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"];
const missing = required.filter((name) => !process.env[name]);
if (missing.length) {
  console.error(`Missing required env var(s): ${missing.join(", ")}`);
  if (loadedEnvFiles.length) {
    console.error(`Loaded env files: ${loadedEnvFiles.join(", ")}`);
  } else {
    console.error("No .env.local file was found at the repo root, apps/web, or cwd.");
  }
  process.exit(1);
}

const absAudioPath = path.resolve(process.cwd(), audioPath);
await access(absAudioPath);

const jiti = createJiti(import.meta.url);
const { transcribeWithAws } = await jiti.import("../lib/transcribe-aws-core.ts");

const sessionId = `smoketest-${Date.now()}`;
const bucket = process.env.TRANSCRIBE_S3_BUCKET;
const region = process.env.AWS_REGION || "us-east-1";
const mimeType = mimeTypeForPath(absAudioPath);
const buf = await readFile(absAudioPath);
const started = Date.now();

console.log(`Loaded env files: ${loadedEnvFiles.length ? loadedEnvFiles.join(", ") : "(none)"}`);
console.log(`Region: ${region}`);
console.log(`Bucket: s3://${bucket}`);
console.log(`Audio: ${absAudioPath} (${buf.length} bytes, ${mimeType})`);
console.log("Starting AWS Transcribe smoke test...");

try {
  const segments = await transcribeWithAws(sessionId, buf, mimeType);
  const elapsed = Math.round((Date.now() - started) / 1000);
  const speakers = [...new Set(segments.map((segment) => segment.speaker))];
  const wordCount = segments.reduce((total, segment) => total + segment.text.split(/\s+/).filter(Boolean).length, 0);
  const preview = segments.map((segment) => `${segment.speaker}: ${segment.text}`).join(" ").slice(0, 240);

  console.log(`✓ COMPLETED in ${elapsed}s`);
  console.log(`  segments: ${segments.length}, words: ${wordCount}, speakers detected: ${speakers.join(", ")}`);
  console.log(`  transcript preview: ${preview}${preview.length === 240 ? "..." : ""}`);
  console.log(`  transcript JSON at: s3://${bucket}/transcribe-output/${sessionId}.json`);
} catch (error) {
  console.error("AWS Transcribe smoke test failed.");
  console.error(error instanceof Error ? error.message : error);
  console.error("");
  console.error("Check that the bucket exists in us-east-1 and that the IAM policy allows:");
  console.error("  transcribe:StartTranscriptionJob, transcribe:GetTranscriptionJob");
  console.error(`  s3:PutObject, s3:GetObject on arn:aws:s3:::${bucket}/*`);
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

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    entries.push([key, value]);
  }
  return entries;
}

function mimeTypeForPath(filePath) {
  const ext = path.extname(filePath).slice(1).toLowerCase();
  switch (ext) {
    case "m4a":
      return "audio/m4a";
    case "mp4":
      return "audio/mp4";
    case "webm":
      return "audio/webm";
    case "wav":
      return "audio/wav";
    case "ogg":
      return "audio/ogg";
    case "flac":
      return "audio/flac";
    case "amr":
      return "audio/amr";
    default:
      return "audio/mpeg";
  }
}
