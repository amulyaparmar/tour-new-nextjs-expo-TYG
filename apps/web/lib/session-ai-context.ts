import "server-only";

import type { AnalysisResult } from "@tour/shared";

import type { TranscriptSegment } from "./evidence";

const MAX_TRANSCRIPT_CHARS = 12_000;

export function buildSessionAiInstructions(
  analysis: AnalysisResult,
  transcript: TranscriptSegment[]
): string {
  const sections = analysis.sectionScores
    .map((section) => {
      const questions = section.questions ?? [];
      const passCount = questions.filter((q) => q.passed).length;
      const detail = questions.length
        ? `${passCount}/${questions.length} questions passed`
        : `${section.score}%`;
      return `- ${section.section}: ${detail}`;
    })
    .join("\n");

  const moments = analysis.exactMoments
    .slice(0, 10)
    .map((m) => `- [${m.timestamp}] ${m.transcriptQuote.slice(0, 120)} — ${m.explanation}`)
    .join("\n");

  const transcriptText = transcript
    .map((seg) => `[${formatTs(seg.startTime)}] ${seg.speaker}: ${seg.text}`)
    .join("\n")
    .slice(0, MAX_TRANSCRIPT_CHARS);

  return `You are Tour AI, a coaching assistant for multifamily leasing teams reviewing recorded tour sessions.

Use the session analysis and transcript below. Be specific, actionable, and concise. Reference timestamps when citing moments. If asked about something not in the data, say so briefly.

## Session score
Overall: ${analysis.overallScore}% (${analysis.totalPointsEarned}/${analysis.totalPointsPossible} points)

## Summary
${analysis.summary}

## Strengths
${analysis.strengths.map((s) => `- ${s}`).join("\n") || "- None noted"}

## Opportunities
${analysis.opportunities.map((o) => `- ${o}`).join("\n") || "- None noted"}

## Suggested close / rewrite
${analysis.suggestedRewrite || "Not provided"}

## Rubric sections
${sections || "No section breakdown"}

## Key moments
${moments || "No key moments indexed"}

## Transcript
${transcriptText || "Transcript unavailable"}`;
}

function formatTs(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
