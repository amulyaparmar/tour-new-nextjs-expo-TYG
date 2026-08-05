// @ts-nocheck — ported from usevoice.ai-TYG (looser tsconfig); index-access
// strictness (noUncheckedIndexedAccess) not yet retrofitted.
// Voice-timing coaching signals for roleplay attempts. The calculations only
// accept entries with explicit start/end timing; text-only legacy transcripts
// return null instead of presenting estimates as measured speech.

import { trimSpokenDebrief } from "./transcriptBoundary";

const wordsIn = (value: unknown): string[] =>
  String(value ?? "").match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) ?? [];

const finiteNumber = (value: unknown): number | null => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const round1 = (value: number) => Math.round(value * 10) / 10;

const median = (values: number[]): number | null => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
};

export type PaceSegment = {
  type: "user" | "bot";
  startSeconds: number;
  endSeconds: number;
  durationSeconds: number;
  wordCount: number;
};

export type ConversationPaceMetrics = {
  metricsVersion: 2;
  source: "vapi-message-timing" | "vapi-audio-vad";
  agentTalkSeconds: number;
  prospectTalkSeconds: number;
  agentTalkShare: number;
  prospectTalkShare: number;
  agentWordsPerMinute: number;
  longestAgentMonologueSeconds: number;
  medianResponseLatencySeconds: number | null;
  agentWordCount: number;
  timedSegmentCount: number;
  segments: PaceSegment[];
};

const mergeIntervals = (segments: PaceSegment[]): Array<{ start: number; end: number }> => {
  const intervals = segments
    .map((segment) => ({ start: segment.startSeconds, end: segment.endSeconds }))
    .sort((a, b) => a.start - b.start);
  const merged: Array<{ start: number; end: number }> = [];

  for (const interval of intervals) {
    const previous = merged[merged.length - 1];
    if (previous && interval.start <= previous.end) {
      previous.end = Math.max(previous.end, interval.end);
    } else {
      merged.push({ ...interval });
    }
  }

  return merged;
};

export const computeConversationPace = (entries: any[] = []): ConversationPaceMetrics | null => {
  const scopedEntries = trimSpokenDebrief(entries).entries;
  const segments: PaceSegment[] = scopedEntries
    .map((entry) => {
      const start = finiteNumber(entry?.time ?? entry?.startSeconds);
      const explicitEnd = finiteNumber(entry?.endTime ?? entry?.endSeconds);
      const explicitDuration = finiteNumber(entry?.duration ?? entry?.durationSeconds);
      const duration =
        explicitDuration !== null && explicitDuration > 0
          ? explicitDuration
          : start !== null && explicitEnd !== null && explicitEnd > start
            ? explicitEnd - start
            : null;

      if (start === null || duration === null || duration <= 0 || duration > 600) return null;

      const type =
        entry?.role === "user" || entry?.role === "customer" || entry?.type === "user"
          ? "user"
          : "bot";

      return {
        type,
        startSeconds: Math.max(0, start),
        endSeconds: Math.max(0, start) + duration,
        durationSeconds: duration,
        wordCount: wordsIn(entry?.text ?? entry?.message).length,
      } as PaceSegment;
    })
    .filter((segment): segment is PaceSegment => !!segment)
    .sort((a, b) => a.startSeconds - b.startSeconds);

  const agentSegments = segments.filter((segment) => segment.type === "user");
  const prospectSegments = segments.filter((segment) => segment.type === "bot");
  if (!agentSegments.length || !prospectSegments.length) return null;

  const agentIntervals = mergeIntervals(agentSegments);
  const prospectIntervals = mergeIntervals(prospectSegments);
  const agentTalkSeconds = agentIntervals.reduce((sum, interval) => sum + interval.end - interval.start, 0);
  const prospectTalkSeconds = prospectIntervals.reduce(
    (sum, interval) => sum + interval.end - interval.start,
    0
  );
  const totalTalkSeconds = agentTalkSeconds + prospectTalkSeconds;
  const agentWordCount = agentSegments.reduce((sum, segment) => sum + segment.wordCount, 0);
  if (agentTalkSeconds <= 0 || prospectTalkSeconds <= 0 || totalTalkSeconds <= 0 || agentWordCount <= 0) {
    return null;
  }

  // Combine adjacent fragments from the same speaker when Vapi split one
  // uninterrupted utterance into multiple messages.
  const chronologicalRuns: PaceSegment[] = [];
  for (const segment of segments) {
    const previous = chronologicalRuns[chronologicalRuns.length - 1];
    if (
      previous &&
      previous.type === segment.type &&
      segment.startSeconds <= previous.endSeconds + 0.75
    ) {
      previous.endSeconds = Math.max(previous.endSeconds, segment.endSeconds);
      previous.durationSeconds = previous.endSeconds - previous.startSeconds;
      previous.wordCount += segment.wordCount;
    } else {
      chronologicalRuns.push({ ...segment });
    }
  }

  const responseLatencies: number[] = [];
  for (let index = 1; index < chronologicalRuns.length; index++) {
    const previous = chronologicalRuns[index - 1];
    const current = chronologicalRuns[index];
    if (previous.type === "bot" && current.type === "user") {
      const latency = current.startSeconds - previous.endSeconds;
      if (latency >= 0 && latency <= 60) responseLatencies.push(latency);
    }
  }

  const agentShare = Math.round((agentTalkSeconds / totalTalkSeconds) * 100);
  const medianLatency = median(responseLatencies);

  return {
    metricsVersion: 2,
    source: "vapi-message-timing",
    agentTalkSeconds: round1(agentTalkSeconds),
    prospectTalkSeconds: round1(prospectTalkSeconds),
    agentTalkShare: agentShare,
    prospectTalkShare: 100 - agentShare,
    agentWordsPerMinute: Math.round(agentWordCount / (agentTalkSeconds / 60)),
    longestAgentMonologueSeconds: round1(
      Math.max(
        0,
        ...chronologicalRuns
          .filter((segment) => segment.type === "user")
          .map((segment) => segment.durationSeconds)
      )
    ),
    medianResponseLatencySeconds: medianLatency === null ? null : round1(medianLatency),
    agentWordCount,
    timedSegmentCount: segments.length,
    segments,
  };
};
