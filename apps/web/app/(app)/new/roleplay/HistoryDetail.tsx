// @ts-nocheck
"use client";

// Full detail for one past roleplay attempt, reconstructed from the stored
// `roleplay_attempts` row (GET /api/roleplay/attempts?id=…) — no Vapi
// re-fetch for the scorecard itself; the recording streams through the
// audio-track proxy keyed by the row's vapi_call_id.
//
// Ported from usevoice.ai-TYG. Differences: rows come from the attempts API
// (identity-scoped server-side) instead of a client Supabase read, and the
// audio-pace backfill client-UPDATE was dropped — pace metrics are computed at
// scorecard save time, and this app has no browser Supabase client to write
// with.

import { ArrowLeft, RefreshCw } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { gradeFromStoredEvaluations, gradeScoreBand } from "@/lib/roleplay/grading";
import { CategoryBreakdown } from "./CategoryBreakdown";
import { CheckpointSummary } from "./CheckpointSummary";
import { ConversationMetrics } from "./ConversationMetrics";
import { DifficultyBadge } from "./DifficultyBadge";
import { OverallFeedbackDetails, TranscriptDetails } from "./ExpandableReportSections";
import { GradeStatus } from "./GradeStatus";
import { toTranscriptEntries } from "./TranscriptView";

// Keywords mapToEvaluations uses for non-category rows; everything else is a
// rubric category (0–20).
const SPECIAL = new Set([
  "overall_score_and_summary",
  "strengths",
  "suggestions_for_practice",
  "checkpoints_hit",
  "roleplay_grading_policy",
  "roleplay_conversation_pace",
]);

const titleize = (snake) =>
  (snake || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const fmtDuration = (d) => {
  const s = Math.max(0, Math.round(Number(d) || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
const fmtWhen = (iso) => {
  try {
    const dt = new Date(iso);
    return (
      dt.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) +
      " · " +
      dt.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    );
  } catch {
    return "";
  }
};
const scoreTextColors = {
  strong: "text-green-600",
  pass: "text-emerald-600",
  near: "text-amber-600",
  fail: "text-red-600",
};

export const HistoryDetail = ({ attemptId, onBack, scenarios = [] }) => {
  const [row, setRow] = useState(null);
  const [loading, setLoading] = useState(true);
  // Handle into TranscriptView's player (assigned by the component itself) so
  // checkpoint and feedback timestamp chips can jump the recording. Chips
  // downgrade to plain timestamps whenever the recording is absent/errored.
  const transcriptSeekRef = useRef(null);
  const [recordingPlayable, setRecordingPlayable] = useState(false);
  const seekRecording = (seconds) => transcriptSeekRef.current?.(seconds);
  const onSeek = recordingPlayable ? seekRecording : undefined;

  const load = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/roleplay/attempts?id=${encodeURIComponent(attemptId)}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.message || "Request failed");
      setRow(data.attempt);
    } catch (e) {
      console.error(e);
      toast.error("Could not load this session.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [attemptId]);

  const evals = Array.isArray(row?.evaluations) ? row.evaluations : [];
  const categoryEvaluations = evals.filter((e) => !SPECIAL.has(e.keyword));
  // Rows saved since the timestamped-feedback schema carry {text, timeSeconds}
  // moments in details; older rows only have the plain comment strings.
  const strengthsEval = evals.find((e) => e.keyword === "strengths");
  const strengths = Array.isArray(strengthsEval?.details?.moments)
    ? strengthsEval.details.moments
    : strengthsEval?.comments || [];
  const suggestionsEval = evals.find((e) => e.keyword === "suggestions_for_practice");
  const suggestions = Array.isArray(suggestionsEval?.details?.moments)
    ? suggestionsEval.details.moments
    : suggestionsEval?.comments || [];
  const suggestionTexts = suggestions.map((item) =>
    typeof item === "string" ? item : String(item?.text ?? "")
  );
  const policyDetails = evals.find((e) => e.keyword === "roleplay_grading_policy")?.details;
  const paceMetrics = evals.find((e) => e.keyword === "roleplay_conversation_pace")?.details;
  const matchingScenario = scenarios.find(
    (scenario) =>
      (policyDetails?.scenarioId && scenario.id === policyDetails.scenarioId) ||
      scenario.id === row?.scenario_id ||
      scenario.name === row?.scenario_name
  );
  const difficulty =
    policyDetails?.scenarioDifficulty ||
    policyDetails?.difficulty ||
    row?.scenario_difficulty ||
    matchingScenario?.difficulty;
  const grade = gradeFromStoredEvaluations(row?.score, evals);
  const score = grade.score;
  const hasScore = score !== null;
  const categories = categoryEvaluations.map((category, index) => ({
    key: category.rubricKey || category.keyword || `category-${index + 1}`,
    label: category.label || titleize(category.keyword),
    description: category.details?.description || category.comments?.[0] || "",
    score: category.details?.scoreMissing ? null : category.score,
    feedback: category.feedback,
    cappedByCheckpoint: category.details?.cappedByCheckpoint,
  }));
  const transcriptEntries = toTranscriptEntries(row?.transcript_json);

  return (
    <div className="flex flex-col gap-4 w-full">
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 w-fit"
      >
        <ArrowLeft size={16} /> Back to history
      </button>

      {loading && (
        <div className="py-20 text-center text-gray-400">
          <RefreshCw className="animate-spin inline" size={22} />
        </div>
      )}

      {!loading && !row && (
        <div className="border border-dashed border-gray-300 rounded-xl py-16 text-center text-gray-500">
          Session not found.
        </div>
      )}

      {!loading && row && (
        <>
          {/* Score header */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <div className="text-sm text-gray-500">{row.scenario_name || "Roleplay"}</div>
                  <DifficultyBadge difficulty={difficulty} />
                </div>
                <div className="flex items-end gap-2 mt-1">
                  <span
                    className={`text-5xl font-bold ${
                      hasScore ? scoreTextColors[gradeScoreBand(grade)] : "text-gray-300"
                    }`}
                  >
                    {hasScore ? Math.round(score) : "—"}
                  </span>
                  <span className="text-gray-400 text-lg mb-1">/ 100</span>
                </div>
                <div className="text-xs text-gray-400 mt-1">
                  {row.agent_name ? `${row.agent_name} · ` : ""}
                  {fmtWhen(row.created_at)}
                  {row.duration_seconds ? ` · ${fmtDuration(row.duration_seconds)}` : ""}
                </div>
              </div>
              <GradeStatus grade={grade} />
            </div>
          </div>

          {categories.length > 0 && (
            <CategoryBreakdown
              categories={categories}
              suggestions={suggestionTexts}
              passThreshold={grade.passThreshold}
            />
          )}

          {/* Checkpoints — timestamp chips jump the recording below */}
          {grade.checkpoints.length > 0 && (
            <CheckpointSummary checkpoints={grade.checkpoints} onSeek={onSeek} />
          )}

          <ConversationMetrics
            entries={transcriptEntries}
            paceMetrics={paceMetrics}
            paceState="idle"
          />

          <OverallFeedbackDetails
            strengths={strengths}
            suggestions={suggestions}
            onSeek={onSeek}
          />

          <TranscriptDetails
            entries={transcriptEntries}
            summary={row.summary}
            // Vapi presigned URLs expire (~40 min), so playback streams through
            // the same-origin proxy that presigns fresh per request.
            recordingUrl={
              row.vapi_call_id
                ? `/api/roleplay/audio-track?callId=${encodeURIComponent(row.vapi_call_id)}&speaker=combined`
                : undefined
            }
            seekControlRef={transcriptSeekRef}
            onPlayabilityChange={setRecordingPlayable}
          />
        </>
      )}
    </div>
  );
};
