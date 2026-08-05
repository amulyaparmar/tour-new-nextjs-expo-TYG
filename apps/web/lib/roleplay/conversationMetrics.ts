// Transcript-derived coaching signals. These deliberately use only text, so
// they can be computed for both legacy history rows and newly completed calls.

import { trimSpokenDebrief } from "./transcriptBoundary";

const SINGLE_WORD_FILLERS = new Set(["um", "uh", "erm", "er", "hmm", "huh", "ah"]);
const QUESTION_OPENERS =
  /^(who|what|when|where|why|how|do|does|did|are|is|can|could|would|will|have|has|may|might|should)\b/i;

const wordsIn = (value: unknown): string[] =>
  String(value ?? "").match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) ?? [];

const countQuestions = (value: unknown): number => {
  const chunks = String(value ?? "").match(/[^.!?\n]+[.!?]?/g) ?? [];

  return chunks.reduce((count, chunk) => {
    const sentence = chunk.trim();
    if (!sentence) return count;
    return count + (sentence.endsWith("?") || QUESTION_OPENERS.test(sentence) ? 1 : 0);
  }, 0);
};

const countFillers = (value: unknown): number => {
  const text = String(value ?? "").toLowerCase();
  const singleWordCount = wordsIn(text).reduce(
    (count, word) => count + (SINGLE_WORD_FILLERS.has(word) ? 1 : 0),
    0
  );
  const phraseCount = (text.match(/\b(?:you know|i mean)\b/g) ?? []).length;

  return singleWordCount + phraseCount;
};

export type ConversationMetrics = {
  agentWordCount: number;
  prospectWordCount: number;
  agentTurnCount: number;
  agentWordShare: number;
  averageAgentResponseWords: number;
  questionCount: number;
  fillerCount: number;
  fillersPer100Words: number;
  longestAgentResponseWords: number;
};

export const computeConversationMetrics = (entries: any[] = []): ConversationMetrics => {
  const scopedEntries = trimSpokenDebrief(entries, { preserveBoundaryPrefix: true }).entries;
  const normalized = scopedEntries
    .map((entry) => ({
      type:
        entry?.role === "user" || entry?.role === "customer" || entry?.type === "user"
          ? "user"
          : "bot",
      message: String(entry?.text ?? entry?.message ?? "").trim(),
    }))
    .filter((entry) => entry.message);

  const agentTurns = normalized.filter((entry) => entry.type === "user");
  const prospectTurns = normalized.filter((entry) => entry.type !== "user");
  const agentTurnWordCounts = agentTurns.map((entry) => wordsIn(entry.message).length);
  const agentWordCount = agentTurnWordCounts.reduce((sum, count) => sum + count, 0);
  const prospectWordCount = prospectTurns.reduce(
    (sum, entry) => sum + wordsIn(entry.message).length,
    0
  );
  const totalWordCount = agentWordCount + prospectWordCount;
  const fillerCount = agentTurns.reduce((sum, entry) => sum + countFillers(entry.message), 0);

  return {
    agentWordCount,
    prospectWordCount,
    agentTurnCount: agentTurns.length,
    agentWordShare: totalWordCount ? Math.round((agentWordCount / totalWordCount) * 100) : 0,
    averageAgentResponseWords: agentTurns.length
      ? Math.round((agentWordCount / agentTurns.length) * 10) / 10
      : 0,
    questionCount: agentTurns.reduce((sum, entry) => sum + countQuestions(entry.message), 0),
    fillerCount,
    fillersPer100Words: agentWordCount
      ? Math.round((fillerCount / agentWordCount) * 1000) / 10
      : 0,
    longestAgentResponseWords: Math.max(0, ...agentTurnWordCounts),
  };
};
