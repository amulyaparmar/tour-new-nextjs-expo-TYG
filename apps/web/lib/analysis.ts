import "server-only";

import type { AnalysisResult, AnalysisModelId, RubricDefinition, SessionCustomerInterest } from "@tour/shared";
import {
  buildRubricAnalysisPrompt,
  cardFieldsFromAnalysis,
  normalizeParticipantName,
  normalizeParticipantNameConfidence,
  normalizeProspectInsights,
  normalizeSessionTopicSummary,
  PROSPECT_INTEREST_CATEGORY_LABELS,
  rubricSessionTypeLabel,
  rubricTotalPoints,
} from "@tour/shared";
import { DEFAULT_RBG_RUBRIC_DEFINITION } from "./default-rubric";
import type { TranscriptSegment } from "./transcribe";
import { type ClaudeTool } from "./bedrock";
import { invokeAnalysisTool } from "./analysis-model-invoke";

export type AnalysisParticipantNames = {
  agentName: string | null;
  prospectName: string | null;
  agentNameConfidence: number | null;
  prospectNameConfidence: number | null;
  agentNameFirstMentionSeconds: number | null;
  prospectNameFirstMentionSeconds: number | null;
};

export type AnalysisWithParticipantNames = AnalysisResult & {
  participantNames?: AnalysisParticipantNames;
};

export async function generateAnalysis(params: {
  location: string | null;
  notes: string | null;
  prospectContext?: string[];
  providedCustomerInterests?: SessionCustomerInterest[];
  transcript?: TranscriptSegment[];
  rubricDefinition?: RubricDefinition;
  analysisModel?: AnalysisModelId | null;
  analysisPrompt?: string | null;
  sessionType?: string | null;
}): Promise<AnalysisWithParticipantNames> {
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
    `Session type: ${sessionTypeLabel}`,
    `Location: ${params.location ?? "Unknown"}`,
    `Agent Notes: ${params.notes ?? "None provided"}`,
    "Known prospect context:",
    ...(params.prospectContext?.length
      ? params.prospectContext.map((item) => `- ${item}`)
      : ["- None provided"]),
    "",
    "Customer interests provided before the session:",
    ...(params.providedCustomerInterests?.length
      ? params.providedCustomerInterests.map((interest) =>
          `- [${PROSPECT_INTEREST_CATEGORY_LABELS[interest.category]}] ${interest.detail}`
        )
      : ["- None provided"]),
    "",
    "Also identify participant names from the transcript before scoring:",
    "- identifiedAgentName: the leasing agent or staff member conducting the tour/call; null if unknown",
    "- identifiedProspectName: the prospect, customer, visitor, or shopper; null if unknown",
    "- identifiedAgentNameConfidence: confidence from 0-100 that identifiedAgentName is correct; 0 when unknown",
    "- identifiedProspectNameConfidence: confidence from 0-100 that identifiedProspectName is correct; 0 when unknown",
    "- identifiedAgentNameFirstMentionTimestamp: earliest transcript timestamp where identifiedAgentName is actually spoken by anyone, in MM:SS; null when unknown or never spoken",
    "- identifiedProspectNameFirstMentionTimestamp: earliest transcript timestamp where identifiedProspectName is actually spoken by anyone, in MM:SS; null when unknown or never spoken",
    "- A first-mention timestamp is about the name being spoken, not merely the first time that participant talks.",
    "- Use 90-100 only for an explicit introduction or repeated unambiguous address; 60-89 for strong contextual evidence; below 60 for a tentative phonetic/contextual reading.",
    "- Return names without confidence symbols or prefixes; the application adds its own low-confidence marker.",
    "- The transcript is the only source of truth for participant names. Ignore names in rubric text, examples, notes, schema text, stored session metadata, titles, and prior analyses.",
    "- Speaker labels are provider-inferred role hints and can be wrong. Independently infer who conducts the session versus who is shopping from the full conversational behavior; context wins when it conflicts with a label.",
    "- Resolve identity in this order: attach each spoken name to the correct speaker, then infer that speaker's role. A self-introduction names the speaker; direct address names the listener.",
    "- Prefer spoken introductions and unambiguous direct address.",
    "- identifiedAgentName must belong to the person conducting this session. Do not use a name heard only when that person addresses or calls a colleague, manager, maintenance worker, or other third party.",
    "",
    "Also return topicSummary as a concise 1-4 word title label grounded in the transcript:",
    "- For tours, prefer the unit type or unit types discussed (for example: Studio + 2BR). If no unit type is supported, use the primary tour focus.",
    "- For calls, state the purpose of the call (for example: Pricing Inquiry or Application Follow-up), not a generic label such as Phone Call.",
    "- Return null when no specific topic is supported.",
    "",
    "Also build prospectInsights to help the leasing team understand and convert this specific prospect:",
    "- Ground every insight in the transcript or the provided session context. Never invent preferences or buying intent.",
    "- interests: include every customer interest provided before the session, then add distinct interests stated or cautiously inferred from the transcript, up to 10 total.",
    "- Use source=provided for interests supplied before the session, source=stated for needs expressed in the transcript, and source=inferred only for cautious transcript-grounded inferences.",
    "- Keep each provided interest's category and detail substantially unchanged so the team can compare it with the conversation.",
    "- For every interest, explain exactly how the agent addressed it and classify coverage as addressed, partially_addressed, missed, or not_discussed.",
    "- Judge coverage and agentResponse from the transcript only. Provided context proves the interest exists, but does not prove the agent addressed it.",
    "- evidence must be a short prospect quote or concise transcript-grounded observation; timestamp is the earliest relevant MM:SS or null. Leave evidence empty and timestamp null when a provided interest never appears in the transcript.",
    "- intentStage is ready only with an explicit application, deposit, scheduling, or clear next-step signal; considering for concrete timing/pricing/comparison signals; exploring for early research; unknown when unsupported.",
    "- conversionDrivers are specific actions, information, or property matches most likely to move this prospect forward.",
    "- objections are unresolved concerns or friction, not generic coaching feedback.",
    "- nextBestAction is one concrete, personalized action the agent should take next.",
    "- Do not infer protected traits, demographics, finances, family status, disability, or other sensitive facts beyond what the prospect explicitly volunteered and what is directly relevant to their request.",
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
      identifiedAgentName: {
        type: ["string", "null"],
        description: "Leasing agent or staff member name from transcript evidence; null if unknown",
      },
      identifiedProspectName: {
        type: ["string", "null"],
        description: "Prospect/customer/visitor/shopper name from transcript evidence; null if unknown",
      },
      identifiedAgentNameConfidence: {
        type: "number",
        description: "0-100 confidence the extracted agent name is correct; 0 when agent name is null",
      },
      identifiedProspectNameConfidence: {
        type: "number",
        description: "0-100 confidence the extracted prospect name is correct; 0 when prospect name is null",
      },
      identifiedAgentNameFirstMentionTimestamp: {
        type: ["string", "null"],
        description: "Earliest MM:SS timestamp where the extracted agent name is spoken; null when unknown or never spoken",
      },
      identifiedProspectNameFirstMentionTimestamp: {
        type: ["string", "null"],
        description: "Earliest MM:SS timestamp where the extracted prospect name is spoken; null when unknown or never spoken",
      },
      topicSummary: {
        type: ["string", "null"],
        description: "Transcript-grounded 1-4 word topic: unit type(s) for tours, call purpose for calls; null if unsupported",
      },
      prospectInsights: {
        type: "object",
        description: "Transcript-grounded profile of this prospect's needs and what will move them forward",
        properties: {
          summary: {
            type: "string",
            description: "Two concise sentences describing what this prospect wants and their decision context",
          },
          intentStage: {
            type: "string",
            enum: ["ready", "considering", "exploring", "unknown"],
          },
          intentRationale: {
            type: "string",
            description: "Brief transcript-grounded explanation for the intent stage",
          },
          interests: {
            type: "array",
            maxItems: 10,
            items: {
              type: "object",
              properties: {
                category: {
                  type: "string",
                  enum: [
                    "budget_specials",
                    "floor_plan",
                    "move_in_timing",
                    "amenities",
                    "pets",
                    "parking_transportation",
                    "location_commute",
                    "lease_terms",
                    "accessibility",
                    "community_security",
                    "other",
                  ],
                },
                detail: { type: "string", description: "Specific need or preference" },
                importance: { type: "string", enum: ["high", "medium", "low"] },
                source: { type: "string", enum: ["provided", "stated", "inferred"] },
                evidence: { type: "string", description: "Short prospect quote or grounded observation" },
                timestamp: {
                  type: ["string", "null"],
                  description: "Earliest relevant MM:SS timestamp or null",
                },
                agentResponse: {
                  type: "string",
                  description: "What the agent did to address this need; empty when not addressed",
                },
                coverage: {
                  type: "string",
                  enum: ["addressed", "partially_addressed", "missed", "not_discussed"],
                },
              },
              required: [
                "category",
                "detail",
                "importance",
                "source",
                "evidence",
                "timestamp",
                "agentResponse",
                "coverage",
              ],
            },
          },
          conversionDrivers: {
            type: "array",
            maxItems: 5,
            items: { type: "string" },
          },
          objections: {
            type: "array",
            maxItems: 5,
            items: { type: "string" },
          },
          nextBestAction: {
            type: "string",
            description: "One concrete personalized action the agent should take next",
          },
        },
        required: [
          "summary",
          "intentStage",
          "intentRationale",
          "interests",
          "conversionDrivers",
          "objections",
          "nextBestAction",
        ],
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
      "identifiedAgentName",
      "identifiedProspectName",
      "identifiedAgentNameConfidence",
      "identifiedProspectNameConfidence",
      "identifiedAgentNameFirstMentionTimestamp",
      "identifiedProspectNameFirstMentionTimestamp",
      "topicSummary",
      "prospectInsights",
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
    "Prospect conversion context:",
    formatProspectInsightsForPrompt(analysis),
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

function formatProspectInsightsForPrompt(analysis: AnalysisResult) {
  const insights = normalizeProspectInsights(analysis.prospectInsights);
  if (!insights) return "  - Not available";
  return [
    `  - Intent: ${insights.intentStage}${insights.intentRationale ? ` — ${insights.intentRationale}` : ""}`,
    ...insights.interests.map((interest) =>
      `  - Need: ${interest.detail} (${interest.coverage.replaceAll("_", " ")})`
    ),
    ...insights.conversionDrivers.map((driver) => `  - Conversion driver: ${driver}`),
    ...insights.objections.map((objection) => `  - Open concern: ${objection}`),
    ...(insights.nextBestAction ? [`  - Next best action: ${insights.nextBestAction}`] : []),
  ].join("\n");
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
function safeParseAnalysis(parsed: Record<string, unknown>): AnalysisWithParticipantNames | null {
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

    const participantNames = normalizeAnalysisParticipantNames(parsed);
    const prospectInsights = normalizeProspectInsights(parsed.prospectInsights);

    return {
      overallScore: parsed.overallScore,
      totalPointsEarned: totalEarned,
      totalPointsPossible: totalPossible,
      summary: String(parsed.summary ?? ""),
      topicSummary: normalizeSessionTopicSummary(parsed.topicSummary),
      cardSummary: cardFields.cardSummary ?? "",
      needsImprovement: cardFields.needsImprovement ?? "",
      strengths: parsed.strengths as string[],
      opportunities: parsed.opportunities as string[],
      suggestedRewrite: String(parsed.suggestedRewrite ?? ""),
      sectionScores,
      fairHousingFlags: Array.isArray(parsed.fairHousingFlags) ? parsed.fairHousingFlags as string[] : [],
      exactMoments: parsed.exactMoments as AnalysisResult["exactMoments"],
      ...(participantNames ? { participantNames } : {}),
      ...(prospectInsights ? { prospectInsights } : {}),
    };
  } catch {
    return null;
  }
}

function normalizeAnalysisParticipantNames(parsed: Record<string, unknown>): AnalysisParticipantNames | null {
  const agentName = normalizeParticipantName(parsed.identifiedAgentName);
  const prospectName = normalizeParticipantName(parsed.identifiedProspectName);
  if (!agentName && !prospectName) return null;
  return {
    agentName,
    prospectName,
    agentNameConfidence: agentName
      ? normalizeParticipantNameConfidence(parsed.identifiedAgentNameConfidence) ?? 0
      : null,
    prospectNameConfidence: prospectName
      ? normalizeParticipantNameConfidence(parsed.identifiedProspectNameConfidence) ?? 0
      : null,
    agentNameFirstMentionSeconds: agentName
      ? normalizeFirstMentionTimestamp(parsed.identifiedAgentNameFirstMentionTimestamp)
      : null,
    prospectNameFirstMentionSeconds: prospectName
      ? normalizeFirstMentionTimestamp(parsed.identifiedProspectNameFirstMentionTimestamp)
      : null,
  };
}

function normalizeFirstMentionTimestamp(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^(\d+):([0-5]\d)$/);
  if (!match) return null;
  const minutes = Number(match[1]);
  const seconds = Number(match[2]);
  if (!Number.isSafeInteger(minutes) || !Number.isSafeInteger(seconds)) return null;
  return minutes * 60 + seconds;
}
