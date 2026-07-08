export type AudioInsightsStatus =
  | "pending"
  | "processing"
  | "ready"
  | "failed"
  | "unavailable";

export const AUDIO_INSIGHTS_STATUS_LABELS: Record<AudioInsightsStatus, string> = {
  pending: "Queued",
  processing: "Analyzing audio",
  ready: "Ready",
  failed: "Failed",
  unavailable: "Unavailable",
};

export function normalizeAudioInsightsStatus(value: unknown): AudioInsightsStatus {
  if (
    value === "pending"
    || value === "processing"
    || value === "ready"
    || value === "failed"
    || value === "unavailable"
  ) {
    return value;
  }
  return "pending";
}
