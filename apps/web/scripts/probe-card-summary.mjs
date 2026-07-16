/**
 * Compare performance-focused vs outcome-focused cardSummary prompts on real sessions.
 *
 * Usage (from apps/web):
 *   node scripts/probe-card-summary.mjs [limit]
 */
import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const root = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(root, "../.env.local") });
config({ path: resolve(root, "../../../.env") });

const limit = Math.max(1, Number(process.argv[2] ?? 4));

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const token = process.env.AWS_BEARER_TOKEN_BEDROCK;
const region = process.env.AWS_REGION || "us-east-1";
const modelId = process.env.BEDROCK_MODEL_ID;

if (!supabaseUrl || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
if (!token || !modelId) {
  console.error("Missing AWS_BEARER_TOKEN_BEDROCK or BEDROCK_MODEL_ID");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function formatTime(seconds) {
  const m = Math.floor(Number(seconds) / 60);
  const s = Math.floor(Number(seconds) % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function wordCount(text) {
  return String(text || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function buildTranscriptText(segments) {
  return segments
    .map((s) => `[${formatTime(s.startTime)}] ${s.speaker}: ${s.text}`)
    .join("\n");
}

const TOOL = {
  name: "submit_card_summary",
  description: "Submit the short session list-card summary fields.",
  input_schema: {
    type: "object",
    properties: {
      cardSummary: { type: "string" },
      performanceSummary: { type: "string" },
      needsImprovement: { type: "string" },
    },
    required: ["cardSummary", "performanceSummary", "needsImprovement"],
  },
};

const OLD_SYSTEM = [
  "You are an expert mystery shopping evaluator for apartment leasing tours.",
  "From the transcript only, write list-card fields.",
  "- cardSummary must be exactly 9 words (no more) for list cards — punchy performance takeaway.",
  "- performanceSummary should match cardSummary (legacy performance lens).",
  "- needsImprovement must be one short sentence: the single most important coaching fix.",
  "Return ONLY via the submit_card_summary tool.",
].join("\n");

const NEW_SYSTEM = [
  "You are summarizing an apartment leasing tour conversation for a scannable session list.",
  "From the transcript only, write list-card fields.",
  "- cardSummary must be exactly 9 words (no more, no filler padding).",
  "- cardSummary is an outcome brief: what happened and where things stand — interest level, objections, decisions, next step, urgency — not a judgment of agent skill.",
  "- Prefer concrete tour substance over coaching language (avoid: \"warm discovery\", \"weak close\", \"missed rapport\").",
  "- performanceSummary must be exactly 9 words — punchy agent-performance takeaway (executive coaching lens).",
  "- needsImprovement must be one short sentence: the single most important coaching fix.",
  "Return ONLY via the submit_card_summary tool.",
].join("\n");

async function invokeCardSummary(system, session, transcriptText) {
  const url = `https://bedrock-runtime.${region}.amazonaws.com/model/${encodeURIComponent(modelId)}/invoke`;
  const body = {
    anthropic_version: "bedrock-2023-05-31",
    max_tokens: 300,
    temperature: 0.3,
    system,
    messages: [
      {
        role: "user",
        content: [
          `Session: ${session.title ?? "Untitled"}`,
          `Prospect: ${session.prospect_name ?? "Unknown"}`,
          `Location: ${session.location ?? "Unknown"}`,
          "",
          "=== TRANSCRIPT ===",
          transcriptText,
        ].join("\n"),
      },
    ],
    tools: [TOOL],
    tool_choice: { type: "tool", name: TOOL.name },
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Bedrock ${response.status}: ${errText.slice(0, 400)}`);
  }

  const data = await response.json();
  const toolUse = (data.content ?? []).find(
    (b) => b.type === "tool_use" && b.name === TOOL.name
  );
  if (!toolUse) throw new Error("No submit_card_summary tool call in response");
  return toolUse.input;
}

const { data: sessions, error } = await supabase
  .from("sessions")
  .select(
    "id,title,prospect_name,agent_name,location,card_summary,performance_summary,needs_improvement,status,created_at,transcript_json"
  )
  .order("created_at", { ascending: false })
  .limit(50);

if (error) {
  console.error("Failed to list sessions:", error.message);
  process.exit(1);
}

const picked = (sessions ?? [])
  .filter((s) => Array.isArray(s.transcript_json) && s.transcript_json.length >= 8)
  .slice(0, limit);

if (!picked.length) {
  console.error("No sessions with usable transcripts found");
  process.exit(1);
}

console.log(`Model: ${modelId}`);
console.log(`Probing ${picked.length} sessions...\n`);

for (const session of picked) {
  const transcript = session.transcript_json;
  const transcriptText = buildTranscriptText(transcript);
  const durationSec = Math.max(...transcript.map((s) => s.endTime || s.startTime || 0));
  console.log("==========");
  console.log(`${session.title || "Untitled"} (${session.id.slice(0, 8)})`);
  console.log(
    `prospect=${session.prospect_name ?? "—"} | agent=${session.agent_name ?? "—"} | segs=${transcript.length} | ~${Math.round(durationSec / 60)}m`
  );
  console.log(`stored cardSummary: ${session.card_summary ?? "(null)"}`);
  console.log(`stored performanceSummary: ${session.performance_summary ?? "(null)"}`);
  console.log(`stored needsImprovement: ${session.needs_improvement ?? "(null)"}`);

  const [oldResult, newResult] = await Promise.all([
    invokeCardSummary(OLD_SYSTEM, session, transcriptText),
    invokeCardSummary(NEW_SYSTEM, session, transcriptText),
  ]);

  const oldSummary = String(oldResult.cardSummary ?? "").trim();
  const newSummary = String(newResult.cardSummary ?? "").trim();
  const newPerf = String(newResult.performanceSummary ?? "").trim();
  console.log(`\nOLD (${wordCount(oldSummary)}w): ${oldSummary}`);
  console.log(`    needsImprovement: ${String(oldResult.needsImprovement ?? "").trim()}`);
  console.log(`NEW outcome (${wordCount(newSummary)}w): ${newSummary}`);
  console.log(`NEW performance (${wordCount(newPerf)}w): ${newPerf}`);
  console.log(`    needsImprovement: ${String(newResult.needsImprovement ?? "").trim()}`);
  console.log("");
}
