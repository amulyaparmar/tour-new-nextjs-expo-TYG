import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { readFileSync } from "node:fs";
import { createJiti } from "jiti";

const root = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(root, "../.env.local") });
config({ path: resolve(root, "../../../.env") });

const jiti = createJiti(import.meta.url);
const { isGeminiConfigured } = jiti("../lib/gemini-client.ts");
const { generateAudioInsights } = jiti("../lib/audio-insights.ts");

if (!isGeminiConfigured()) {
  console.error("GEMINI_API_KEY is not configured");
  process.exit(1);
}

const audioPath = process.argv[2];
if (!audioPath) {
  console.error("Usage: node scripts/test-gemini-audio.mjs <path-to-audio>");
  process.exit(1);
}

const buffer = readFileSync(audioPath);
const mimeType = audioPath.endsWith(".wav") ? "audio/wav" : "audio/mpeg";

const insights = await generateAudioInsights({
  audioBuffer: buffer,
  mimeType,
  fileName: audioPath.split("/").pop(),
});

console.log(JSON.stringify(insights, null, 2));
