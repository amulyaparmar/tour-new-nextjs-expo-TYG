import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createJiti } from "jiti";

const root = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(root, "../.env.local") });

const jiti = createJiti(import.meta.url);
const { rubricTotalPoints } = jiti("@tour/shared");
const { DEFAULT_RBG_RUBRIC_DEFINITION } = jiti("../lib/default-rubric.ts");
const { buildRubricAnalysisPrompt } = jiti("../lib/rubric-prompt.ts");
const { prepareStructuredTool } = jiti("../lib/bedrock-structured-output.ts");

const token = process.env.AWS_BEARER_TOKEN_BEDROCK;
const region = process.env.AWS_REGION || "us-east-1";
const modelId = process.env.BEDROCK_MODEL_ID;
const totalPoints = rubricTotalPoints(DEFAULT_RBG_RUBRIC_DEFINITION);
const systemPrompt = buildRubricAnalysisPrompt(DEFAULT_RBG_RUBRIC_DEFINITION);

const tool = prepareStructuredTool({
  name: "submit_analysis",
  description: "Submit the complete rubric analysis of the tour. Every rubric question in every section must be included.",
  input_schema: {
    type: "object",
    properties: {
      overallScore: { type: "number", description: `0-100 percentage of ${totalPoints} total points` },
      totalPointsEarned: { type: "number" },
      totalPointsPossible: { type: "number", description: String(totalPoints) },
      summary: { type: "string" },
      strengths: { type: "array", items: { type: "string" } },
      opportunities: { type: "array", items: { type: "string" } },
      suggestedRewrite: { type: "string" },
      sectionScores: {
        type: "array",
        items: {
          type: "object",
          properties: {
            section: { type: "string" },
            score: { type: "number" },
            pointsEarned: { type: "number" },
            pointsPossible: { type: "number" },
            questions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  question: { type: "string" },
                  maxPoints: { type: "number" },
                  earnedPoints: { type: "number" },
                  passed: { type: "boolean" },
                  evidence: { type: "string" },
                },
                required: ["id", "question", "maxPoints", "earnedPoints", "passed", "evidence"],
              },
            },
          },
          required: ["section", "score", "pointsEarned", "pointsPossible", "questions"],
        },
      },
      fairHousingFlags: { type: "array", items: { type: "string" } },
      exactMoments: {
        type: "array",
        items: {
          type: "object",
          properties: {
            timestamp: { type: "string" },
            transcriptQuote: { type: "string" },
            explanation: { type: "string" },
            suggestedImprovement: { type: "string" },
          },
          required: ["timestamp", "transcriptQuote", "explanation", "suggestedImprovement"],
        },
      },
    },
    required: [
      "overallScore",
      "totalPointsEarned",
      "totalPointsPossible",
      "summary",
      "strengths",
      "opportunities",
      "suggestedRewrite",
      "sectionScores",
      "fairHousingFlags",
      "exactMoments",
    ],
  },
});

function parseIssues(parsed) {
  const issues = [];
  if (typeof parsed.overallScore !== "number") issues.push(`overallScore=${typeof parsed.overallScore}`);
  if (!Array.isArray(parsed.strengths)) issues.push("strengths not array");
  if (!Array.isArray(parsed.opportunities)) issues.push("opportunities not array");
  if (!Array.isArray(parsed.sectionScores)) issues.push("sectionScores not array");
  if (!Array.isArray(parsed.exactMoments)) issues.push("exactMoments not array");
  return issues;
}

const transcript = Array.from({ length: 400 }, (_, i) =>
  `[${String(Math.floor((i * 12) / 60)).padStart(2, "0")}:${String((i * 12) % 60).padStart(2, "0")}] ${i % 2 ? "Prospect" : "Agent"}: Extended tour dialogue line ${i} covering amenities pricing floor plans and objections.`
).join("\n");

for (const maxTokens of [8192]) {
  const url = `https://bedrock-runtime.${region}.amazonaws.com/model/${encodeURIComponent(modelId)}/invoke`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: maxTokens,
      temperature: 0.3,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: [
            "Session: Long test tour",
            "Prospect: Jordan",
            "Location: Building A",
            "",
            "=== TRANSCRIPT ===",
            transcript,
          ].join("\n"),
        },
      ],
      tools: [tool],
      tool_choice: { type: "tool", name: "submit_analysis" },
    }),
  });

  const data = await response.json();
  const raw = data.content?.find((b) => b.type === "tool_use")?.input ?? {};
  const issues = parseIssues(raw);
  console.log(`maxTokens=${maxTokens} stop=${data.stop_reason} bytes=${JSON.stringify(raw).length} issues=${issues.join(", ") || "none"}`);
  console.log("types", {
    overallScore: typeof raw.overallScore,
    strengths: typeof raw.strengths,
    opportunities: typeof raw.opportunities,
    sectionScores: typeof raw.sectionScores,
    exactMoments: typeof raw.exactMoments,
    keys: Object.keys(raw),
  });
}
