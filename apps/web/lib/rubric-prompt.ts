import type { RubricDefinition } from "@tour/shared";

import { computeRubricTotalPoints } from "./default-rubric";

export function buildRubricAnalysisPrompt(definition: RubricDefinition): string {
  const totalPoints = computeRubricTotalPoints(definition);
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
    lines.push(`### ${section.name} (${section.maxPoints} points max)`);
    lines.push("Score each question YES (full points) or NO (0 points) based on transcript evidence:");
    for (const q of section.questions) {
      const guidance = q.guidance ? ` — ${q.guidance}` : "";
      lines.push(`  ${q.id}. ${q.question} (${q.maxPoints} pts)${guidance}`);
    }
    lines.push("");
  }

  if (definition.complianceQuestions?.length) {
    lines.push("### Fair Housing / Compliance (not scored — flag only)");
    for (const q of definition.complianceQuestions) {
      lines.push(`  ${q.id}. ${q.question}`);
    }
    lines.push("Flag any compliance issues found. Do NOT deduct points — report them in fairHousingFlags.");
    lines.push("");
  }

  lines.push("## Scoring Instructions");
  if (definition.scoringInstructions) {
    lines.push(definition.scoringInstructions);
  } else {
    lines.push("- For each section, total the points earned out of the section max.");
    lines.push(`- Convert each section to a 0-100 scale: sectionScore = round(pointsEarned / sectionMax * 100).`);
    lines.push(`- overallScore = round(totalPointsEarned / ${totalPoints} * 100).`);
    lines.push("- If a question cannot be evaluated from the transcript, score 0 unless visual-only exceptions are noted in the rubric.");
  }

  lines.push("");
  lines.push("## Output Format");
  lines.push("Return ONLY valid JSON matching the submit_analysis tool schema.");
  lines.push("- Score EVERY question in every section. Do not skip any.");
  lines.push("- Map every rubric question to evidence in the transcript.");
  lines.push("- Identify coaching-worthy moments in exactMoments with question references.");
  lines.push("- suggestedRewrite should transform the weakest line into a model script.");
  lines.push("- The executive summary should cover attitude, closing technique, lease likelihood, strengths, and opportunities.");

  return lines.join("\n");
}
