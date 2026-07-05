import type { ConversationPhaseId } from "@tour/shared";
import {
  buildPhaseTracks,
  findPhaseForTimestamp,
  shortPhaseLabel,
  type ConversationPhaseSegmentation,
  type PhaseTrackSegment,
} from "@tour/shared";

export { buildPhaseTracks, findPhaseForTimestamp, shortPhaseLabel };
export type { ConversationPhaseSegmentation, PhaseTrackSegment };

export const PHASE_COLORS: Record<ConversationPhaseId, string> = {
  greeting: "#6366f1",
  discovery: "#0ea5e9",
  tour: "#10b981",
  objections: "#f59e0b",
  closing: "#ef4444",
  follow_up: "#8b5cf6",
};

export function processingStatusMessage(status: string): string {
  switch (status) {
    case "transcribing":
      return "Transcribing speech and detecting speakers…";
    case "segmenting":
      return "Detecting conversation phases in the tour…";
    case "analyzing":
      return "Scoring the tour against your rubric…";
    case "extracting_screenshots":
      return "Capturing key moments from the recording…";
    default:
      return "Transcribing, segmenting, scoring, and generating insights…";
  }
}
