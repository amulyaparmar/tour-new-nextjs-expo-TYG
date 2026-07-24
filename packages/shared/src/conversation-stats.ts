import {
  isAgentSpeakerLabel,
  isProspectSpeakerLabel,
} from "./speaker-labels";

export type ConversationStatsTranscriptSegment = {
  speaker: string;
  startTime: number;
  endTime: number;
  text: string;
};

export type TranscriptSpeakerTalkTime = {
  speaker: string;
  role: "agent" | "prospect" | "other";
  seconds: number;
  sharePercent: number;
};

export type TranscriptConversationStats = {
  /** Agent share of all measurable speaker time. */
  talkRatioPercent: number | null;
  /** Measurable agent speaking time. */
  repTalkTimeSeconds: number | null;
  /** Longest contiguous prospect turn. */
  longestProspectTalkSeconds: number | null;
  /** Longest contiguous turn by any speaker. */
  longestTalkSeconds: number | null;
  /** Mean delay for measurable Prospect -> Agent transitions. */
  patienceSeconds: number | null;
  /** Agent transcript words divided by measurable agent speaking time. */
  talkSpeedWordsPerMinute: number | null;
  speakerTalkTimes: TranscriptSpeakerTalkTime[];
  quality: {
    validSegmentCount: number;
    droppedSegmentCount: number;
    roleCoveragePercent: number;
    responseSampleCount: number;
    overlapResponseCount: number;
    timestampResolution: "subsecond" | "whole-second";
    warnings: string[];
  };
};

type SpeakerRole = TranscriptSpeakerTalkTime["role"];

type NormalizedTurn = {
  role: SpeakerRole;
  speaker: string;
  startTime: number;
  endTime: number;
  wordCount: number;
};

const MAX_RESPONSE_GAP_SECONDS = 30;
const CONTIGUOUS_TURN_GAP_SECONDS = 1;

/**
 * Deterministic measurements derived from transcript timestamps. This is the
 * immediate baseline; semantic measures such as interactivity remain Gemini-only.
 */
export function calculateTranscriptConversationStats(
  transcript: ReadonlyArray<ConversationStatsTranscriptSegment>,
): TranscriptConversationStats | null {
  const segments = transcript
    .map(normalizeSegment)
    .filter((segment): segment is NormalizedTurn => segment !== null)
    .sort((a, b) => a.startTime - b.startTime || a.endTime - b.endTime);

  if (segments.length === 0) return null;

  const intervalsBySpeaker = new Map<
    string,
    {
      speaker: string;
      role: SpeakerRole;
      intervals: Array<{ startTime: number; endTime: number }>;
    }
  >();
  for (const segment of segments) {
    const key = `${segment.role}:${segment.speaker.toLowerCase()}`;
    const entry = intervalsBySpeaker.get(key) ?? {
      speaker: segment.speaker,
      role: segment.role,
      intervals: [],
    };
    entry.intervals.push({
      startTime: segment.startTime,
      endTime: segment.endTime,
    });
    intervalsBySpeaker.set(key, entry);
  }

  const measuredSpeakers = [...intervalsBySpeaker.values()].map((entry) => ({
    speaker: entry.speaker,
    role: entry.role,
    seconds: mergedIntervalDuration(entry.intervals),
  }));
  const totalTalkTime = measuredSpeakers.reduce(
    (sum, speaker) => sum + speaker.seconds,
    0,
  );
  if (totalTalkTime <= 0) return null;

  const agentSpeakers = measuredSpeakers.filter((speaker) => speaker.role === "agent");
  const prospectSpeakers = measuredSpeakers.filter((speaker) => speaker.role === "prospect");
  const agentTalkTime = agentSpeakers.reduce(
    (sum, speaker) => sum + speaker.seconds,
    0,
  );
  const recognizedRoleTalkTime = measuredSpeakers
    .filter((speaker) => speaker.role !== "other")
    .reduce((sum, speaker) => sum + speaker.seconds, 0);

  const turns = mergeContiguousTurns(segments);
  const prospectTurns = turns.filter((turn) => turn.role === "prospect");
  const longestProspectTalk = maxTurnDuration(prospectTurns);
  const longestTalk = maxTurnDuration(turns);

  const responseGaps: number[] = [];
  let overlapResponseCount = 0;
  for (let index = 1; index < turns.length; index += 1) {
    const previous = turns[index - 1]!;
    const current = turns[index]!;
    if (previous.role !== "prospect" || current.role !== "agent") continue;
    const rawGap = current.startTime - previous.endTime;
    if (rawGap > MAX_RESPONSE_GAP_SECONDS) continue;
    if (rawGap < 0) overlapResponseCount += 1;
    responseGaps.push(Math.max(0, rawGap));
  }

  const agentWordCount = segments
    .filter((segment) => segment.role === "agent")
    .reduce((sum, segment) => sum + segment.wordCount, 0);
  const talkSpeed = agentTalkTime > 0
    ? agentWordCount / (agentTalkTime / 60)
    : null;

  const warnings: string[] = [];
  if (agentSpeakers.length === 0) {
    warnings.push("No agent-labeled speaker was found, so agent-specific metrics are unavailable.");
  }
  if (prospectSpeakers.length === 0) {
    warnings.push("No prospect-labeled speaker was found, so prospect-specific metrics are unavailable.");
  }
  if (recognizedRoleTalkTime < totalTalkTime) {
    warnings.push("Some speaker time could not be assigned to the agent or prospect role.");
  }
  if (segments.every(hasWholeSecondTimestamps)) {
    warnings.push("Transcript timestamps are rounded to whole seconds; response timing is approximate.");
  }

  return {
    talkRatioPercent: agentSpeakers.length > 0
      ? (agentTalkTime / totalTalkTime) * 100
      : null,
    repTalkTimeSeconds: agentSpeakers.length > 0 ? agentTalkTime : null,
    longestProspectTalkSeconds: prospectTurns.length > 0
      ? longestProspectTalk
      : null,
    longestTalkSeconds: longestTalk,
    patienceSeconds: responseGaps.length > 0
      ? average(responseGaps)
      : null,
    talkSpeedWordsPerMinute:
      talkSpeed !== null && Number.isFinite(talkSpeed) ? talkSpeed : null,
    speakerTalkTimes: measuredSpeakers.map((speaker) => ({
      ...speaker,
      sharePercent: (speaker.seconds / totalTalkTime) * 100,
    })),
    quality: {
      validSegmentCount: segments.length,
      droppedSegmentCount: Math.max(0, transcript.length - segments.length),
      roleCoveragePercent: (recognizedRoleTalkTime / totalTalkTime) * 100,
      responseSampleCount: responseGaps.length,
      overlapResponseCount,
      timestampResolution: segments.every(hasWholeSecondTimestamps)
        ? "whole-second"
        : "subsecond",
      warnings,
    },
  };
}

function normalizeSegment(
  segment: ConversationStatsTranscriptSegment,
): NormalizedTurn | null {
  const rawStartTime = Number(segment.startTime);
  const rawEndTime = Number(segment.endTime);
  if (!Number.isFinite(rawStartTime) || !Number.isFinite(rawEndTime)) {
    return null;
  }

  const startTime = Math.max(0, rawStartTime);
  const endTime = Math.max(0, rawEndTime);
  if (endTime <= startTime) return null;

  const speaker = segment.speaker?.trim() || "Unknown";
  return {
    role: speakerRole(speaker),
    speaker,
    startTime,
    endTime,
    wordCount: countWords(segment.text),
  };
}

function speakerRole(speaker: string): SpeakerRole {
  if (isAgentSpeakerLabel(speaker)) return "agent";
  if (isProspectSpeakerLabel(speaker)) return "prospect";
  return "other";
}

function mergeContiguousTurns(segments: NormalizedTurn[]): NormalizedTurn[] {
  const turns: NormalizedTurn[] = [];
  for (const segment of segments) {
    const previous = turns[turns.length - 1];
    if (
      previous
      && previous.role === segment.role
      && previous.speaker.toLowerCase() === segment.speaker.toLowerCase()
      && segment.startTime - previous.endTime <= CONTIGUOUS_TURN_GAP_SECONDS
    ) {
      previous.endTime = Math.max(previous.endTime, segment.endTime);
      previous.wordCount += segment.wordCount;
      continue;
    }
    turns.push({ ...segment });
  }
  return turns;
}

function mergedIntervalDuration(
  intervals: Array<{ startTime: number; endTime: number }>,
): number {
  const sorted = [...intervals].sort(
    (a, b) => a.startTime - b.startTime || a.endTime - b.endTime,
  );
  let total = 0;
  let currentStart = sorted[0]?.startTime ?? 0;
  let currentEnd = sorted[0]?.endTime ?? 0;

  for (let index = 1; index < sorted.length; index += 1) {
    const interval = sorted[index]!;
    if (interval.startTime <= currentEnd) {
      currentEnd = Math.max(currentEnd, interval.endTime);
      continue;
    }
    total += Math.max(0, currentEnd - currentStart);
    currentStart = interval.startTime;
    currentEnd = interval.endTime;
  }

  return total + Math.max(0, currentEnd - currentStart);
}

function maxTurnDuration(turns: NormalizedTurn[]): number | null {
  if (turns.length === 0) return null;
  return turns.reduce(
    (max, turn) => Math.max(max, turn.endTime - turn.startTime),
    0,
  );
}

function countWords(text: string): number {
  return text.match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu)?.length ?? 0;
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function hasWholeSecondTimestamps(segment: NormalizedTurn): boolean {
  return Number.isInteger(segment.startTime) && Number.isInteger(segment.endTime);
}
