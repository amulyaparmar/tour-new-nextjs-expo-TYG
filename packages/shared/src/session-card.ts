import type { AnalysisResult } from "./session";

export const SESSION_CARD_SUMMARY_WORDS = 9;

const GENERIC_SESSION_TITLES = new Set([
  "tour conversation",
  "live tour",
  "recording",
  "new session",
  "tour",
  "session",
]);

export type SessionCardFields = {
  title?: string | null;
  agentName?: string | null;
  prospectName?: string | null;
  leads?: Array<{ name: string }> | null;
  scheduledAt?: string | null;
  createdAt?: string | null;
  location?: string | null;
  cardSummary?: string | null;
  needsImprovement?: string | null;
};

function firstName(value: string | null | undefined): string | null {
  const token = value?.trim().split(/\s+/).filter(Boolean)[0];
  return token || null;
}

function leadName(fields: SessionCardFields): string | null {
  return (
    fields.prospectName?.trim() ||
    fields.leads?.[0]?.name?.trim() ||
    null
  );
}

export function isGenericSessionTitle(title: string | null | undefined): boolean {
  const normalized = title?.trim().toLowerCase() ?? "";
  if (!normalized) return true;
  if (GENERIC_SESSION_TITLES.has(normalized)) return true;
  if (/^entrata\b/i.test(normalized)) return true;
  if (/^(in-person|virtual)\s+tour\b/i.test(normalized)) return true;
  return false;
}

/**
 * Default future session name: `Laura <> Amulya Tour`
 * Used when callers don't provide a custom title.
 */
export function buildSessionTourTitle(input: {
  agentName?: string | null;
  prospectName?: string | null;
  title?: string | null;
  /** Prefer people-based title even when title is present. */
  preferPeopleTitle?: boolean;
}): string {
  const agent = firstName(input.agentName);
  const prospect = firstName(input.prospectName);
  const peopleTitle =
    agent && prospect
      ? `${agent} <> ${prospect} Tour`
      : prospect
        ? `${prospect} Tour`
        : agent
          ? `${agent} Tour`
          : null;

  const existing = input.title?.trim() || null;
  if (peopleTitle && (input.preferPeopleTitle || isGenericSessionTitle(existing))) {
    return peopleTitle;
  }
  return existing || peopleTitle || "Tour conversation";
}

/** `Jun 23 Mon 5 PM` */
export function formatSessionCardWhen(
  scheduledAt?: string | null,
  fallbackAt?: string | null,
): string | null {
  const value = scheduledAt || fallbackAt;
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const month = date.toLocaleDateString("en-US", { month: "short" });
  const day = date.getDate();
  const weekday = date.toLocaleDateString("en-US", { weekday: "short" });
  const time = date
    .toLocaleTimeString("en-US", { hour: "numeric", hour12: true })
    .replace(/\u202f/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return `${month} ${day} ${weekday} ${time}`;
}

/** `Jun 23 Mon 5 PM Tour` */
export function formatSessionCardDateTime(fields: SessionCardFields): string | null {
  const when = formatSessionCardWhen(fields.scheduledAt, fields.createdAt);
  return when ? `${when} Tour` : null;
}

/** Keep existing title as the primary card heading. */
export function formatSessionCardTitle(fields: SessionCardFields): string {
  return buildSessionTourTitle({
    title: fields.title,
    agentName: fields.agentName,
    prospectName: leadName(fields),
  });
}

/**
 * Existing meta row: agent, lead, date/time tour label, location.
 * Example: `Laura · Amulya · Jun 23 Mon 5 PM Tour · Lobby`
 */
export function formatSessionCardMeta(
  fields: SessionCardFields,
  extras?: { propertyName?: string | null },
): string {
  const agent = firstName(fields.agentName);
  const lead = firstName(leadName(fields));
  const people =
    agent && lead ? `${agent} · ${lead}` : agent ?? lead ?? null;
  const parts = [
    people,
    formatSessionCardDateTime(fields),
    extras?.propertyName?.trim() || null,
    fields.location?.trim() || null,
  ].filter(Boolean);
  return parts.join(" · ") || "Session details pending";
}

export function clipToWordCount(
  text: string | null | undefined,
  maxWords = SESSION_CARD_SUMMARY_WORDS,
): string | null {
  if (!text?.trim()) return null;
  const words = text.trim().split(/\s+/);
  if (words.length <= maxWords) return words.join(" ");
  return words.slice(0, maxWords).join(" ");
}

/** Nine-word summary + primary improvement line. */
export function formatSessionCardDescription(fields: SessionCardFields): string | null {
  const summary = clipToWordCount(fields.cardSummary);
  const improvement = fields.needsImprovement?.trim() || null;
  if (summary && improvement) return `${summary} ${improvement}`;
  return summary ?? improvement;
}

export function cardFieldsFromAnalysis(result: AnalysisResult | null | undefined): {
  cardSummary: string | null;
  needsImprovement: string | null;
} {
  if (!result) {
    return { cardSummary: null, needsImprovement: null };
  }

  const cardSummary =
    clipToWordCount(result.cardSummary) ??
    clipToWordCount(result.summary);

  const needsImprovement =
    result.needsImprovement?.trim() ||
    result.opportunities?.find((item) => item.trim())?.trim() ||
    result.exactMoments?.find((item) => item.suggestedImprovement?.trim())
      ?.suggestedImprovement
      ?.trim() ||
    null;

  return { cardSummary, needsImprovement };
}

/** @deprecated Use formatSessionCardTitle */
export function formatSessionCardHeadline(fields: SessionCardFields): string {
  return formatSessionCardTitle(fields);
}

/** @deprecated Use cardFieldsFromAnalysis */
export function analysisPreviewFromResult(result: AnalysisResult | null | undefined) {
  const fields = cardFieldsFromAnalysis(result);
  return {
    analysisSummary: fields.cardSummary,
    needsImprovement: fields.needsImprovement,
  };
}
