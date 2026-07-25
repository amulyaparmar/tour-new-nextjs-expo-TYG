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
  sessionKind?: "tour" | "call" | "ai_call" | null;
  leads?: Array<{ name: string }> | null;
  scheduledAt?: string | null;
  createdAt?: string | null;
  location?: string | null;
  cardSummary?: string | null;
  needsImprovement?: string | null;
};

/** Display casing for a single name token: `amulya` → `Amulya`, `MARY-JANE` → `Mary-Jane`. */
function formatNamePart(value: string): string {
  const uncertaintyMarker = value.startsWith("~") ? "~" : "";
  const name = value.replace(/^~+/, "");
  const formatted = name
    .split(/([-'])/)
    .map((part) => {
      if (part === "-" || part === "'") return part;
      if (!part) return part;
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join("");
  return `${uncertaintyMarker}${formatted}`;
}

/** Title-case a person name for UI: `joseph smith` → `Joseph Smith`. */
export function formatPersonName(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return trimmed
    .split(/\s+/)
    .filter(Boolean)
    .map(formatNamePart)
    .join(" ");
}

function firstName(value: string | null | undefined): string | null {
  const token = value?.trim().split(/\s+/).filter(Boolean)[0];
  return token ? formatNamePart(token) : null;
}

function isParticipantOnlyTourTitle(
  title: string | null | undefined,
  agentName: string | null | undefined,
  prospectName: string | null | undefined,
): boolean {
  const normalized = title?.trim().toLowerCase() ?? "";
  if (!normalized) return false;
  const participantTitles = [firstName(agentName), firstName(prospectName)]
    .filter((name): name is string => Boolean(name))
    .map((name) => `${name} tour`.toLowerCase());
  return participantTitles.includes(normalized);
}

const RECORDING_UPLOAD_TITLE_RE =
  /^(?:Tour|Call) [A-Z][a-z]{2} \d{1,2}, \d{1,2}:\d{2} [AP]M(?:(?: · .+)|(?: \([^)]*\)))?$/;

/** Short title label derived from the rubric's session type. */
export function sessionTypeTitleLabel(sessionType?: string | null): "Tour" | "Call" {
  const normalized = sessionType?.trim().toLowerCase().replace(/[\s-]+/g, "_") ?? "";
  return normalized.includes("call") || normalized.includes("phone") || normalized.includes("shop")
    ? "Call"
    : "Tour";
}

/** Default title for an uploaded recording: `Tour Jul 22, 4:18 PM`. */
export function formatRecordingUploadTitle(date: Date, sessionType?: string | null): string {
  const day = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const time = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).replace(/\u202f/g, " ");
  return `${sessionTypeTitleLabel(sessionType)} ${day}, ${time}`;
}

export function isRecordingUploadTitle(title: string | null | undefined): boolean {
  return RECORDING_UPLOAD_TITLE_RE.test(title?.trim() ?? "");
}

/** Normalize a model-authored session topic to a title-safe one-to-four-word label. */
export function normalizeSessionTopicSummary(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value
    .replace(/×/g, "x")
    .replace(/[·|]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[,.:;!?()[\]{}"'`]+|[,.:;!?()[\]{}"'`]+$/g, "");
  if (
    !cleaned
    || /^(unknown|n\/a|na|null|none|not provided|tour|call|phone call|leasing tour|apartment tour|conversation|session)$/i.test(cleaned)
  ) {
    return null;
  }
  return cleaned.split(/\s+/).slice(0, 4).join(" ").slice(0, 60).trim() || null;
}

/**
 * Adds known participants and an optional topic to an inferred upload title.
 * Existing topics survive participant-only updates.
 * Custom titles are returned unchanged.
 */
export function withRecordingParticipants(
  title: string,
  agentName?: string | null,
  prospectName?: string | null,
  sessionType?: string | null,
  topicSummary?: string | null,
): string {
  const trimmed = title.trim();
  if (!isRecordingUploadTitle(trimmed)) return trimmed;

  const withoutLegacyParticipants = trimmed.replace(/ \([^)]*\)$/, "");
  const [withoutParticipants = "", ...existingSuffixes] = withoutLegacyParticipants.split(" · ");
  const existingTopic = existingSuffixes.length > 1
    ? normalizeSessionTopicSummary(existingSuffixes.at(-1))
    : existingSuffixes[0]?.includes(" × ")
      ? null
      : normalizeSessionTopicSummary(existingSuffixes[0]);
  const topic = topicSummary === undefined
    ? existingTopic
    : normalizeSessionTopicSummary(topicSummary);
  const titleType = sessionType
    ? sessionTypeTitleLabel(sessionType)
    : withoutParticipants.startsWith("Call ")
      ? "Call"
      : "Tour";
  const base = withoutParticipants.replace(/^(?:Tour|Call)\s+/, `${titleType} `);
  const agent = firstName(agentName);
  const prospect = firstName(prospectName);
  const participants = agent || prospect
    ? `${agent ?? "Agent"} × ${prospect ?? "Prospect"}`
    : null;

  return [base, participants, topic].filter(Boolean).join(" · ");
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
  if (/^\d{1,2}\s+[a-z]{3,9}\s+\d{1,2}:\d{2}\s+tour$/i.test(normalized)) return true;
  if (/^tour\s+[a-z]{3,9}\s+\d{1,2}\s+\d{1,2}:\d{2}(?:\s*[ap]m)?$/i.test(normalized)) return true;
  if (/^[0-9a-f]{8}(?:[\s-][0-9a-f]{4}){3}[\s-][0-9a-f]{12}$/i.test(normalized)) return true;
  return false;
}

/**
 * Default future session name: `Laura x Amulya Tour` (agent x prospect).
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
      ? `${agent} x ${prospect} Tour`
      : prospect
        ? `${prospect} Tour`
        : agent
          ? `${agent} Tour`
          : null;

  const existing = input.title?.trim() || null;
  if (
    peopleTitle &&
    (input.preferPeopleTitle || isGenericSessionTitle(existing) || isParticipantOnlyTourTitle(existing, input.agentName, input.prospectName))
  ) {
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
  if (!when) return null;
  const label = fields.sessionKind === "ai_call"
    ? "AI Call"
    : fields.sessionKind === "call"
      ? "Call"
      : "Tour";
  return `${when} ${label}`;
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
  const agent = fields.sessionKind === "ai_call"
    ? fields.agentName?.trim() || null
    : firstName(fields.agentName);
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
