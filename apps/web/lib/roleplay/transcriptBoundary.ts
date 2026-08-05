// A spoken-grading scenario keeps talking after the actual prospect/agent
// interaction ends. Everything from the debrief boundary onward is coaching,
// not roleplay evidence, and must be excluded from behavioral metrics.

export const SPOKEN_DEBRIEF_BOUNDARY_PHRASE =
  "Okay, stepping out of character now. Starting the coaching debrief.";

const DEBRIEF_PATTERNS = [
  /okay,?\s+stepping out of character\b/i,
  /starting (?:the )?(?:coaching )?debrief\b/i,
  /here(?:'s| is) (?:the|your) (?:grading |score )?breakdown\b/i,
  /(?:the )?roleplay (?:is |has )?(?:over|ended|complete)\b/i,
];

const isAgentEntry = (entry: any) =>
  entry?.role === "user" || entry?.role === "customer" || entry?.type === "user";

const entryText = (entry: any) => String(entry?.text ?? entry?.message ?? "");

const debriefIndexInText = (text: string): number => {
  const indexes = DEBRIEF_PATTERNS
    .map((pattern) => text.search(pattern))
    .filter((index) => index >= 0);
  return indexes.length ? Math.min(...indexes) : -1;
};

export const isSpokenDebriefStart = (entry: any): boolean => {
  if (!entry || isAgentEntry(entry)) return false;
  const text = entryText(entry);
  return debriefIndexInText(text) >= 0;
};

export const hasSpokenDebrief = (entries: any[] = []): boolean =>
  (Array.isArray(entries) ? entries : []).some(isSpokenDebriefStart);

export const trimSpokenDebrief = (
  entries: any[] = [],
  options: { preserveBoundaryPrefix?: boolean } = {}
) => {
  const list = Array.isArray(entries) ? entries : [];
  const boundaryIndex = list.findIndex(isSpokenDebriefStart);
  const scoped = boundaryIndex >= 0 ? list.slice(0, boundaryIndex) : list;

  if (boundaryIndex >= 0 && options.preserveBoundaryPrefix) {
    const boundaryEntry = list[boundaryIndex];
    const text = entryText(boundaryEntry);
    const markerIndex = debriefIndexInText(text);
    const prefix = markerIndex > 0 ? text.slice(0, markerIndex).trim() : "";
    if (prefix) {
      scoped.push({
        ...boundaryEntry,
        ...(boundaryEntry?.text !== undefined ? { text: prefix } : {}),
        ...(boundaryEntry?.message !== undefined ? { message: prefix } : {}),
      });
    }
  }

  return {
    entries: scoped,
    boundaryDetected: boundaryIndex >= 0,
    boundaryIndex,
  };
};
