import "server-only";

import {
  DEFAULT_SEGMENTATION_PROMPT,
  buildDiarizedRoleHint,
  hasDiarizedRoleLabels,
  normalizeParticipantName,
  normalizeConversationPhaseSpan,
  type ConversationPhaseSegmentation,
  type ConversationPhaseSegmentationResult,
  type ConversationPhaseSpan,
  type SegmentationParticipants,
} from "@tour/shared";

import { invokeClaudeTool, type ClaudeTool } from "./bedrock";
import type { TranscriptSegment } from "./transcribe";

export {
  buildPhaseTracks,
  findPhaseForTimestamp,
  formatSegmentTimeRange,
  shortPhaseLabel,
  tourSegmentColor,
} from "@tour/shared";
export type { PhaseTrackSegment } from "@tour/shared";

export async function segmentConversationPhases(
  transcript: TranscriptSegment[],
  options?: {
    segmentationPrompt?: string | null;
    sessionType?: string | null;
  }
): Promise<ConversationPhaseSegmentationResult> {
  if (transcript.length === 0) {
    return {
      segmentation: { spans: [], structureNotes: "No transcript available." },
      participants: { agentName: null, prospectName: null },
    };
  }

  const transcriptText = transcript
    .map((s) => `[${formatTime(s.startTime)}-${formatTime(s.endTime)}] ${s.speaker}: ${s.text}`)
    .join("\n");

  const systemPrompt = options?.segmentationPrompt?.trim() || DEFAULT_SEGMENTATION_PROMPT;
  const sessionTypeNote = options?.sessionType?.trim()
    ? `Session type: ${options.sessionType.trim()}\n\n`
    : "";

  const roleHint = hasDiarizedRoleLabels(transcript)
    ? `${buildDiarizedRoleHint()}\n\n`
    : "";

  const raw = await invokeClaudeTool<Record<string, unknown>>({
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: [
          sessionTypeNote + roleHint + "I would segment this tour into the following sections based on natural transitions and content.",
          "",
          "=== TRANSCRIPT ===",
          transcriptText
        ].join("\n")
      }
    ],
    tool: SEGMENTATION_TOOL,
    maxTokens: 8192,
    temperature: 0.2
  });

  return {
    segmentation: normalizeSegmentation(raw, transcript),
    participants: extractParticipants(raw),
  };
}

const SEGMENTATION_TOOL: ClaudeTool = {
  name: "submit_tour_segmentation",
  description: "Your segmentation of the tour into coach-facing sections with highlights, a key observation, and participant names when inferable.",
  input_schema: {
    type: "object",
    properties: {
      structureNotes: {
        type: "string",
        description: "Key observation: 2–4 sentences on the most problematic segments, missed opportunities, and how they connect (e.g. weak close followed by prospect still asking questions)"
      },
      agentName: {
        type: "string",
        description: "Leasing agent name if stated or clearly inferable from introductions; empty string if unknown"
      },
      prospectName: {
        type: "string",
        description: "Prospect or visitor name if stated or clearly inferable; empty string if unknown"
      },
      segments: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: {
              type: "string",
              description: "Specific section title without timestamps, e.g. \"Prospect Qualification Moment\", \"Weak Closing Attempt\", \"Fitness Center Tour\""
            },
            startTime: { type: "number", description: "Start time in seconds" },
            endTime: { type: "number", description: "End time in seconds" },
            location: { type: "string", description: "Physical area when relevant, e.g. Fitness Center, Clubhouse" },
            category: {
              type: "string",
              description: "Optional theme: greeting, logistics, qualification, amenity, tour, objection, closing, follow_up, digression, information"
            },
            highlights: {
              type: "array",
              items: { type: "string" },
              description: "2–4 concise bullets; include coaching callouts when relevant (missed opportunities, weak language, prospect-initiated topics that should have been proactive)"
            },
            confidence: { type: "number", description: "0-1 confidence" }
          },
          required: ["title", "startTime", "endTime", "highlights", "confidence"]
        }
      }
    },
    required: ["segments", "structureNotes"]
  }
};

function extractParticipants(raw: Record<string, unknown>): SegmentationParticipants {
  const agentName = normalizeParticipantName(raw.agentName);
  const prospectName = normalizeParticipantName(raw.prospectName);
  return { agentName, prospectName };
}

function normalizeSegmentation(
  raw: Record<string, unknown>,
  transcript: TranscriptSegment[]
): ConversationPhaseSegmentation {
  const maxTime = Math.max(...transcript.map((s) => s.endTime || s.startTime), 0);
  const segmentsRaw = Array.isArray(raw.segments)
    ? raw.segments
    : Array.isArray(raw.spans)
      ? raw.spans
      : [];

  const spans: ConversationPhaseSpan[] = segmentsRaw
    .map((item, index) => {
      const segment = item as Record<string, unknown>;
      const startTime = clampTime(segment.startTime, 0, maxTime);
      const endTime = clampTime(segment.endTime, startTime, maxTime);
      if (endTime <= startTime) return null;

      const highlights = Array.isArray(segment.highlights)
        ? segment.highlights.map((entry) => String(entry).trim()).filter(Boolean)
        : [];

      const title = String(segment.title ?? segment.label ?? "").trim();
      if (!title) return null;

      const summary = highlights[0] ?? title;

      return normalizeConversationPhaseSpan({
        id: `segment-${index + 1}`,
        title,
        label: title,
        startTime: Math.round(startTime),
        endTime: Math.round(endTime),
        confidence: clampConfidence(segment.confidence),
        summary,
        highlights,
        location: segment.location != null ? String(segment.location).trim() || null : null,
        category: segment.category != null ? String(segment.category).trim() || null : null,
      }, index);
    })
    .filter((span): span is ConversationPhaseSpan => span !== null)
    .sort((a, b) => a.startTime - b.startTime || a.endTime - b.endTime);

  if (spans.length === 0) {
    return {
      spans: fallbackSegmentation(maxTime),
      structureNotes: "Fallback single segment — model returned no spans."
    };
  }

  return {
    spans,
    structureNotes: typeof raw.structureNotes === "string" ? raw.structureNotes.trim() : undefined
  };
}

function fallbackSegmentation(maxTime: number): ConversationPhaseSpan[] {
  const duration = maxTime > 0 ? maxTime : 1;
  return [{
    id: "segment-1",
    title: "Full tour",
    label: "Full tour",
    startTime: 0,
    endTime: Math.round(duration),
    confidence: 0.3,
    summary: "Estimated tour boundary (fallback).",
    highlights: ["Full conversation span"],
  }];
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
