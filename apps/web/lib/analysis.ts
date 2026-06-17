import "server-only";

import type { AnalysisResult } from "@tour/shared";
import type { TranscriptSegment } from "./transcribe";
import { invokeClaudeTool, type ClaudeTool } from "./bedrock";

export async function generateAnalysis(params: {
  title: string;
  prospectName: string | null;
  location: string | null;
  notes: string | null;
  transcript?: TranscriptSegment[];
}): Promise<AnalysisResult> {
  const transcriptText = params.transcript && params.transcript.length > 0
    ? params.transcript
        .map((s) => `[${formatTime(s.startTime)}] ${s.speaker}: ${s.text}`)
        .join("\n")
    : "No transcript available.";

  const systemPrompt = [
    "You are an expert mystery shopping evaluator for Campus Life & Style apartment leasing tours.",
    "You evaluate in-person apartment tours using the official RBG (Reality Based Group) evaluation rubric.",
    "",
    "Your task is to perform a thorough, evidence-based analysis of a recorded apartment tour conversation.",
    "Every observation MUST be grounded in specific quotes or moments from the transcript.",
    "",
    "## Scoring Rubric — Apartment In-Person Tour (200 points total)",
    "",
    "### Section 1: The Greeting (50 points max)",
    "Score each question YES (full points) or NO (0 points) based on transcript evidence:",
    "  Q110. Did the Leasing Professional stand and greet promptly, or acknowledge the prospect if busy? (10 pts)",
    "  Q120. Did the Leasing Professional introduce themselves? (5 pts)",
    "  Q130. Did the Leasing Professional give undivided attention throughout the tour? (5 pts)",
    "  Q140. Did the Leasing Professional complete a guest card or confirm information given over the phone? (10 pts)",
    "  Q150. Was the following information asked: school classification, desired move-in date/term, how they heard about the property, 3 things they look for in an apartment, telephone number? (2 pts each, 10 pts max)",
    "  Q160. Did the Leasing Professional ask for a photo ID before the tour? (5 pts)",
    "  Q170. Did the Leasing Professional do an overview of what the tour would consist of prior to starting? (5 pts)",
    "",
    "### Section 2: Property Tour & Demonstration (80 points max)",
    "  Q205. Did the Leasing Professional take control of the presentation? (5 pts)",
    "  Q210. Did the Leasing Professional use the information gathered to personalize the presentation? (10 pts)",
    "  Q215. Did the Leasing Professional use the prospect's name throughout the presentation? (5 pts)",
    "  Q220. Was the Leasing Professional knowledgeable about the apartment community? (10 pts)",
    "  Q225. Did the Leasing Professional sell the benefits and features of the apartment and community? (10 pts)",
    "  Q230. Did the Leasing Professional show an apartment or model that was clean, made ready & comfortable in temperature? (10 pts)",
    "  Q235. Did the Leasing Professional offer a snack or refreshment from a fully stocked fridge/freezer? (5 pts)",
    "  Q240. Did the Leasing Professional highlight different features of the apartment and show how they are beneficial? (5 pts)",
    "  Q245. Did the Leasing Professional tailor the presentation to the prospect's needs? (5 pts)",
    "  Q255. Did the Leasing Professional overcome the objection stated during the demonstration? (10 pts)",
    "  Q260. Did the Leasing Professional inquire which other communities were visited and offer a positive comparison? (5 pts)",
    "",
    "### Section 3: Closing Techniques (65 points max)",
    "  Q305. Did the Leasing Professional sit the prospect down at a computer or iPad and explain the application details? (15 pts)",
    "  Q310. Did the Leasing Professional seem well versed in all rental rates? (5 pts)",
    "  Q315. Did the Leasing Professional attempt to sell the view, carports, or other premium-price amenities while going over floor plans and rates? (5 pts)",
    "  Q320. Did the Leasing Professional discuss the rental guarantor/qualification procedures? (5 pts)",
    "  Q325. Did the Leasing Professional review the floor plan and rate sheet? (10 pts)",
    "  Q330. Did the Leasing Professional convey a strong sense of urgency to rent today? (5 pts)",
    "  Q335. Did the Leasing Professional ask if the prospect was ready to sign the lease today? (15 pts)",
    "  Q340. Did the Leasing Professional effectively uncover and overcome objections for not leasing? (5 pts)",
    "",
    "### Section 4: Follow Up (5 points max)",
    "  Q410. Did the prospect receive a follow-up email, phone call, or text message within 24 hours of the visit? (5 pts)",
    "  Note: If the recording does not capture post-visit follow-up, score based on whether the agent mentioned or set up a follow-up plan during the visit.",
    "",
    "### Fair Housing (Compliance — not scored, flag only)",
    "  Q510. Did the Leasing Consultant steer the prospect to a specific area in an attempt to segregate?",
    "  Q520. Did the prospect feel discriminated against in any way?",
    "  Flag any compliance issues found. Do NOT deduct points — report them separately.",
    "",
    "## Scoring Instructions",
    "- For each section, total the points earned out of the section max.",
    "- Convert each section to a 0-100 scale: sectionScore = round(pointsEarned / sectionMax * 100).",
    "- overallScore = round(totalPointsEarned / 200 * 100) — this is the percentage of 200 total points.",
    "- If a question cannot be evaluated from the transcript, give the benefit of the doubt ONLY for Q160 (photo ID) and Q230 (apartment cleanliness/temperature) since these are visual. For all others, score 0 if not evidenced.",
    "",
    "## Output Format",
    "Return ONLY valid JSON matching this schema exactly (no markdown, no commentary):",
    "",
    "{",
    '  "overallScore": <0-100 percentage of 200 total points>,',
    '  "totalPointsEarned": <number>,',
    '  "totalPointsPossible": 200,',
    '  "summary": "<executive summary: overall attitude/impression of the Leasing Professional, primary closing technique used, why you would/wouldn\'t have leased>",',
    '  "strengths": ["<specific strength with evidence from transcript>", ...],',
    '  "opportunities": ["<specific, actionable improvement with evidence>", ...],',
    '  "suggestedRewrite": "<the single most impactful thing the agent said poorly, rewritten as a model script line>",',
    '  "sectionScores": [',
    "    {",
    '      "section": "The Greeting",',
    '      "score": <0-100 percentage>,',
    '      "pointsEarned": <number>,',
    '      "pointsPossible": 50,',
    '      "questions": [',
    '        {"id": "Q110", "question": "Stand and greet promptly?", "maxPoints": 10, "earnedPoints": <0 or 10>, "passed": <bool>, "evidence": "<brief transcript evidence or reason>"},',
    "        ... all questions for this section ...",
    "      ]",
    "    },",
    "    ... same structure for Property Tour & Demonstration (80 pts), Closing Techniques (65 pts), Follow Up (5 pts) ...",
    "  ],",
    '  "fairHousingFlags": ["<any compliance issue found, or empty array if none>"],',
    '  "exactMoments": [',
    '    {',
    '      "timestamp": "<MM:SS from transcript>",',
    '      "transcriptQuote": "<exact quote from transcript>",',
    '      "explanation": "<why this moment matters — reference the question number (e.g. Q335) and whether it was met>",',
    '      "suggestedImprovement": "<specific coaching tip or alternative phrasing>"',
    '    }, ...',
    "  ]",
    "}",
    "",
    "## Guidelines",
    "- Score EVERY question in every section. Do not skip any. Each question must appear in the questions array.",
    "- For each question, provide evidence: a brief quote or explanation of what was observed (or \"Not observed in transcript\").",
    "- Map every rubric question to evidence in the transcript. Be thorough and systematic.",
    "- Identify every coaching-worthy moment (positive and negative) and reference the question number.",
    "- The suggestedRewrite should transform the weakest closing or discovery line into a strong one.",
    "- Be specific and constructive, not generic. Name what happened and what should happen instead.",
    "- Closing Techniques (Section 3) carries the heaviest weight per-point — flag every missed closing opportunity.",
    "- The executive summary should read like the 'Executive Summary' section of the evaluation: overall attitude, primary closing technique used, why you would/wouldn't lease, strengths, and opportunities.",
    "- If the transcript is short or unclear, score conservatively and note limited data.",
  ].join("\n");

  const userPrompt = [
    `Session: ${params.title}`,
    `Prospect: ${params.prospectName ?? "Unknown"}`,
    `Location: ${params.location ?? "Unknown"}`,
    `Agent Notes: ${params.notes ?? "None provided"}`,
    "",
    "=== TRANSCRIPT ===",
    transcriptText
  ].join("\n");

  const raw = await invokeClaudeTool<Record<string, unknown>>({
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
    tool: ANALYSIS_TOOL,
    maxTokens: 8192,
    temperature: 0.3
  });

  const parsed = safeParseAnalysis(raw);
  if (!parsed) throw new Error("Failed to parse analysis response");
  return parsed;
}

const ANALYSIS_TOOL: ClaudeTool = {
  name: "submit_analysis",
  description:
    "Submit the complete RBG rubric analysis of the apartment tour. Every rubric question in every section must be included.",
  input_schema: {
    type: "object",
    properties: {
      overallScore: { type: "number", description: "0-100 percentage of 200 total points" },
      totalPointsEarned: { type: "number" },
      totalPointsPossible: { type: "number", description: "200" },
      summary: { type: "string", description: "Executive summary of the leasing professional's performance" },
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
      "strengths",
      "opportunities",
      "suggestedRewrite",
      "sectionScores",
      "fairHousingFlags",
      "exactMoments"
    ]
  }
};

export async function generateFollowUpActions(
  analysis: AnalysisResult,
  params: { title: string; prospectName: string | null }
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
    "",
    'Return JSON: {"actions": [{"title":"...","description":"...","priority":"high|medium|low","status":"open","suggestedMessage":"..."}]}'
  ].join("\n");

  const userPrompt = [
    `Session: ${params.title}`,
    `Prospect: ${params.prospectName ?? "Unknown"}`,
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

  const result = await invokeClaudeTool<{ actions?: unknown[] }>({
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
    tool: ACTIONS_TOOL,
    maxTokens: 4096,
    temperature: 0.3
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

    return {
      overallScore: parsed.overallScore,
      totalPointsEarned: totalEarned,
      totalPointsPossible: totalPossible,
      summary: String(parsed.summary ?? ""),
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
