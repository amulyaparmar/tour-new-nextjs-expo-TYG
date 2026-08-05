// @ts-nocheck
"use client";

// Post-call scorecard: polls for the Vapi analysis, renders the rubric scores
// (labels re-attached from the scenario), checkpoints, coaching notes, and the
// turn-by-turn transcript (from the live capture, since Vapi's post-call
// artifact merges turns). On success it saves the attempt via
// POST /api/roleplay/attempts (identity is stamped server-side).

import { ArrowLeft, RefreshCw, RotateCcw } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { mapToEvaluations, pollForAnalysis } from "@/lib/roleplay/callAnalysis";
import {
  resolveCheckpointTimes,
  resolveFeedbackMoments,
} from "@/lib/roleplay/feedbackTimestamps";
import { computeRoleplayGrade, gradeScoreBand } from "@/lib/roleplay/grading";
import { CategoryBreakdown } from "./CategoryBreakdown";
import { CheckpointSummary } from "./CheckpointSummary";
import { ConversationMetrics } from "./ConversationMetrics";
import { DifficultyBadge } from "./DifficultyBadge";
import { OverallFeedbackDetails, TranscriptDetails } from "./ExpandableReportSections";
import { GradeStatus } from "./GradeStatus";
import { toTranscriptEntries } from "./TranscriptView";
import { computeConversationPace } from "@/lib/roleplay/conversationPace";
import { computeConversationPaceFromAudio } from "@/lib/roleplay/audioPace";

const fmtDuration = (durationSeconds) => {
  const seconds = Math.max(0, Math.round(Number(durationSeconds) || 0));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
};

const fmtWhen = (iso) => {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "";
  return (
    date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) +
    " · " +
    date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
  );
};

export const Scorecard = ({ callId, scenario, traineeName, liveTranscript, onBack, onRetryCall }) => {
  const [phase, setPhase] = useState("polling"); // polling | ready | partial
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState(null);
  const [saveState, setSaveState] = useState("idle"); // idle | saving | saved | failed
  const [resolvedPaceMetrics, setResolvedPaceMetrics] = useState(null);
  const upsertedRef = useRef(false);
  const abortRef = useRef(null);
  const paceMetricsRef = useRef(null);
  // Recording player wiring (same pattern as HistoryDetail): the seek handle
  // is assigned by TranscriptView, and chips downgrade to plain timestamps
  // whenever the recording is absent or errored.
  const transcriptSeekRef = useRef(null);
  const [recordingPlayable, setRecordingPlayable] = useState(false);
  const seekRecording = (seconds) => transcriptSeekRef.current?.(seconds);
  const onSeek = recordingPlayable ? seekRecording : undefined;

  const persistAttempt = async (call, sd) => {
    if (!call || !sd || upsertedRef.current) return;
    const grade = computeRoleplayGrade(scenario, sd);
    // Prefer the live turn-by-turn transcript we captured during the call;
    // Vapi's post-call artifact merges turns into per-speaker blobs.
    const entries =
      liveTranscript && liveTranscript.length
        ? toTranscriptEntries(liveTranscript)
        : toTranscriptEntries(call.transcriptJson);
    const transcript_json = entries.map((entry, index) => ({
      type: entry.type,
      message: entry.message,
      time: Number.isFinite(Number(entry.time)) ? Number(entry.time) : index,
      ...(Number.isFinite(Number(entry.endTime)) ? { endTime: Number(entry.endTime) } : {}),
      ...(Number.isFinite(Number(entry.duration)) ? { duration: Number(entry.duration) } : {}),
      ...(entry.timingSource ? { timingSource: entry.timingSource } : {}),
    }));
    const transcriptStr = entries
      .map((entry) => `${entry.type === "user" ? "Agent" : "Prospect"}: ${entry.message}`)
      .join("\n");

    try {
      setSaveState("saving");
      let paceMetrics = computeConversationPace(call.transcriptJson) ?? paceMetricsRef.current;
      if (!paceMetrics) {
        try {
          paceMetrics = await computeConversationPaceFromAudio(call.id, entries);
        } catch (paceError) {
          console.warn("Conversation pace analysis unavailable:", paceError);
        }
      }
      if (paceMetrics) {
        paceMetricsRef.current = paceMetrics;
        setResolvedPaceMetrics(paceMetrics);
      }

      const evaluations = mapToEvaluations(scenario, sd, call.analysis.summary, {
        transcriptEntries: entries,
      });
      if (paceMetrics) {
        evaluations.push({
          keyword: "roleplay_conversation_pace",
          score: 0,
          comments: ["Conversation pace calculated from Vapi message timing."],
          details: paceMetrics,
        });
      }

      const saveRes = await fetch("/api/roleplay/attempts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vapiCallId: call.id,
          scenarioId: scenario.id,
          scenarioName: scenario.name,
          scenarioDifficulty: scenario.difficulty,
          score: grade.score ?? Math.round(sd.overallScore ?? 0),
          gradeStatus: grade.status,
          durationSeconds: call.durationSeconds,
          summary: call.analysis.summary,
          transcript: transcriptStr,
          transcriptJson: transcript_json,
          evaluations,
        }),
      });
      const saveBody = await saveRes.json().catch(() => null);
      if (!saveRes.ok || !saveBody?.success) {
        throw new Error(saveBody?.message || `Save failed (${saveRes.status})`);
      }
      upsertedRef.current = true;
      setSaveState("saved");
    } catch (error) {
      console.error("calls upsert failed:", error);
      setSaveState("failed");
      toast.error("Your scorecard loaded, but saving it to practice history failed.");
    }
  };

  const runPoll = async () => {
    // One poller at a time: cancel any previous one (Retry, StrictMode
    // double-mount) and never let an aborted poll commit state — otherwise
    // dev's double-effect flashes a false "analysis isn't ready" banner.
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setPhase("polling");
    setElapsed(0);
    const { ready, call } = await pollForAnalysis(callId, {
      onTick: (_attempt, elapsedS) => {
        if (!controller.signal.aborted) setElapsed(elapsedS);
      },
      signal: controller.signal,
    });
    if (controller.signal.aborted) return;
    setResult(call);
    setPhase(ready ? "ready" : "partial");

    if (ready && call?.analysis?.structuredData && !upsertedRef.current) {
      await persistAttempt(call, call.analysis.structuredData);
    }
  };

  useEffect(() => {
    runPoll();
    return () => abortRef.current?.abort();
  }, [callId]);

  const sd = result?.analysis?.structuredData;
  const grade = sd ? computeRoleplayGrade(scenario, sd) : null;
  const transcriptEntries =
    liveTranscript && liveTranscript.length
      ? toTranscriptEntries(liveTranscript)
      : toTranscriptEntries(result?.transcriptJson);
  // Locate grader evidence quotes in the timed transcript so checkpoint and
  // feedback moments render with call-time timestamps (same resolution the
  // save path persists).
  if (grade) resolveCheckpointTimes(grade.checkpoints, transcriptEntries);
  const highlightMoments = sd ? resolveFeedbackMoments(sd.highlights, transcriptEntries) : [];
  const improvementMoments = sd
    ? resolveFeedbackMoments(sd.improvements, transcriptEntries)
    : [];
  const paceMetrics = computeConversationPace(result?.transcriptJson) ?? resolvedPaceMetrics;
  // The recording streams through the presigning audio-track proxy (the raw
  // Vapi URL is unsigned/expiring — see AGENTS.md). Gated on the analysis
  // response actually reporting a recording: right after hang-up Vapi's
  // artifact can lag a few polls, and each poll refreshes `result`, so the
  // player appears as soon as the recording exists.
  const recordingUrl =
    result?.recordingUrl && callId
      ? `/api/roleplay/audio-track?callId=${encodeURIComponent(callId)}&speaker=combined`
      : undefined;
  const attemptWhen = fmtWhen(result?.endedAt ?? result?.startedAt ?? result?.createdAt);
  const hasDuration = Number.isFinite(Number(result?.durationSeconds));
  const attemptMeta = [
    traineeName?.trim(),
    attemptWhen,
    hasDuration ? fmtDuration(result.durationSeconds) : "",
  ].filter(Boolean);

  const scoreTextColors = {
    strong: "text-green-600",
    pass: "text-emerald-600",
    near: "text-amber-600",
    fail: "text-red-600",
  };

  return (
    <div className="flex flex-col gap-4 w-full">
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800"
        >
          <ArrowLeft size={16} /> Back to scenarios
        </button>
        <button
          onClick={onRetryCall}
          className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800"
        >
          <RotateCcw size={15} /> Practice this scenario again
        </button>
      </div>

      {phase === "polling" && (
        <div className="bg-white rounded-xl border border-gray-200 p-10 shadow-sm flex flex-col items-center gap-3">
          <RefreshCw className="animate-spin text-blue-500" size={28} />
          <div className="text-gray-800 font-medium">Grading your roleplay…</div>
          <div className="text-sm text-gray-500">
            The AI trainer is reviewing the transcript — usually takes ~15 seconds.
            {elapsed > 0 && ` (${elapsed}s)`}
          </div>
        </div>
      )}

      {phase === "partial" && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
          <div className="font-medium text-amber-800">Analysis isn't ready yet</div>
          <div className="text-sm text-amber-700 mt-1">
            The call data below may be partial. You can retry fetching the evaluation.
          </div>
          <button
            onClick={runPoll}
            className="mt-3 flex items-center gap-1.5 text-sm bg-amber-600 hover:bg-amber-700 text-white py-1.5 px-4 rounded-lg"
          >
            <RefreshCw size={14} /> Retry
          </button>
        </div>
      )}

      {phase === "ready" && saveState === "failed" && (
        <div className="flex items-center justify-between gap-4 rounded-xl border border-red-200 bg-red-50 p-4">
          <div className="text-sm text-red-800">
            This scorecard has not been saved to practice history yet.
          </div>
          <button
            type="button"
            onClick={() => persistAttempt(result, result?.analysis?.structuredData)}
            className="shrink-0 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
          >
            Retry saving
          </button>
        </div>
      )}

      {phase === "ready" && sd && (
        <>
          {/* Overall score */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <div className="text-sm text-gray-500">{scenario.name}</div>
                  <DifficultyBadge difficulty={scenario.difficulty} />
                </div>
                <div className="flex items-end gap-2 mt-1">
                  <span
                    className={`text-5xl font-bold ${
                      grade ? scoreTextColors[gradeScoreBand(grade)] : "text-gray-300"
                    }`}
                  >
                    {grade?.score ?? "—"}
                  </span>
                  <span className="text-gray-400 text-lg mb-1">/ 100</span>
                </div>
                {attemptMeta.length > 0 && (
                  <div className="mt-1 text-xs text-gray-400">{attemptMeta.join(" · ")}</div>
                )}
              </div>
              {grade && <GradeStatus grade={grade} />}
            </div>
          </div>

          <CategoryBreakdown
            categories={grade?.categories ?? []}
            feedbackByKey={sd.categoryFeedback ?? {}}
            suggestions={improvementMoments.map((moment) => moment.text)}
            passThreshold={grade?.passThreshold}
          />

          {/* Checkpoints — timestamp chips jump the recording below */}
          {grade?.checkpoints.length > 0 && (
            <CheckpointSummary checkpoints={grade.checkpoints} onSeek={onSeek} />
          )}

          <ConversationMetrics
            entries={transcriptEntries}
            paceMetrics={paceMetrics}
            paceState={
              !paceMetrics && saveState === "saving"
                ? "loading"
                : !paceMetrics && saveState === "saved"
                  ? "failed"
                  : "idle"
            }
          />

          <OverallFeedbackDetails
            strengths={highlightMoments}
            suggestions={improvementMoments}
            onSeek={onSeek}
          />
        </>
      )}

      {/* Transcript (turn-by-turn from the live capture) */}
      {(phase === "ready" || phase === "partial") && (
        <TranscriptDetails
          entries={transcriptEntries}
          summary={result?.analysis?.summary}
          recordingUrl={recordingUrl}
          seekControlRef={transcriptSeekRef}
          onPlayabilityChange={setRecordingPlayable}
        />
      )}

      {(phase === "ready" || phase === "partial") && result?.endedReason && (
        <div className="text-xs text-gray-400 text-center">
          call {result.id} · ended: {result.endedReason}
          {typeof result.cost === "number" && ` · cost $${result.cost.toFixed(2)}`}
        </div>
      )}
    </div>
  );
};
