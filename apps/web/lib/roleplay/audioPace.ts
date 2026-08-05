// @ts-nocheck — ported from usevoice.ai-TYG (looser tsconfig); index-access
// strictness (noUncheckedIndexedAccess) not yet retrofitted.
// Client-side voice activity analysis for Vapi's separated agent/prospect
// audio tracks. This is the fallback when merged post-call messages report
// zero duration. It measures voiced intervals from the waveform; it does not
// infer timing from transcript length.

import type { ConversationPaceMetrics, PaceSegment } from "./conversationPace";
import { hasSpokenDebrief, trimSpokenDebrief } from "./transcriptBoundary";

type SpeechInterval = { start: number; end: number; duration: number };

const wordsIn = (value: unknown): string[] =>
  String(value ?? "").match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) ?? [];

const round1 = (value: number) => Math.round(value * 10) / 10;

const median = (values: number[]): number | null => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
};

const analyzeTrack = (buffer: AudioBuffer): SpeechInterval[] => {
  const samples = buffer.getChannelData(0);
  const frameSeconds = 0.03;
  const frameSize = Math.max(1, Math.round(buffer.sampleRate * frameSeconds));
  const frameCount = Math.ceil(samples.length / frameSize);
  const rms: number[] = new Array(frameCount);

  for (let frame = 0; frame < frameCount; frame++) {
    const start = frame * frameSize;
    const end = Math.min(samples.length, start + frameSize);
    let sumSquares = 0;
    let sampleCount = 0;
    // Sampling every other PCM value keeps analysis fast without materially
    // changing a 30 ms energy estimate.
    for (let index = start; index < end; index += 2) {
      sumSquares += samples[index] * samples[index];
      sampleCount++;
    }
    rms[frame] = sampleCount ? Math.sqrt(sumSquares / sampleCount) : 0;
  }

  const sortedRms = [...rms].sort((a, b) => a - b);
  const percentile = (fraction: number) =>
    sortedRms[Math.min(sortedRms.length - 1, Math.floor(sortedRms.length * fraction))] || 0;
  const noiseFloor = percentile(0.2);
  const speechLevel = percentile(0.95);
  const threshold = Math.max(0.0015, noiseFloor * 3, speechLevel * 0.06);
  const voiced = rms.map((value) => value >= threshold);

  // Bridge brief pauses inside one utterance (up to 210 ms).
  const maxGapFrames = Math.round(0.21 / frameSeconds);
  for (let index = 0; index < voiced.length; ) {
    if (voiced[index]) {
      index++;
      continue;
    }
    const gapStart = index;
    while (index < voiced.length && !voiced[index]) index++;
    const gapLength = index - gapStart;
    if (gapStart > 0 && index < voiced.length && gapLength <= maxGapFrames) {
      for (let fill = gapStart; fill < index; fill++) voiced[fill] = true;
    }
  }

  const minimumSpeechFrames = Math.round(0.12 / frameSeconds);
  const intervals: SpeechInterval[] = [];
  for (let index = 0; index < voiced.length; ) {
    if (!voiced[index]) {
      index++;
      continue;
    }
    const runStart = index;
    while (index < voiced.length && voiced[index]) index++;
    if (index - runStart < minimumSpeechFrames) continue;

    const start = Math.max(0, runStart * frameSeconds - 0.06);
    const end = Math.min(buffer.duration, index * frameSeconds + 0.06);
    const previous = intervals[intervals.length - 1];
    if (previous && start <= previous.end + 0.05) {
      previous.end = end;
      previous.duration = previous.end - previous.start;
    } else {
      intervals.push({ start, end, duration: end - start });
    }
  }

  return intervals;
};

const fetchAndDecode = async (
  context: AudioContext,
  callId: string,
  speaker: "agent" | "prospect"
): Promise<AudioBuffer> => {
  const response = await fetch(
    `/api/roleplay/audio-track?callId=${encodeURIComponent(callId)}&speaker=${speaker}`
  );
  if (!response.ok) throw new Error(`${speaker} audio track unavailable (${response.status})`);
  return context.decodeAudioData(await response.arrayBuffer());
};

export const computeConversationPaceFromAudio = async (
  callId: string,
  transcriptEntries: any[] = []
): Promise<ConversationPaceMetrics | null> => {
  if (typeof window === "undefined") return null;
  const AudioContextConstructor = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextConstructor) return null;

  const context = new AudioContextConstructor();
  try {
    const [agentBuffer, prospectBuffer] = await Promise.all([
      fetchAndDecode(context, callId, "agent"),
      fetchAndDecode(context, callId, "prospect"),
    ]);
    const agentIntervals = analyzeTrack(agentBuffer);
    let prospectIntervals = analyzeTrack(prospectBuffer);
    if (!agentIntervals.length || !prospectIntervals.length) return null;

    const debriefDetected = hasSpokenDebrief(transcriptEntries);
    if (debriefDetected) {
      // The separated audio has no word timestamps. Once a spoken debrief is
      // detected in the transcript, the last agent utterance is the safest
      // deterministic end of the scored interaction. Exclude the AI farewell
      // and spoken grading that follow it rather than letting coaching dominate
      // the prospect's talk time.
      const roleplayCutoff = Math.max(...agentIntervals.map((interval) => interval.end));
      prospectIntervals = prospectIntervals
        .filter((interval) => interval.start < roleplayCutoff)
        .map((interval) => ({
          ...interval,
          end: Math.min(interval.end, roleplayCutoff),
          duration: Math.max(0, Math.min(interval.end, roleplayCutoff) - interval.start),
        }))
        .filter((interval) => interval.duration > 0);
    }
    if (!prospectIntervals.length) return null;

    const agentTalkSeconds = agentIntervals.reduce((sum, interval) => sum + interval.duration, 0);
    const prospectTalkSeconds = prospectIntervals.reduce((sum, interval) => sum + interval.duration, 0);
    const totalTalkSeconds = agentTalkSeconds + prospectTalkSeconds;
    const scopedTranscriptEntries = trimSpokenDebrief(transcriptEntries).entries;
    const agentWordCount = scopedTranscriptEntries
      .filter(
        (entry) =>
          entry?.role === "user" || entry?.role === "customer" || entry?.type === "user"
      )
      .reduce((sum, entry) => sum + wordsIn(entry?.text ?? entry?.message).length, 0);
    if (totalTalkSeconds <= 0 || agentTalkSeconds <= 0 || agentWordCount <= 0) return null;

    const chronological = [
      ...agentIntervals.map((interval) => ({ ...interval, type: "user" as const })),
      ...prospectIntervals.map((interval) => ({ ...interval, type: "bot" as const })),
    ].sort((a, b) => a.start - b.start);
    const responseLatencies: number[] = [];
    for (let index = 1; index < chronological.length; index++) {
      const previous = chronological[index - 1];
      const current = chronological[index];
      if (previous.type === "bot" && current.type === "user") {
        responseLatencies.push(Math.min(60, Math.max(0, current.start - previous.end)));
      }
    }

    const agentShare = Math.round((agentTalkSeconds / totalTalkSeconds) * 100);
    const latency = median(responseLatencies);
    const segments: PaceSegment[] = chronological.map((interval) => ({
      type: interval.type,
      startSeconds: round1(interval.start),
      endSeconds: round1(interval.end),
      durationSeconds: round1(interval.duration),
      wordCount: 0,
    }));

    return {
      metricsVersion: 2,
      source: "vapi-audio-vad",
      agentTalkSeconds: round1(agentTalkSeconds),
      prospectTalkSeconds: round1(prospectTalkSeconds),
      agentTalkShare: agentShare,
      prospectTalkShare: 100 - agentShare,
      agentWordsPerMinute: Math.round(agentWordCount / (agentTalkSeconds / 60)),
      longestAgentMonologueSeconds: round1(
        Math.max(...agentIntervals.map((interval) => interval.duration))
      ),
      medianResponseLatencySeconds: latency === null ? null : round1(latency),
      agentWordCount,
      timedSegmentCount: segments.length,
      segments,
    };
  } finally {
    await context.close().catch(() => undefined);
  }
};
