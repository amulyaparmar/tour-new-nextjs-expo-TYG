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

const { generateAnalysis } = await import("../lib/analysis.ts");

const transcript = Array.from({ length: 120 }, (_, i) => ({
  id: `t${i}`,
  speaker: i % 2 ? "Prospect" : "Agent",
  startTime: i * 15,
  endTime: i * 15 + 12,
  text: `Line ${i}: discussing floor plans, pricing, amenities, and move-in timeline for the two bedroom unit.`,
}));

try {
  const result = await generateAnalysis({
    title: "Long test tour",
    prospectName: "Jordan",
    location: "Building A",
    notes: null,
    transcript,
  });
  console.log("OK overallScore", result.overallScore, "sections", result.sectionScores.length);
} catch (e) {
  console.error("FAIL", e.message);
  process.exit(1);
}
