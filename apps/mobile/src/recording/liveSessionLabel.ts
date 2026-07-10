import type { LiveRecordingMeta } from "./RecordingProvider";

const GENERIC_TITLES = new Set([
  "tour conversation",
  "live tour",
  "recording",
  "new session",
]);

function isGenericTitle(title: string | null | undefined) {
  const normalized = title?.trim().toLowerCase() ?? "";
  return !normalized || GENERIC_TITLES.has(normalized);
}

function normalizePeopleLabel(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s*[×x]\s*/g, " × ")
    .replace(/\s+/g, " ");
}

/** Primary label for live session chrome — prefer people names over generic titles. */
export function liveSessionHeadline(meta: LiveRecordingMeta): string {
  const prospect = meta.prospectName?.trim() || null;
  const agent = meta.agentName?.trim() || null;

  if (prospect && agent) return `${prospect} × ${agent}`;
  if (prospect) return prospect;
  if (!isGenericTitle(meta.title)) return meta.title.trim();
  if (agent) return agent;
  return meta.title?.trim() || "Live tour";
}

/** Secondary meta line under the headline. */
export function liveSessionSubline(meta: LiveRecordingMeta, elapsedLabel: string): string {
  const parts: string[] = [];
  const headline = liveSessionHeadline(meta);
  const title = meta.title?.trim() || null;

  if (
    title &&
    !isGenericTitle(title) &&
    normalizePeopleLabel(title) !== normalizePeopleLabel(headline)
  ) {
    parts.push(title);
  }
  if (meta.propertyName?.trim()) {
    parts.push(meta.propertyName.trim());
  }
  parts.push(elapsedLabel);
  return parts.join(" · ");
}
