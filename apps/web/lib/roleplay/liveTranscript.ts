// Helpers for keeping the live roleplay transcript tied to audible speech.
// Vapi can deliver duplicate or cumulative live caption messages.

export const cleanLiveTranscriptText = (value: unknown): string =>
  String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();

export const normalizeLiveTranscriptText = (value: unknown): string =>
  cleanLiveTranscriptText(value)
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}'\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();

export const mergeAssistantCaptionText = (
  previousText: unknown,
  nextText: unknown
): string => {
  const previous = cleanLiveTranscriptText(previousText);
  const next = cleanLiveTranscriptText(nextText);
  if (!previous) return next;
  if (!next) return previous;

  const previousNormalized = normalizeLiveTranscriptText(previous);
  const nextNormalized = normalizeLiveTranscriptText(next);
  const startsWithPhrase = (whole: string, phrase: string) =>
    whole === phrase || whole.startsWith(`${phrase} `);
  const containsPhrase = (whole: string, phrase: string) =>
    whole === phrase || ` ${whole} `.includes(` ${phrase} `);
  if (previousNormalized === nextNormalized) return previous;

  // A later snapshot of the same utterance can extend the earlier one
  // MID-WORD ("...finding a place that'" -> "...that'll take him"), which the
  // word-boundary checks below miss — they then treat the pair as distinct
  // segments and concatenate, echoing the whole sentence. A whole-string
  // prefix means revision, not a new segment: keep the more complete text.
  if (nextNormalized.startsWith(previousNormalized)) return next;
  if (previousNormalized.startsWith(nextNormalized)) return previous;

  if (startsWithPhrase(nextNormalized, previousNormalized)) return next;
  if (startsWithPhrase(previousNormalized, nextNormalized)) return previous;

  // Acoustic transcript providers can commit a complete phrase after already
  // streaming its tail (or vice versa). Keep the containing version instead
  // of repeating the shared words.
  if (containsPhrase(nextNormalized, previousNormalized)) return next;
  if (containsPhrase(previousNormalized, nextNormalized)) return previous;

  // Separate committed audio segments can overlap by a few words. Join them at
  // the largest normalized word boundary so the caption remains verbatim but
  // does not echo the overlap.
  const previousWords = previous.split(/\s+/);
  const nextWords = next.split(/\s+/);
  const maximumOverlap = Math.min(previousWords.length, nextWords.length, 24);
  for (let size = maximumOverlap; size > 0; size -= 1) {
    const previousSuffix = normalizeLiveTranscriptText(
      previousWords.slice(-size).join(" ")
    );
    const nextPrefix = normalizeLiveTranscriptText(
      nextWords.slice(0, size).join(" ")
    );
    if (previousSuffix && previousSuffix === nextPrefix) {
      const remainder = nextWords.slice(size).join(" ");
      return remainder ? `${previous} ${remainder}` : previous;
    }
  }

  // Distinct committed audio segments belong next to one another.
  return `${previous} ${next}`;
};
