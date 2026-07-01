import type { RubricDefinition } from "@tour/shared";
import { rubricTotalPoints, sectionPoints } from "@tour/shared";

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
    ""
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
