// @ts-nocheck — ported from usevoice.ai-TYG (looser tsconfig); index-access
// strictness (noUncheckedIndexedAccess) not yet retrofitted.
// Client-side helpers for retrieving and mapping post-call analysis.
// Polls our server route (/api/roleplay/call-analysis) — never api.vapi.ai
// directly — until Vapi's async analysisPlan has produced structuredData.

import {
  EvaluationItem,
  RoleplayCallResult,
  RoleplayScenario,
  RoleplayStructuredData,
} from "./types";
import { computeRoleplayGrade, gradeExplanation } from "./grading";
import {
  resolveCheckpointTimes,
  resolveFeedbackMoments,
} from "./feedbackTimestamps";

// Delay schedule in seconds (~92s total). Analysis typically lands in 5-30s
// after call end; the tail covers slow grader runs.
const POLL_DELAYS_S = [3, 3, 5, 5, 8, 8, 10, 10, 15, 15];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function fetchCallAnalysis(
  callId: string
): Promise<{ success: boolean; ready: boolean; call: RoleplayCallResult | null; message?: string }> {
  const res = await fetch(`/api/roleplay/call-analysis?callId=${encodeURIComponent(callId)}`);
  return res.json();
}

// Resolves as soon as analysis is ready; on exhaustion resolves {ready:false}
// with the last response so the UI can show a partial scorecard (recording +
// transcript usually exist before analysis does) and offer a Retry.
export async function pollForAnalysis(
  callId: string,
  opts: { onTick?: (attempt: number, elapsedS: number) => void; signal?: AbortSignal } = {}
): Promise<{ ready: boolean; call: RoleplayCallResult | null; lastError?: string }> {
  let last: RoleplayCallResult | null = null;
  let lastError: string | undefined;
  let elapsedS = 0;

  for (let attempt = 0; attempt < POLL_DELAYS_S.length; attempt++) {
    if (opts.signal?.aborted) return { ready: false, call: last };

    await sleep(POLL_DELAYS_S[attempt] * 1000);
    elapsedS += POLL_DELAYS_S[attempt];
    if (opts.signal?.aborted) return { ready: false, call: last };
    opts.onTick?.(attempt + 1, elapsedS);

    try {
      const res = await fetchCallAnalysis(callId);
      if (res.call) last = res.call;
      // Surfaced when polling exhausts: a server-side failure (e.g. a missing
      // VAPI_PRIVATE_KEY in the deploy env) looks identical to "analysis not
      // ready" otherwise, which made a prod misconfiguration undiagnosable
      // from the UI.
      if (!res.success && res.message) lastError = res.message;
      if (res.success && res.ready && res.call) {
        return { ready: true, call: res.call };
      }
    } catch {
      // Transient network error — keep polling.
    }
  }
  return { ready: false, call: last, lastError };
}

const toSnake = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

// Maps a roleplay result into the existing Supabase `calls.evaluations` shape
// ([{keyword, score, comments[]}]) so the existing /eval page renders it too.
// `transcriptEntries` (timed, from the live capture) lets evidence quotes
// resolve to call-time timestamps at save time; without it everything still
// works, just without timestamp chips.
export function mapToEvaluations(
  scenario: RoleplayScenario,
  sd: RoleplayStructuredData,
  summary?: string,
  opts: { transcriptEntries?: any[] } = {}
): EvaluationItem[] {
  const items: EvaluationItem[] = [];
  const grade = computeRoleplayGrade(scenario, sd);
  const entries = Array.isArray(opts.transcriptEntries) ? opts.transcriptEntries : [];
  resolveCheckpointTimes(grade.checkpoints, entries);
  const highlightMoments = resolveFeedbackMoments(sd.highlights, entries);
  const improvementMoments = resolveFeedbackMoments(sd.improvements, entries);

  items.push({
    keyword: "overall_score_and_summary",
    score: grade.score ?? Math.round(sd.overallScore ?? 0),
    comments: [summary || "No summary available."],
  });

  for (const c of scenario.rubric) {
    const category = grade.categories.find((result) => result.key === c.key);
    const rawFeedback = sd.categoryFeedback?.[c.key];
    const reasons = Array.isArray(rawFeedback?.reasons)
      ? rawFeedback.reasons.filter((reason) => typeof reason === "string" && reason.trim())
      : [];
    if (category?.cappedByCheckpoint) {
      reasons.unshift(
        `The required “${category.cappedByCheckpoint}” checkpoint was missed, so this skill score was capped at ${category.score}/20.`
      );
    }
    items.push({
      keyword: toSnake(c.label),
      rubricKey: c.key,
      label: c.label,
      maxScore: 20,
      score: Math.round(category?.score ?? 0),
      comments: [c.description],
      feedback:
        reasons.length > 0 && rawFeedback?.betterResponse
          ? {
              reasons,
              evidenceQuote: rawFeedback.evidenceQuote,
              betterResponse: rawFeedback.betterResponse,
            }
          : undefined,
      details: {
        description: c.description,
        rawScore: category?.rawScore,
        scoreMissing: category?.score === null,
        cappedByCheckpoint: category?.cappedByCheckpoint,
      },
    });
  }

  // comments stay plain strings (the /eval page and legacy readers render
  // them verbatim); the timestamped moments ride alongside in details.
  if (highlightMoments.length) {
    items.push({
      keyword: "strengths",
      score: grade.score ?? Math.round(sd.overallScore ?? 0),
      comments: highlightMoments.map((moment) => moment.text),
      details: { moments: highlightMoments },
    });
  }

  if (improvementMoments.length) {
    items.push({
      keyword: "suggestions_for_practice",
      score: grade.score ?? Math.round(sd.overallScore ?? 0),
      comments: improvementMoments.map((moment) => moment.text),
      details: { moments: improvementMoments },
    });
  }

  if (scenario.checkpoints.length) {
    const hit = grade.checkpoints.filter((checkpoint) => checkpoint.hit === true).length;
    items.push({
      keyword: "checkpoints_hit",
      score: Math.round((hit / scenario.checkpoints.length) * 100),
      comments: grade.checkpoints.map(
        (checkpoint) =>
          `${checkpoint.hit === true ? "HIT" : checkpoint.hit === false ? "MISSED" : "UNKNOWN"} — ${
            checkpoint.name
          }: ${checkpoint.description}`
      ),
      details: { results: grade.checkpoints },
    });
  }

  items.push({
    keyword: "roleplay_grading_policy",
    score: grade.passed ? 100 : 0,
    comments: [gradeExplanation(grade)],
    details: {
      ...grade,
      scenarioId: scenario.id,
      scenarioName: scenario.name,
      scenarioDifficulty: scenario.difficulty,
    },
  });

  return items;
}
