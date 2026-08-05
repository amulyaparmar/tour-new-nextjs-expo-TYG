// @ts-nocheck — ported from usevoice.ai-TYG (looser tsconfig); index-access
// strictness (noUncheckedIndexedAccess) not yet retrofitted.
// Resolves grader evidence quotes to call-time timestamps.
//
// The post-call grader reads Vapi's {{transcript}}, which has NO timestamps —
// so the schema asks it for VERBATIM quotes instead, and this module locates
// each quote in the timestamped transcript we captured live. Resolution is
// deterministic and free (no LLM), runs once at save time, and degrades
// gracefully: an unmatched or missing quote simply renders without a
// timestamp chip.
//
// "Never guess" is a hard contract here because a resolved time is persisted
// on the write-once row and drives click-to-seek forever: matching is done on
// whole-token SEQUENCES (no substring hits like "rent" in "parents"), a quote
// found in more than one place is AMBIGUOUS and resolves to null, and the
// paraphrase fallback ignores stopwords and demands a clear unique winner.

import { FeedbackMoment } from "./types";

type TimedEntry = {
  message?: string;
  time?: number;
  timingSource?: string;
};

const STOPWORDS = new Set([
  "i", "you", "we", "they", "he", "she", "it", "im", "youre", "id", "ill",
  "a", "an", "the", "and", "or", "but", "so", "to", "of", "in", "on", "at",
  "for", "with", "that", "this", "these", "those", "there", "here",
  "is", "are", "was", "were", "be", "been", "am", "do", "does", "did",
  "dont", "not", "no", "yes", "yeah", "okay", "ok", "can", "could", "would",
  "should", "will", "just", "have", "has", "had", "my", "your", "our",
  "their", "me", "us", "them", "its", "if", "as", "about", "like",
  "how", "what", "when", "where", "why", "who",
]);

const normalize = (value: unknown) =>
  String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const tokenize = (value: unknown): string[] => {
  const normalized = normalize(value);
  return normalized ? normalized.split(" ") : [];
};

export const formatMomentTimestamp = (seconds: unknown): string | null => {
  // Strict: null/undefined/"" must NOT coerce to 0 — a spurious "0:00" chip
  // on every unresolved item is worse than no chip.
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds < 0) {
    return null;
  }
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
};

const timedEntries = (entries: TimedEntry[]) =>
  (Array.isArray(entries) ? entries : []).filter(
    (entry) => entry?.timingSource && Number.isFinite(Number(entry.time))
  );

// True when `haystack` contains `needle` as a CONSECUTIVE token run.
const containsTokenSequence = (haystack: string[], needle: string[]): boolean => {
  if (needle.length === 0 || needle.length > haystack.length) return false;
  outer: for (let start = 0; start <= haystack.length - needle.length; start++) {
    for (let offset = 0; offset < needle.length; offset++) {
      if (haystack[start + offset] !== needle[offset]) continue outer;
    }
    return true;
  }
  return false;
};

// Finds the transcript moment a quote belongs to, or null when not confident.
// Pass 1: the quote appears as a token sequence in exactly ONE line.
// Pass 2: (only if no single line contains it) it appears across exactly ONE
//         adjacent line pair — ASR endpointing splits turns mid-sentence.
// Pass 3: lightly-paraphrased quotes — >=70% of the quote's CONTENT tokens
//         (stopwords ignored) on a single line, with a clear unique winner.
// Multiple candidate moments = ambiguous = null, never first-match-wins.
export function findQuoteTime(quote: unknown, entries: TimedEntry[]): number | null {
  const quoteTokens = tokenize(quote);
  if (quoteTokens.length < 3) return null;
  const timed = timedEntries(entries);
  const lineTokens = timed.map((entry) => tokenize(entry.message));

  const exactMatches: number[] = [];
  for (let index = 0; index < timed.length; index++) {
    if (containsTokenSequence(lineTokens[index], quoteTokens)) exactMatches.push(index);
  }
  if (exactMatches.length === 1) return Number(timed[exactMatches[0]].time);
  if (exactMatches.length > 1) return null;

  const pairMatches: number[] = [];
  for (let index = 0; index < timed.length - 1; index++) {
    const joined = [...lineTokens[index], ...lineTokens[index + 1]];
    if (containsTokenSequence(joined, quoteTokens)) pairMatches.push(index);
  }
  if (pairMatches.length === 1) return Number(timed[pairMatches[0]].time);
  if (pairMatches.length > 1) return null;

  const contentTokens = quoteTokens.filter((token) => !STOPWORDS.has(token));
  if (contentTokens.length < 3) return null;
  let best: { time: number; ratio: number } | null = null;
  let secondRatio = 0;
  for (let index = 0; index < timed.length; index++) {
    const lineSet = new Set(lineTokens[index]);
    const ratio =
      contentTokens.filter((token) => lineSet.has(token)).length / contentTokens.length;
    if (!best || ratio > best.ratio) {
      secondRatio = best?.ratio ?? 0;
      best = { time: Number(timed[index].time), ratio };
    } else if (ratio > secondRatio) {
      secondRatio = ratio;
    }
  }
  if (!best || best.ratio < 0.7 || best.ratio - secondRatio < 0.15) return null;
  return best.time;
}

// Normalizes grader highlights/improvements (strings from legacy output,
// {text, evidenceQuote} from the current schema) and resolves each quote to a
// timestamp against the transcript.
export function resolveFeedbackMoments(
  raw: unknown,
  entries: TimedEntry[]
): FeedbackMoment[] {
  return (Array.isArray(raw) ? raw : [])
    .map((item): FeedbackMoment | null => {
      const text =
        typeof item === "string"
          ? item.trim()
          : typeof (item as any)?.text === "string"
            ? (item as any).text.trim()
            : "";
      if (!text) return null;
      const evidenceQuote =
        typeof (item as any)?.evidenceQuote === "string" && (item as any).evidenceQuote.trim()
          ? (item as any).evidenceQuote.trim()
          : undefined;
      const time = evidenceQuote ? findQuoteTime(evidenceQuote, entries) : null;
      return {
        text,
        ...(evidenceQuote ? { evidenceQuote } : {}),
        ...(time !== null ? { timeSeconds: time } : {}),
      };
    })
    .filter((item): item is FeedbackMoment => !!item);
}

// Attaches timeSeconds (in place) to checkpoint results whose evidenceQuote
// matches the transcript. Already-resolved entries are left untouched so
// stored rows never lose their saved times.
export function resolveCheckpointTimes<
  T extends { evidenceQuote?: string; timeSeconds?: number }
>(checkpoints: T[], entries: TimedEntry[]): T[] {
  for (const checkpoint of Array.isArray(checkpoints) ? checkpoints : []) {
    if (!checkpoint?.evidenceQuote) continue;
    if (Number.isFinite(Number(checkpoint.timeSeconds))) continue;
    const time = findQuoteTime(checkpoint.evidenceQuote, entries);
    if (time !== null) checkpoint.timeSeconds = time;
  }
  return checkpoints;
}

// Presentation helpers shared by feedback lists: plain string or moment object.
export const feedbackItemText = (item: unknown): string =>
  typeof item === "string" ? item : String((item as any)?.text ?? "");

export const feedbackItemTime = (item: unknown): number | null => {
  const value = (item as any)?.timeSeconds;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
};
