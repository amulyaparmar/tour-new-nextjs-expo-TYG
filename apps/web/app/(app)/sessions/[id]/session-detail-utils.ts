import type { AnalysisResult, ConversationPhaseSegmentation } from "@tour/shared";
import type { SessionParticipants } from "@tour/shared";
import { formatSpeakerAnnotation } from "@tour/shared";
import { findPhaseForTimestamp, shortPhaseLabel } from "@tour/shared";

export type TranscriptSegment = {
  id: string;
  sessionId: string;
  speaker: string;
  startTime: number;
  endTime: number;
  text: string;
};

export type SessionMoment = {
  id: string;
  timestamp: number;
  label: string;
  type: "key_moment" | "moment";
  transcriptQuote?: string;
  explanation?: string;
  /** Conversation phase at this timestamp (semantic segmentation) */
  phase?: string;
  phaseSummary?: string;
  /** @deprecated Use phase — kept for legacy moments tied to rubric sections */
  section?: string;
  sectionScore?: number;
};

export type SessionComment = {
  id: string;
  sessionId: string;
  authorName: string;
  body: string;
  kind: SessionCommentKind;
  timestampSec: number | null;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SessionCommentKind = "comment" | "key_moment";

export function isDiscussionComment(comment: SessionComment) {
  return comment.kind !== "key_moment";
}

export function isKeyMomentComment(comment: SessionComment) {
  return comment.kind === "key_moment";
}

export const PLAYBACK_RATES = [0.75, 1, 1.25, 1.5, 2] as const;

export function formatTime(seconds: number) {
  const s = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export function parseTimestampToSeconds(ts: string): number {
  const parts = ts.split(":").map(Number);
  if (parts.length === 2 && parts.every((n) => !isNaN(n))) return parts[0]! * 60 + parts[1]!;
  if (parts.length === 3 && parts.every((n) => !isNaN(n))) return parts[0]! * 3600 + parts[1]! * 60 + parts[2]!;
  return -1;
}

export function scoreColor(score: number) {
  return score >= 75 ? "green" : score >= 50 ? "amber" : "red";
}

export function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function buildSessionMoments(
  analysis: AnalysisResult,
  transcript: TranscriptSegment[],
  phases?: ConversationPhaseSegmentation | null
): SessionMoment[] {
  const moments: SessionMoment[] = [];

  for (const moment of analysis.exactMoments) {
    const sec = parseTimestampToSeconds(moment.timestamp);
    if (sec < 0) continue;
    if (moments.some((item) => Math.abs(item.timestamp - sec) < 5)) continue;
    const phase = findPhaseForTimestamp(sec, phases);
    moments.push({
      id: `em-${moment.timestamp}`,
      timestamp: sec,
      label: moment.explanation || moment.timestamp,
      type: "moment",
      explanation: moment.explanation,
      transcriptQuote: moment.transcriptQuote || findNearestTranscript(sec, transcript),
      phase: phase ? shortPhaseLabel(phase.label) : undefined,
      phaseSummary: phase?.summary,
    });
  }

  return moments.sort((a, b) => a.timestamp - b.timestamp);
}

export function mergeKeyMomentComments(
  moments: SessionMoment[],
  comments: SessionComment[],
  _analysis: AnalysisResult,
  transcript: TranscriptSegment[],
  _duration: number,
  phases?: ConversationPhaseSegmentation | null
): SessionMoment[] {
  const merged = [...moments];

  for (const item of comments) {
    if (!isKeyMomentComment(item) || item.timestampSec == null) continue;
    const timestamp = item.timestampSec;
    const phase = findPhaseForTimestamp(timestamp, phases);
    merged.push({
      id: `ukm-${item.id}`,
      timestamp,
      label: item.body,
      type: "key_moment",
      transcriptQuote: findNearestTranscript(timestamp, transcript),
      phase: phase ? shortPhaseLabel(phase.label) : undefined,
      phaseSummary: phase?.summary,
    });
  }

  return merged.sort((a, b) => a.timestamp - b.timestamp);
}

export function findNearestSegment(timestamp: number, transcript: TranscriptSegment[]) {
  if (transcript.length === 0) return undefined;
  let best: TranscriptSegment | undefined;
  let bestDist = Infinity;
  for (const seg of transcript) {
    const dist = Math.abs(seg.startTime - timestamp);
    if (dist < bestDist) {
      bestDist = dist;
      best = seg;
    }
  }
  return best;
}

function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3);
}

export function fastScrollTo(container: HTMLElement, targetTop: number, duration = 160) {
  const start = container.scrollTop;
  const delta = targetTop - start;
  if (Math.abs(delta) < 2) return;

  const startTime = performance.now();
  const step = (now: number) => {
    const progress = Math.min(1, (now - startTime) / duration);
    container.scrollTop = start + delta * easeOutCubic(progress);
    if (progress < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

export function scrollTranscriptRowIntoView(
  container: HTMLElement,
  row: HTMLElement,
  options?: { anchorRatio?: number; fromChat?: boolean }
) {
  const anchorRatio = options?.anchorRatio ?? 0.5;
  const offset =
    row.offsetTop - container.offsetTop - container.clientHeight * anchorRatio + row.clientHeight / 2;
  const targetTop = Math.max(0, offset);
  const distance = Math.abs(targetTop - container.scrollTop);
  const snapThreshold = container.clientHeight * 0.25;

  if (options?.fromChat && distance > snapThreshold) {
    container.scrollTop = targetTop;
    return;
  }

  if (options?.fromChat) {
    fastScrollTo(container, targetTop);
    return;
  }

  container.scrollTo({ top: targetTop, behavior: "smooth" });
}

export function speakerStats(transcript: TranscriptSegment[]) {
  const normalized = normalizeTranscriptSegments(transcript);
  const totals = new Map<string, number>();
  for (const seg of normalized) {
    const speaker = seg.speaker || "Speaker";
    totals.set(speaker, (totals.get(speaker) ?? 0) + seg.duration);
  }
  const sum = Array.from(totals.values()).reduce((acc, value) => acc + value, 0) || 1;
  return Array.from(totals.entries())
    .map(([speaker, seconds]) => ({
      speaker,
      seconds,
      pct: Math.round((seconds / sum) * 100),
    }))
    .sort((a, b) => b.seconds - a.seconds);
}

export type SpeakerTrackSegment = {
  id: string;
  leftPct: number;
  widthPct: number;
};

export type SpeakerTrack = {
  speaker: string;
  colorIndex: number;
  pct: number;
  segments: SpeakerTrackSegment[];
};

export function normalizeTranscriptSegments(
  transcript: TranscriptSegment[],
  duration?: number
): Array<TranscriptSegment & { duration: number }> {
  if (transcript.length === 0) return [];

  const sorted = [...transcript].sort((a, b) => a.startTime - b.startTime);
  return sorted.map((seg, index) => {
    const next = sorted[index + 1];
    let end = seg.endTime;
    if (!Number.isFinite(end) || end <= seg.startTime) {
      end = next ? next.startTime : (duration && duration > seg.startTime ? duration : seg.startTime + 2);
    }
    if (duration && duration > 0) {
      end = Math.min(end, duration);
    }
    const span = Math.max(0.25, end - seg.startTime);
    return { ...seg, endTime: seg.startTime + span, duration: span };
  });
}

export function buildSpeakerTracks(
  transcript: TranscriptSegment[],
  duration: number,
  participants?: SessionParticipants
): SpeakerTrack[] {
  if (transcript.length === 0 || duration <= 0) return [];

  const normalized = normalizeTranscriptSegments(transcript, duration);
  const stats = speakerStats(transcript);
  const speakers = stats.map((item) => item.speaker);

  return speakers.slice(0, 2).map((rawSpeaker, colorIndex) => {
    const segments = normalized
      .filter((seg) => (seg.speaker || "Speaker") === rawSpeaker)
      .map((seg) => ({
        id: seg.id,
        leftPct: Math.max(0, Math.min(100, (seg.startTime / duration) * 100)),
        widthPct: Math.max(0.4, Math.min(100, (seg.duration / duration) * 100)),
      }));

    return {
      speaker: participants
        ? formatSpeakerAnnotation(rawSpeaker, participants)
        : rawSpeaker,
      colorIndex,
      pct: stats.find((item) => item.speaker === rawSpeaker)?.pct ?? 0,
      segments,
    };
  });
}

export type UnifiedSpeakerSegment = SpeakerTrackSegment & {
  speaker: string;
  colorIndex: number;
};

/** Flatten agent + prospect segments onto one timeline lane. */
export function buildUnifiedSpeakerSegments(
  transcript: TranscriptSegment[],
  duration: number,
  participants?: SessionParticipants
): { segments: UnifiedSpeakerSegment[]; speakers: SpeakerTrack[] } {
  const speakers = buildSpeakerTracks(transcript, duration, participants);
  const segments: UnifiedSpeakerSegment[] = [];

  for (const track of speakers) {
    for (const segment of track.segments) {
      segments.push({
        ...segment,
        speaker: track.speaker,
        colorIndex: track.colorIndex,
      });
    }
  }

  segments.sort((a, b) => a.leftPct - b.leftPct || a.widthPct - b.widthPct);
  return { segments, speakers };
}

function findNearestTranscript(timestamp: number, transcript: TranscriptSegment[]) {
  let best: TranscriptSegment | undefined;
  let bestDist = Infinity;
  for (const seg of transcript) {
    const dist = Math.abs(seg.startTime - timestamp);
    if (dist < bestDist) {
      bestDist = dist;
      best = seg;
    }
  }
  return bestDist < 15 ? best?.text : undefined;
}

export function initialsFor(name: string) {
  const displayName = name.split("·")[0]?.trim() || name.trim();
  const parts = displayName.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[parts.length - 1]![0] ?? ""}`.toUpperCase();
}

export const SPEAKER_PALETTE = [
  { color: "#0d9488", soft: "#ccfbf1" },
  { color: "#ea580c", soft: "#ffedd5" },
  { color: "#6366f1", soft: "#eef2ff" },
  { color: "#be123c", soft: "#ffe4e6" },
];
