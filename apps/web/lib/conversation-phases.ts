import "server-only";

import {
  CONVERSATION_PHASE_LABELS,
  LEASING_TOUR_PHASES,
  type ConversationPhaseId,
  type ConversationPhaseSegmentation,
  type ConversationPhaseSpan
} from "@tour/shared";

import { invokeClaudeTool, type ClaudeTool } from "./bedrock";
import type { TranscriptSegment } from "./transcribe";

export { buildPhaseTracks, findPhaseForTimestamp, shortPhaseLabel } from "@tour/shared";
export type { PhaseTrackSegment } from "@tour/shared";

const PHASE_IDS = LEASING_TOUR_PHASES.map((p) => p.id);

export async function segmentConversationPhases(
  transcript: TranscriptSegment[]
): Promise<ConversationPhaseSegmentation> {
  if (transcript.length === 0) {
    return { spans: [], structureNotes: "No transcript available." };
  }

  const transcriptText = transcript
    .map((s) => `[${formatTime(s.startTime)}-${formatTime(s.endTime)}] ${s.speaker}: ${s.text}`)
    .join("\n");

  const phaseGuide = LEASING_TOUR_PHASES.map(
    (p) => `- ${p.id}: ${p.label} — ${p.description}`
  ).join("\n");

  const systemPrompt = [
    "You are an expert at analyzing apartment leasing tour recordings.",
    "Identify conversation phases using the standard phase taxonomy below.",
    "",
    "Important:",
    "- Real tours are NOT always linear. Prospects may ask discovery questions during the tour,",
    "  raise objections multiple times, or revisit amenities. Emit multiple spans per phase when needed.",
    "- Spans may overlap slightly when topics blend (e.g. objection during tour).",
    "- Use transcript timestamps (seconds) for startTime and endTime.",
    "- Cover the full conversation from first to last segment; gaps should be minimal.",
    "- Prefer more granular spans over one long span when the phase clearly shifts.",
    "",
    "Standard phases:",
    phaseGuide
  ].join("\n");

  const raw = await invokeClaudeTool<Record<string, unknown>>({
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: `Segment this tour transcript into conversation phases.\n\n=== TRANSCRIPT ===\n${transcriptText}`
      }
    ],
    tool: SEGMENTATION_TOOL,
    maxTokens: 4096,
    temperature: 0.2
  });

  return normalizeSegmentation(raw, transcript);
}

const SEGMENTATION_TOOL: ClaudeTool = {
  name: "submit_phase_segmentation",
  description: "Submit detected conversation phase spans for the leasing tour.",
  input_schema: {
    type: "object",
    properties: {
      structureNotes: {
        type: "string",
        description: "Brief note on non-linear flow, e.g. 'Discovery resumed at 12:40 during amenity walk'"
      },
      spans: {
        type: "array",
        items: {
          type: "object",
          properties: {
            phaseId: { type: "string", enum: PHASE_IDS },
            startTime: { type: "number", description: "Start time in seconds" },
            endTime: { type: "number", description: "End time in seconds" },
            confidence: { type: "number", description: "0-1 confidence" },
            summary: { type: "string", description: "One sentence describing what happens in this span" }
          },
          required: ["phaseId", "startTime", "endTime", "confidence", "summary"]
        }
      }
    },
    required: ["spans"]
  }
};

function normalizeSegmentation(
  raw: Record<string, unknown>,
  transcript: TranscriptSegment[]
): ConversationPhaseSegmentation {
  const maxTime = Math.max(...transcript.map((s) => s.endTime || s.startTime), 0);
  const spansRaw = Array.isArray(raw.spans) ? raw.spans : [];

  const spans: ConversationPhaseSpan[] = spansRaw
    .map((item, index) => {
      const span = item as Record<string, unknown>;
      const phaseId = String(span.phaseId ?? "") as ConversationPhaseId;
      if (!PHASE_IDS.includes(phaseId)) return null;

      const startTime = clampTime(span.startTime, 0, maxTime);
      const endTime = clampTime(span.endTime, startTime, maxTime);
      if (endTime <= startTime) return null;

      return {
        id: `phase-${index + 1}`,
        phaseId,
        label: CONVERSATION_PHASE_LABELS[phaseId],
        startTime: Math.round(startTime),
        endTime: Math.round(endTime),
        confidence: clampConfidence(span.confidence),
        summary: String(span.summary ?? "").trim()
      };
    })
    .filter((span): span is ConversationPhaseSpan => span !== null)
    .sort((a, b) => a.startTime - b.startTime || a.endTime - b.endTime);

  if (spans.length === 0) {
    return {
      spans: fallbackSegmentation(transcript, maxTime),
      structureNotes: "Fallback equal segmentation — model returned no spans."
    };
  }

  return {
    spans,
    structureNotes: typeof raw.structureNotes === "string" ? raw.structureNotes.trim() : undefined
  };
}

/** Last-resort when the model returns nothing usable. */
function fallbackSegmentation(transcript: TranscriptSegment[], maxTime: number): ConversationPhaseSpan[] {
  const duration = maxTime > 0 ? maxTime : 1;
  const phaseOrder: ConversationPhaseId[] = ["greeting", "discovery", "tour", "closing", "follow_up"];
  const slice = duration / phaseOrder.length;

  return phaseOrder.map((phaseId, index) => ({
    id: `fallback-${index + 1}`,
    phaseId,
    label: CONVERSATION_PHASE_LABELS[phaseId],
    startTime: Math.round(index * slice),
    endTime: Math.round(index === phaseOrder.length - 1 ? duration : (index + 1) * slice),
    confidence: 0.3,
    summary: "Estimated phase boundary (fallback)."
  }));
}

function clampTime(value: unknown, min: number, max: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function clampConfidence(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 0.5;
  return Math.max(0, Math.min(1, n));
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
