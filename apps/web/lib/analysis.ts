import "server-only";

import type { AnalysisResult } from "@tour/shared";
import type { TranscriptSegment } from "./transcribe";

const DEFAULT_MODEL = process.env.OPENAI_MODEL ?? "gpt-4.1-mini";

export async function generateAnalysis(params: {
  title: string;
  prospectName: string | null;
  location: string | null;
  notes: string | null;
  transcript?: TranscriptSegment[];
}): Promise<AnalysisResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");

  const transcriptText = params.transcript && params.transcript.length > 0
    ? params.transcript
        .map((s) => `[${formatTime(s.startTime)}] ${s.speaker}: ${s.text}`)
        .join("\n")
    : "No transcript available.";

  const systemPrompt = [
    "You are an expert sales coach and mystery shopping evaluator specializing in apartment leasing tours.",
    "You have decades of experience training leasing agents to convert prospects into signed leases.",
    "",
    "Your task is to perform a thorough, evidence-based analysis of a recorded apartment tour conversation.",
    "Every observation MUST be grounded in specific quotes or moments from the transcript.",
    "",
    "## Scoring Rubric",
    "Score each section on a 0-100 scale using these criteria:",
    "",
    "**Greeting & Introduction (0-100)**",
    "- Did the agent greet within 10 seconds? Were they warm and professional?",
    "- Did they introduce themselves by name and role?",
    "- Did they set expectations for the tour (duration, what they'll cover)?",
    "- Did they make the prospect feel welcome and valued?",
    "",
    "**Needs Discovery (0-100)**",
    "- Did the agent ask open-ended questions about move-in timeline, budget, lifestyle?",
    "- Did they uncover the prospect's primary motivations and deal-breakers?",
    "- Did they listen actively and paraphrase back key needs?",
    "- Did they ask how the prospect heard about the property?",
    "",
    "**Tour & Demonstration (0-100)**",
    "- Did the agent clearly explain the tour route and community layout?",
    "- Did they highlight features relevant to the prospect's stated needs?",
    "- Did they use benefit language ('This means for you...') vs just feature descriptions?",
    "- Did they show enthusiasm and product knowledge?",
    "- Did they address amenities, common areas, unit features effectively?",
    "",
    "**Personalization (0-100)**",
    "- Did the agent reference back the prospect's specific needs during the tour?",
    "- Did they tailor their pitch to the prospect's lifestyle, budget, or preferences?",
    "- Did they make the prospect feel the tour was designed for them specifically?",
    "- Did they suggest specific units or floor plans based on stated preferences?",
    "",
    "**Objection Handling (0-100)**",
    "- Did the prospect raise any concerns or objections?",
    "- If yes, did the agent acknowledge the concern before responding?",
    "- Did they use evidence, comparisons, or reframing to address objections?",
    "- Did they check whether the prospect was satisfied with the answer?",
    "- If no objections were raised, did the agent proactively surface and address common concerns?",
    "",
    "**Closing (0-100)**",
    "- Did the agent create urgency (limited availability, move-in specials)?",
    "- Did they ask a direct closing question ('Would you like to start the application?')?",
    "- Did they present clear, actionable next steps?",
    "- Did they use an assumptive or trial close technique?",
    "- Did they secure a commitment or at least a follow-up date?",
    "",
    "**Follow-Up (0-100)**",
    "- Did the agent mention a specific follow-up plan before ending the conversation?",
    "- Did they collect or confirm contact information?",
    "- Did they set a concrete timeline for the next touch ('I'll call you Tuesday')?",
    "- Did they leave the prospect feeling cared for and expected to hear back?",
    "",
    "**Compliance / Fair Housing (0-100)**",
    "- Was the agent free of discriminatory language, steering, or bias?",
    "- Did they treat the prospect equitably and professionally throughout?",
    "- Did they avoid making assumptions about the prospect's background, family, or lifestyle?",
    "- Were pricing and availability communicated consistently?",
    "Note: Only deduct if there is clear evidence of a compliance issue. Do NOT speculate.",
    "",
    "## Output Format",
    "Return ONLY valid JSON matching this schema exactly (no markdown, no commentary):",
    "",
    "{",
    '  "overallScore": <weighted average 0-100>,',
    '  "summary": "<executive summary of performance with the most impactful takeaway>",',
    '  "strengths": ["<specific strength with evidence from transcript>", ...],',
    '  "opportunities": ["<specific, actionable improvement with evidence>", ...],',
    '  "suggestedRewrite": "<the single most impactful thing the agent said poorly, rewritten as a model script line>",',
    '  "sectionScores": [{"section": "<rubric section name>", "score": <0-100>}, ...],',
    '  "exactMoments": [',
    '    {',
    '      "timestamp": "<MM:SS from transcript>",',
    '      "transcriptQuote": "<exact quote from transcript>",',
    '      "explanation": "<why this moment matters - positive or negative>",',
    '      "suggestedImprovement": "<specific coaching tip or alternative phrasing>"',
    '    }, ...',
    "  ]",
    "}",
    "",
    "## Guidelines",
    "- Provide as many strengths and opportunities as the transcript warrants. Be thorough.",
    "- Identify every coaching-worthy moment (both positive and negative) from the transcript.",
    "- The suggestedRewrite should transform the weakest closing or discovery line into a strong one.",
    "- Be specific and constructive, not generic. Name what happened and what should happen instead.",
    "- overallScore should be a weighted average: Closing and Needs Discovery are weighted 1.5x.",
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

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ]
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Analysis API error ${response.status}: ${errText}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message: { content: string } }>;
  };

  const raw = payload.choices?.[0]?.message?.content ?? "";
  const parsed = safeParseAnalysis(raw);
  if (!parsed) throw new Error("Failed to parse analysis response");
  return parsed;
}

export async function generateFollowUpActions(
  analysis: AnalysisResult,
  params: { title: string; prospectName: string | null }
): Promise<Array<{ title: string; description: string; priority: "low" | "medium" | "high"; status: "open"; suggestedMessage: string | null }>> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");

  const systemPrompt = [
    "You are a leasing sales manager creating actionable follow-up tasks after reviewing a mystery shop analysis.",
    "Generate specific, prioritized follow-up actions that will directly improve this agent's conversion rate.",
    "",
    "Each action should be:",
    "- Concrete and immediately actionable (not vague like 'improve closing skills')",
    "- Tied to a specific finding from the analysis",
    "- Prioritized based on revenue impact (high = directly affects lease signing)",
    "",
    "For high-priority actions that involve prospect outreach, include a suggestedMessage:",
    "a ready-to-send text or email the agent can use immediately.",
    "",
    'Return JSON: {"actions": [{"title":"...","description":"...","priority":"high|medium|low","status":"open","suggestedMessage":"...|null"}]}'
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

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ]
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Follow-up actions API error ${response.status}: ${errText}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message: { content: string } }>;
  };

  const text = payload.choices?.[0]?.message?.content ?? "";
  const parsed = JSON.parse(text) as { actions?: unknown[] } | unknown[];
  const actions = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as { actions?: unknown[] }).actions)
      ? (parsed as { actions: unknown[] }).actions
      : null;

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

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function safeParseAnalysis(raw: string): AnalysisResult | null {
  try {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start === -1 || end === -1) return null;
    const parsed = JSON.parse(raw.slice(start, end + 1)) as AnalysisResult;
    if (
      typeof parsed.overallScore !== "number" ||
      !Array.isArray(parsed.strengths) ||
      !Array.isArray(parsed.opportunities) ||
      !Array.isArray(parsed.sectionScores) ||
      !Array.isArray(parsed.exactMoments)
    ) return null;
    return parsed;
  } catch {
    return null;
  }
}
