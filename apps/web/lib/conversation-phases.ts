import "server-only";

import {
  normalizeConversationPhaseSpan,
  type ConversationPhaseSegmentation,
  type ConversationPhaseSpan
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
  transcript: TranscriptSegment[]
): Promise<ConversationPhaseSegmentation> {
  if (transcript.length === 0) {
    return { spans: [], structureNotes: "No transcript available." };
  }

  const transcriptText = transcript
    .map((s) => `[${formatTime(s.startTime)}-${formatTime(s.endTime)}] ${s.speaker}: ${s.text}`)
    .join("\n");

  const systemPrompt = [
    "You are an expert leasing coach reviewing apartment tour recordings.",
    "",
    "If you were to segment this tour into sections, how would you segment it?",
    "Base sections on natural transitions in the conversation — location changes, topic shifts, qualification moments, digressions, closing attempts — not a generic phase checklist.",
    "",
    "Calibrate to this style (structure and tone, not content to copy):",
    "",
    "1. Initial Greeting & Setup (00:05 - 00:30)",
    "   - Introduction and rapport building",
    "   - Decision to defer guest card until after tour",
    "   - Transition to beginning the tour",
    "",
    "3. Prospect Qualification Moment (01:34 - 01:50)",
    "   - Brief discussion of gap semester and double major plans",
    "   - Mention of sister property (The Yard)",
    "   - Critical missed opportunity to explore needs",
    "",
    "10. Weak Closing Attempt (07:14 - 07:46)",
    '   - "Anything else I can help you with today?" — exit line',
    "   - Brief discussion about non-student residents",
    "   - Initial goodbye",
    "",
    "11. Last-Minute Special Discussion (07:46 - 08:33)",
    "   - Prospect asks about specials (should have been proactive)",
    "   - $500 gift card explanation",
    "   - Move-in timing clarification",
    "",
    "Key observation: The most problematic segment is #10 (Weak Closing) where the agent invites the prospect to leave without sitting down to review options. Segment #11 shows the prospect was still engaged, proving the agent closed too early. Earlier qualification and presentation gaps weakened the close.",
    "",
    "How to segment:",
    "- Use specific, coach-facing titles (e.g. \"Fitness Center Tour\", \"Prospect Qualification Moment\", \"Weak Closing Attempt\") — not generic labels like \"Tour\" or \"Discovery\"",
    "- Split distinct chapters even when short: qualification beats, weak closes, prospect-initiated specials, digressions",
    "- Group by location when touring amenities; group by topic when the conversation shifts without moving",
    "- 2–4 concise bullet highlights per section; call out missed opportunities and coaching moments directly in bullets",
    "- Include location when tied to a physical area",
    "- Use startTime/endTime in seconds from the transcript (do not put timestamps in the title)",
    "- Cover the full tour chronologically with minimal gaps",
    "",
    "In structureNotes, write a brief \"Key observation:\" summarizing the most problematic segments and how they connect (e.g. early missed qualification → weak close → prospect still asking questions)."
  ].join("\n");

  const raw = await invokeClaudeTool<Record<string, unknown>>({
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: [
          "I would segment this tour into the following sections based on natural transitions and content.",
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

  return normalizeSegmentation(raw, transcript);
}

const SEGMENTATION_TOOL: ClaudeTool = {
  name: "submit_tour_segmentation",
  description: "Your segmentation of the tour into coach-facing sections with highlights and a key observation.",
  input_schema: {
    type: "object",
    properties: {
      structureNotes: {
        type: "string",
        description: "Key observation: 2–4 sentences on the most problematic segments, missed opportunities, and how they connect (e.g. weak close followed by prospect still asking questions)"
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
