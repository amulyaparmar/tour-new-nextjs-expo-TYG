import Module from "node:module";
import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "server-only") return {};
  return originalLoad.call(this, request, parent, isMain);
};

const root = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(root, "../.env.local") });
config({ path: resolve(root, "../../../.env") });

const sessionId = process.argv[2];
const runs = Number(process.argv[3] ?? 1);

if (!sessionId) {
  console.error("Usage: node apps/web/scripts/test-tour-segmentation.mjs <session-id> [runs]");
  process.exit(1);
}

const { getTranscript } = await import("../lib/sessions.ts");
const { segmentConversationPhases } = await import("../lib/conversation-phases.ts");

function formatSegmentTimeRange(startTime, endTime) {
  const fmt = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };
  return `${fmt(startTime)} - ${fmt(endTime)}`;
}

function formatOutput(runIndex, segmentation) {
  const lines = [`\n========== RUN ${runIndex} (${segmentation.spans.length} segments) ==========`];
  if (segmentation.structureNotes) {
    lines.push(`Notes: ${segmentation.structureNotes}`);
  }
  segmentation.spans.forEach((span, index) => {
    lines.push("");
    lines.push(`${index + 1}. ${span.title} (${formatSegmentTimeRange(span.startTime, span.endTime)})`);
    if (span.location) lines.push(`   Location: ${span.location}`);
    if (span.category) lines.push(`   Category: ${span.category}`);
    for (const highlight of span.highlights ?? [span.summary]) {
      lines.push(`   - ${highlight}`);
    }
  });
  return lines.join("\n");
}

const transcript = await getTranscript(sessionId);
if (!transcript.length) {
  console.error(`No transcript found for session ${sessionId}`);
  process.exit(1);
}

console.log(`Session: ${sessionId}`);
console.log(`Transcript segments: ${transcript.length}`);
console.log(`Duration: ~${Math.max(...transcript.map((s) => s.endTime || s.startTime))}s`);
console.log(`Runs: ${runs}`);

for (let i = 1; i <= runs; i++) {
  console.error(`Starting run ${i}/${runs}...`);
  const { segmentation, participants } = await segmentConversationPhases(transcript);
  console.log(formatOutput(i, segmentation));
  if (participants.agentName || participants.prospectName) {
    console.log(
      `Participants: agent=${participants.agentName ?? "—"}, prospect=${participants.prospectName ?? "—"}`
    );
  }
}
