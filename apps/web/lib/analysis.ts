import "server-only";

import type { AnalysisResult, AnalysisModelId, RubricDefinition } from "@tour/shared";
import { buildRubricAnalysisPrompt, cardFieldsFromAnalysis, rubricSessionTypeLabel, rubricTotalPoints } from "@tour/shared";
import { DEFAULT_RBG_RUBRIC_DEFINITION } from "./default-rubric";
import type { TranscriptSegment } from "./transcribe";
import { type ClaudeTool } from "./bedrock";
import { invokeAnalysisTool } from "./analysis-model-invoke";

export async function generateAnalysis(params: {
  title: string;
  prospectName: string | null;
  location: string | null;
  notes: string | null;
  transcript?: TranscriptSegment[];
  rubricDefinition?: RubricDefinition;
  analysisModel?: AnalysisModelId | null;
  analysisPrompt?: string | null;
  sessionType?: string | null;
}): Promise<AnalysisResult> {
  const transcriptText = params.transcript && params.transcript.length > 0
    ? params.transcript
        .map((s) => `[${formatTime(s.startTime)}] ${s.speaker}: ${s.text}`)
        .join("\n")
    : "No transcript available.";

  const definition = params.rubricDefinition ?? DEFAULT_RBG_RUBRIC_DEFINITION;
  const totalPoints = rubricTotalPoints(definition);
  const systemPrompt = params.analysisPrompt?.trim() || buildRubricAnalysisPrompt(definition);
  const sessionTypeLabel = rubricSessionTypeLabel(params.sessionType);

  const userPrompt = [
    `Session: ${params.title}`,
    `Session type: ${sessionTypeLabel}`,
    `Prospect: ${params.prospectName ?? "Unknown"}`,
    `Location: ${params.location ?? "Unknown"}`,
    `Agent Notes: ${params.notes ?? "None provided"}`,
    "",
    "=== TRANSCRIPT ===",
    transcriptText
  ].join("\n");

  const raw = await invokeAnalysisTool<Record<string, unknown>>({
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
    tool: buildAnalysisTool(totalPoints),
    maxTokens: 8192,
    temperature: 0.3,
    analysisModel: params.analysisModel
  });

  const parsed = safeParseAnalysis(raw);
  if (!parsed) throw new Error(`Failed to parse analysis response: ${JSON.stringify(raw)}`);
  return parsed;
}

function buildAnalysisTool(totalPoints: number): ClaudeTool {
  return {
  name: "submit_analysis",
  description:
    "Submit the complete rubric analysis of the tour. Every rubric question in every section must be included.",
  input_schema: {
    type: "object",
    properties: {
      overallScore: { type: "number", description: `0-100 percentage of ${totalPoints} total points` },
      totalPointsEarned: { type: "number" },
      totalPointsPossible: { type: "number", description: String(totalPoints) },
      summary: { type: "string", description: "Executive summary of the leasing professional's performance" },
      cardSummary: {
        type: "string",
        description: "Exactly 9 words summarizing tour performance for session list cards",
      },
      needsImprovement: {
        type: "string",
        description: "One short sentence: the single most important coaching improvement for list cards",
      },
      strengths: { type: "array", items: { type: "string" } },
      opportunities: { type: "array", items: { type: "string" } },
      suggestedRewrite: { type: "string", description: "The weakest line, rewritten as a model script line" },
      sectionScores: {
        type: "array",
        items: {
          type: "object",
          properties: {
            section: { type: "string" },
            score: { type: "number", description: "0-100 percentage for this section" },
            pointsEarned: { type: "number" },
            pointsPossible: { type: "number" },
            questions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string", description: "e.g. Q110" },
                  question: { type: "string" },
                  maxPoints: { type: "number" },
                  earnedPoints: { type: "number" },
                  passed: { type: "boolean" },
                  evidence: { type: "string", description: "Brief transcript evidence or 'Not observed in transcript'" }
                },
                required: ["id", "question", "maxPoints", "earnedPoints", "passed", "evidence"]
              }
            }
          },
          required: ["section", "score", "pointsEarned", "pointsPossible", "questions"]
        }
      },
      fairHousingFlags: { type: "array", items: { type: "string" } },
      exactMoments: {
        type: "array",
        items: {
          type: "object",
          properties: {
            timestamp: { type: "string", description: "MM:SS from transcript" },
            transcriptQuote: { type: "string" },
            explanation: { type: "string" },
            suggestedImprovement: { type: "string" }
          },
          required: ["timestamp", "transcriptQuote", "explanation", "suggestedImprovement"]
        }
      }
    },
    required: [
      "overallScore",
      "totalPointsEarned",
      "totalPointsPossible",
      "summary",
      "cardSummary",
      "needsImprovement",
      "strengths",
      "opportunities",
      "suggestedRewrite",
      "sectionScores",
      "fairHousingFlags",
      "exactMoments"
    ]
  }
};
}

export async function generateFollowUpActions(
  analysis: AnalysisResult,
  params: {
    title: string;
    prospectName: string | null;
    notes?: string | null;
    analysisModel?: AnalysisModelId | null;
  }
): Promise<Array<{ title: string; description: string; priority: "low" | "medium" | "high"; status: "open"; suggestedMessage: string | null }>> {
  const systemPrompt = [
    "You are a leasing sales manager creating follow-up actions for a SPECIFIC PROSPECT after their apartment tour.",
    "These are next steps to move THIS customer toward signing a lease — NOT generic self-improvement tips.",
    "",
    "Focus on:",
    "- Outreach to this specific prospect (follow-up call, email, text with personalized content)",
    "- Addressing any unresolved concerns or objections the prospect raised during the tour",
    "- Sending requested information (floor plans, rates, application link, guarantor info)",
    "- Scheduling a second visit, roommate tour, or virtual walkthrough if appropriate",
    "- Creating urgency around availability or promotions mentioned during the tour",
    "- Connecting the prospect with other team members if relevant (e.g. current residents, manager)",
    "",
    "Each action should be:",
    "- A concrete next step FOR THIS CUSTOMER (not 'practice closing techniques')",
    "- Tied to something specific from the conversation",
    "- Prioritized: high = directly moves toward lease signing, medium = maintains relationship, low = nice-to-have",
    "",
    "For every action, include a suggestedMessage: a ready-to-send text or email the agent can copy and use.",
    "Personalize messages with the prospect's name, specific details from their tour, and any concerns they raised.",
    "If Agent Notes mention important follow-up assets, links, floor plans, videos, or resources, use them in the relevant suggestedMessage.",
    "",
    'Return JSON: {"actions": [{"title":"...","description":"...","priority":"high|medium|low","status":"open","suggestedMessage":"..."}]}'
  ].join("\n");

  const userPrompt = [
    `Session: ${params.title}`,
    `Prospect: ${params.prospectName ?? "Unknown"}`,
    `Agent Notes: ${params.notes?.trim() || "None provided"}`,
    `Overall Score: ${analysis.overallScore}%`,
    `Summary: ${analysis.summary}`,
    "",
    "Strengths:",
    analysis.strengths.map((s) => `  - ${s}`).join("\n"),
    "",
    "Opportunities:",
    analysis.opportunities.map((o) => `  - ${o}`).join("\n"),
    "",
    "Weakest sections:",
    [...analysis.sectionScores]
      .sort((a, b) => a.score - b.score)
      .slice(0, 3)
      .map((s) => `  - ${s.section}: ${s.score}%`)
      .join("\n"),
    "",
    "Key moments needing improvement:",
    analysis.exactMoments
      .filter((m) => m.suggestedImprovement)
      .map((m) => `  - [${m.timestamp}] ${m.explanation}`)
      .join("\n")
  ].join("\n");

  const result = await invokeAnalysisTool<{ actions?: unknown[] }>({
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
    tool: ACTIONS_TOOL,
    maxTokens: 4096,
    temperature: 0.3,
    analysisModel: params.analysisModel
  });

  const actions = Array.isArray(result.actions) ? result.actions : null;
  if (!actions) throw new Error("Failed to parse follow-up actions");

  return actions.map((raw) => {
    const a = raw as Record<string, unknown>;
    return {
      title: String(a.title ?? "Follow up"),
      description: String(a.description ?? ""),
      priority: (["low", "medium", "high"].includes(String(a.priority)) ? String(a.priority) : "medium") as "low" | "medium" | "high",
      status: "open" as const,
      suggestedMessage: typeof a.suggestedMessage === "string" ? a.suggestedMessage : null
    };
  });
}

const ACTIONS_TOOL: ClaudeTool = {
  name: "submit_actions",
  description: "Submit prospect-specific follow-up actions that move this customer toward signing a lease.",
  input_schema: {
    type: "object",
    properties: {
      actions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            description: { type: "string" },
            priority: { type: "string", enum: ["low", "medium", "high"] },
            status: { type: "string", enum: ["open"] },
            suggestedMessage: { type: "string", description: "A ready-to-send text or email the agent can copy" }
          },
          required: ["title", "description", "priority", "status", "suggestedMessage"]
        }
      }
    },
    required: ["actions"]
  }
};

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * Defensive normalizer. With Bedrock tool-use the input already matches the
 * schema, but this guards against missing/typed-wrong fields and fills derived
 * values (e.g. totalPointsEarned).
 */
function safeParseAnalysis(parsed: Record<string, unknown>): AnalysisResult | null {
  try {
    if (
      typeof parsed.overallScore !== "number" ||
      !Array.isArray(parsed.strengths) ||
      !Array.isArray(parsed.opportunities) ||
      !Array.isArray(parsed.sectionScores) ||
      !Array.isArray(parsed.exactMoments)
    ) return null;

    const totalPossible = typeof parsed.totalPointsPossible === "number" ? parsed.totalPointsPossible : 200;
    const totalEarned = typeof parsed.totalPointsEarned === "number"
      ? parsed.totalPointsEarned
      : Math.round(parsed.overallScore / 100 * totalPossible);

    const sectionScores = (parsed.sectionScores as Array<Record<string, unknown>>).map((s) => ({
      section: String(s.section ?? ""),
      score: typeof s.score === "number" ? s.score : 0,
      pointsEarned: typeof s.pointsEarned === "number" ? s.pointsEarned : 0,
      pointsPossible: typeof s.pointsPossible === "number" ? s.pointsPossible : 0,
      questions: Array.isArray(s.questions)
        ? (s.questions as Array<Record<string, unknown>>).map((q) => ({
            id: String(q.id ?? ""),
            question: String(q.question ?? ""),
            maxPoints: typeof q.maxPoints === "number" ? q.maxPoints : 0,
            earnedPoints: typeof q.earnedPoints === "number" ? q.earnedPoints : 0,
            passed: !!q.passed,
            evidence: String(q.evidence ?? ""),
          }))
        : [],
    }));

    const cardFields = cardFieldsFromAnalysis({
      overallScore: parsed.overallScore,
      totalPointsEarned: totalEarned,
      totalPointsPossible: totalPossible,
      summary: String(parsed.summary ?? ""),
      cardSummary: String(parsed.cardSummary ?? ""),
      needsImprovement: String(parsed.needsImprovement ?? ""),
      strengths: parsed.strengths as string[],
      opportunities: parsed.opportunities as string[],
      suggestedRewrite: String(parsed.suggestedRewrite ?? ""),
      sectionScores,
      fairHousingFlags: Array.isArray(parsed.fairHousingFlags) ? parsed.fairHousingFlags as string[] : [],
      exactMoments: parsed.exactMoments as AnalysisResult["exactMoments"],
    });

    return {
      overallScore: parsed.overallScore,
      totalPointsEarned: totalEarned,
      totalPointsPossible: totalPossible,
      summary: String(parsed.summary ?? ""),
      cardSummary: cardFields.cardSummary ?? "",
      needsImprovement: cardFields.needsImprovement ?? "",
      strengths: parsed.strengths as string[],
      opportunities: parsed.opportunities as string[],
      suggestedRewrite: String(parsed.suggestedRewrite ?? ""),
      sectionScores,
      fairHousingFlags: Array.isArray(parsed.fairHousingFlags) ? parsed.fairHousingFlags as string[] : [],
      exactMoments: parsed.exactMoments as AnalysisResult["exactMoments"],
    };
  } catch {
    return null;
  }
}
