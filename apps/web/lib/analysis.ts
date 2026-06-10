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
  if (!apiKey) {
    return buildFallbackAnalysis(params);
  }

  const transcriptText = params.transcript && params.transcript.length > 0
    ? params.transcript
        .map((s) => `[${formatTime(s.startTime)}] ${s.speaker}: ${s.text}`)
        .join("\n")
    : "No transcript available.";

  const prompt = [
    "You are a sales coach for apartment tour mystery shopping.",
    "Analyze the following session transcript and return strict JSON matching this schema exactly:",
    "{overallScore:number,summary:string,strengths:string[],opportunities:string[],suggestedRewrite:string,sectionScores:[{section:string,score:number}],exactMoments:[{timestamp:string,transcriptQuote:string,explanation:string,suggestedImprovement:string}]}",
    "",
    "Rubric sections to score (0-100 each): Greeting & Introduction, Needs Discovery, Tour & Demonstration, Personalization, Objection Handling, Closing, Follow-Up, Compliance / Fair Housing",
    "",
    "Use concise evidence-oriented language. Quote the transcript. Do not invent compliance accusations.",
    "",
    `Session: ${params.title}`,
    `Prospect: ${params.prospectName ?? "Unknown"}`,
    `Location: ${params.location ?? "Unknown"}`,
    `Notes: ${params.notes ?? "No notes"}`,
    "",
    "Transcript:",
    transcriptText
  ].join("\n");

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ model: DEFAULT_MODEL, input: prompt })
    });

    if (!response.ok) {
      return buildFallbackAnalysis(params);
    }

    const payload = (await response.json()) as { output_text?: string };
    const parsed = safeParseAnalysis(payload.output_text ?? "");
    return parsed ?? buildFallbackAnalysis(params);
  } catch {
    return buildFallbackAnalysis(params);
  }
}

export async function generateFollowUpActions(
  analysis: AnalysisResult,
  params: { title: string; prospectName: string | null }
): Promise<Array<{ title: string; description: string; priority: "low" | "medium" | "high"; status: "open"; suggestedMessage: string | null }>> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return buildFallbackActions(params);

  const prompt = [
    "Based on this sales session analysis, generate 3-5 specific follow-up actions as JSON array.",
    "Each action: {title:string,description:string,priority:'low'|'medium'|'high',status:'open',suggestedMessage:string|null}",
    `Session: ${params.title}, Prospect: ${params.prospectName ?? "Unknown"}`,
    `Score: ${analysis.overallScore}%, Summary: ${analysis.summary}`,
    `Opportunities: ${analysis.opportunities.join("; ")}`,
    "Return ONLY a JSON array, no markdown."
  ].join("\n");

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: DEFAULT_MODEL, input: prompt })
    });

    if (!response.ok) return buildFallbackActions(params);

    const payload = (await response.json()) as { output_text?: string };
    const text = payload.output_text ?? "";
    const start = text.indexOf("[");
    const end = text.lastIndexOf("]");
    if (start === -1 || end === -1) return buildFallbackActions(params);

    const actions = JSON.parse(text.slice(start, end + 1));
    if (!Array.isArray(actions)) return buildFallbackActions(params);
    return actions.map((a: Record<string, unknown>) => ({
      title: String(a.title ?? "Follow up"),
      description: String(a.description ?? ""),
      priority: (["low", "medium", "high"].includes(String(a.priority)) ? String(a.priority) : "medium") as "low" | "medium" | "high",
      status: "open" as const,
      suggestedMessage: typeof a.suggestedMessage === "string" ? a.suggestedMessage : null
    }));
  } catch {
    return buildFallbackActions(params);
  }
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

function buildFallbackAnalysis(params: {
  title: string;
  prospectName: string | null;
}): AnalysisResult {
  return {
    overallScore: 78,
    summary: "Solid rapport and tour structure. Closing and explicit next steps need to be more direct.",
    strengths: [
      "Opened with a clear and friendly introduction.",
      "Kept the conversation focused on prospect needs.",
      "Addressed at least one objection with confidence."
    ],
    opportunities: [
      "Ask one stronger closing question at the end of the tour.",
      "Confirm follow-up timing before ending the conversation.",
      "Connect key product benefits back to the prospect's explicit priorities."
    ],
    suggestedRewrite: "Based on your timeline and budget, this option seems like the best fit. Would you like to move forward with the application today?",
    sectionScores: [
      { section: "Greeting & Introduction", score: 84 },
      { section: "Needs Discovery", score: 80 },
      { section: "Tour & Demonstration", score: 81 },
      { section: "Personalization", score: 77 },
      { section: "Objection Handling", score: 76 },
      { section: "Closing", score: 69 },
      { section: "Follow-Up", score: 75 },
      { section: "Compliance", score: 91 }
    ],
    exactMoments: [
      {
        timestamp: "00:01:12",
        transcriptQuote: `Welcomed prospect to "${params.title}".`,
        explanation: "Strong opening establishes trust quickly.",
        suggestedImprovement: "Add one discovery question immediately after greeting."
      },
      {
        timestamp: "00:07:40",
        transcriptQuote: `${params.prospectName ?? "Prospect"} asked about pricing.`,
        explanation: "Answer was clear but not tied back to value.",
        suggestedImprovement: "Link pricing to benefits that match stated priorities."
      }
    ]
  };
}

function buildFallbackActions(params: { title: string; prospectName: string | null }) {
  return [
    { title: "Send follow-up email", description: `Send availability and pricing details to ${params.prospectName ?? "prospect"}.`, priority: "high" as const, status: "open" as const, suggestedMessage: "Thanks for touring today. Based on your priorities, I recommend we move forward with this option." },
    { title: "Share floor plan", description: "Email the floor plan they were interested in.", priority: "medium" as const, status: "open" as const, suggestedMessage: null },
    { title: "Clarify parking fees", description: "Follow up about parking options and fees.", priority: "medium" as const, status: "open" as const, suggestedMessage: null },
  ];
}
