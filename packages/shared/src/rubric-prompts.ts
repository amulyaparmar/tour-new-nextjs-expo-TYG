import type { RubricDefinition } from "./rubric";
import { rubricTotalPoints, sectionPoints } from "./rubric";

export const RUBRIC_SESSION_TYPE_PRESETS = [
  { id: "in_person", label: "In person" },
  { id: "call", label: "Call" },
  { id: "virtual_tour", label: "Virtual tour" },
  { id: "in_person_tour", label: "In person tour" },
] as const;

export type RubricSessionTypePresetId = (typeof RUBRIC_SESSION_TYPE_PRESETS)[number]["id"];

export const DEFAULT_RUBRIC_SESSION_TYPE: RubricSessionTypePresetId = "in_person_tour";

export function rubricSessionTypeLabel(sessionType: string | null | undefined): string {
  if (!sessionType?.trim()) return RUBRIC_SESSION_TYPE_PRESETS.find((preset) => preset.id === DEFAULT_RUBRIC_SESSION_TYPE)!.label;
  const preset = RUBRIC_SESSION_TYPE_PRESETS.find((item) => item.id === sessionType);
  return preset?.label ?? sessionType.trim();
}

export function isRubricSessionTypePreset(value: string): value is RubricSessionTypePresetId {
  return RUBRIC_SESSION_TYPE_PRESETS.some((preset) => preset.id === value);
}

export const DEFAULT_SEGMENTATION_PROMPT = [
  "You are an expert leasing coach reviewing apartment tour recordings.",
  "",
  "If you were to segment this tour into sections, how would you segment it?",
  "Base sections on natural transitions in the conversation — location changes, topic shifts, qualification moments, digressions, closing attempts — not a generic phase checklist.",
  "",
  "Calibrate to this style (structure and tone, not content to copy):",
  "",
  "1. Initial Greeting & Setup (00:05 - 00:30)",
  "   - Introduction and rapport building",
  "   - Decision to defer guest card until after tour",
  "   - Transition to beginning the tour",
  "",
  "3. Prospect Qualification Moment (01:34 - 01:50)",
  "   - Brief discussion of gap semester and double major plans",
  "   - Mention of sister property (The Yard)",
  "   - Critical missed opportunity to explore needs",
  "",
  "10. Weak Closing Attempt (07:14 - 07:46)",
  '   - "Anything else I can help you with today?" — exit line',
  "   - Brief discussion about non-student residents",
  "   - Initial goodbye",
  "",
  "11. Last-Minute Special Discussion (07:46 - 08:33)",
  "   - Prospect asks about specials (should have been proactive)",
  "   - $500 gift card explanation",
  "   - Move-in timing clarification",
  "",
  "Key observation: The most problematic segment is #10 (Weak Closing) where the agent invites the prospect to leave without sitting down to review options. Segment #11 shows the prospect was still engaged, proving the agent closed too early. Earlier qualification and presentation gaps weakened the close.",
  "",
  "How to segment:",
  "- Use specific, coach-facing titles (e.g. \"Fitness Center Tour\", \"Prospect Qualification Moment\", \"Weak Closing Attempt\") — not generic labels like \"Tour\" or \"Discovery\"",
  "- Split distinct chapters even when short: qualification beats, weak closes, prospect-initiated specials, digressions",
  "- Group by location when touring amenities; group by topic when the conversation shifts without moving",
  "- 2–4 concise bullet highlights per section; call out missed opportunities and coaching moments directly in bullets",
  "- Include location when tied to a physical area",
  "- Use startTime/endTime in seconds from the transcript (do not put timestamps in the title)",
  "- Cover the full tour chronologically with minimal gaps",
  "",
  "In structureNotes, write a brief \"Key observation:\" summarizing the most problematic segments and how they connect (e.g. early missed qualification → weak close → prospect still asking questions).",
].join("\n");

export function buildRubricAnalysisPrompt(definition: RubricDefinition): string {
  const totalPoints = rubricTotalPoints(definition);
  const lines: string[] = [
    "You are an expert mystery shopping evaluator for apartment leasing tours.",
    "You evaluate recorded tour conversations using the custom evaluation rubric below.",
    "",
    "Your task is to perform a thorough, evidence-based analysis.",
    "Every observation MUST be grounded in specific quotes or moments from the transcript.",
    "",
    `## Scoring Rubric — ${totalPoints} points total`,
    "",
  ];

  for (const section of definition.sections) {
    const sectionMax = sectionPoints(section);
    lines.push(`### ${section.name} (${sectionMax} points max)`);
    lines.push("Score each item YES (full points) or NO (0 points) based on transcript evidence:");
    for (const item of section.items) {
      const note = item.note ? ` — ${item.note}` : "";
      lines.push(`  ${item.id}. ${item.text} (${item.points} pts)${note}`);
    }
    lines.push("");
  }

  if (definition.compliance?.length) {
    lines.push("### Fair Housing / Compliance (not scored — flag only)");
    for (const item of definition.compliance) {
      lines.push(`  ${item.id}. ${item.text}`);
    }
    lines.push("Flag any compliance issues found. Do NOT deduct points — report them in fairHousingFlags.");
    lines.push("");
  }

  lines.push("## Scoring Instructions");
  if (definition.notes) {
    lines.push(definition.notes);
  } else {
    lines.push("- For each section, total the points earned out of the section max.");
    lines.push(`- Convert each section to a 0-100 scale: sectionScore = round(pointsEarned / sectionMax * 100).`);
    lines.push(`- overallScore = round(totalPointsEarned / ${totalPoints} * 100).`);
    lines.push("- If an item cannot be evaluated from the transcript, score 0 unless visual-only exceptions are noted in the rubric.");
  }

  lines.push("");
  lines.push("## Output Format");
  lines.push("Return ONLY valid JSON matching the submit_analysis tool schema.");
  lines.push("- Score EVERY item in every section. Do not skip any.");
  lines.push("- Map every rubric item to evidence in the transcript.");
  lines.push("- Identify coaching-worthy moments in exactMoments with question references.");
  lines.push("- suggestedRewrite should transform the weakest line into a model script.");
  lines.push("- The executive summary should cover attitude, closing technique, lease likelihood, strengths, and opportunities.");

  return lines.join("\n");
}

export function normalizeRubricPromptOverride(value: string | null | undefined, defaultValue: string): string | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed || trimmed === defaultValue.trim()) return null;
  return trimmed;
}
