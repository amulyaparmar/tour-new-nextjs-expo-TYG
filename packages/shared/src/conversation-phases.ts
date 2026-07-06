/** Legacy static leasing-tour phase ids (older segmentations only). */
export type ConversationPhaseId =
  | "greeting"
  | "discovery"
  | "tour"
  | "objections"
  | "closing"
  | "follow_up";

export type ConversationPhaseDefinition = {
  id: ConversationPhaseId;
  label: string;
  description: string;
};

/** @deprecated Static taxonomy — kept for legacy data and mobile color fallbacks. */
export const LEASING_TOUR_PHASES: ConversationPhaseDefinition[] = [
  {
    id: "greeting",
    label: "Greeting & Rapport",
    description: "Welcome, introductions, setting tour expectations, initial rapport"
  },
  {
    id: "discovery",
    label: "Discovery & Needs",
    description: "Qualifying questions: move-in timeline, budget, household, preferences, how they heard about the property"
  },
  {
    id: "tour",
    label: "Property Tour",
    description: "Walking units/models, amenities, community features, demonstrations, personalization"
  },
  {
    id: "objections",
    label: "Objections & Concerns",
    description: "Price, availability, competition, pets, parking, or other hesitations — even if raised mid-tour"
  },
  {
    id: "closing",
    label: "Closing & Application",
    description: "Rates, specials, application steps, move-in dates, asking for commitment"
  },
  {
    id: "follow_up",
    label: "Follow-Up & Next Steps",
    description: "Contact exchange, scheduling return visits, sending materials, wrap-up"
  }
];

export type ConversationPhaseSpan = {
  id: string;
  /** Dynamic segment title, e.g. "Fitness Center Tour". */
  title: string;
  /** Short display label — usually derived from title. */
  label: string;
  startTime: number;
  endTime: number;
  /** 0–1 model confidence for this span */
  confidence: number;
  /** One-line summary of the segment. */
  summary: string;
  /** Bullet highlights for what happens in this segment. */
  highlights?: string[];
  /** Physical location or area when relevant, e.g. "Clubhouse", "Pool deck". */
  location?: string | null;
  /** Broad theme tag for coloring, e.g. "amenity", "qualification", "closing". */
  category?: string | null;
  /** @deprecated Legacy static phase id from older segmentations. */
  phaseId?: ConversationPhaseId;
};

export type ConversationPhaseSegmentation = {
  spans: ConversationPhaseSpan[];
  /** Brief note on non-linear structure or tour flow. */
  structureNotes?: string;
};

export const CONVERSATION_PHASE_LABELS: Record<ConversationPhaseId, string> = Object.fromEntries(
  LEASING_TOUR_PHASES.map((phase) => [phase.id, phase.label])
) as Record<ConversationPhaseId, string>;

/** Palette for dynamic tour segments (timeline + pills). */
export const TOUR_SEGMENT_COLORS = [
  "#6366f1",
  "#0ea5e9",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
  "#f97316",
  "#64748b",
  "#84cc16",
  "#06b6d4",
] as const;

export function tourSegmentColor(index: number): string {
  return TOUR_SEGMENT_COLORS[index % TOUR_SEGMENT_COLORS.length] ?? TOUR_SEGMENT_COLORS[0];
}

export function normalizeConversationPhaseSpan(raw: unknown, index: number): ConversationPhaseSpan | null {
  if (!raw || typeof raw !== "object") return null;
  const span = raw as Record<string, unknown>;

  const legacyPhaseId = typeof span.phaseId === "string" ? span.phaseId as ConversationPhaseId : undefined;
  const title = String(span.title ?? span.label ?? (legacyPhaseId ? CONVERSATION_PHASE_LABELS[legacyPhaseId] : "") ?? "").trim();
  if (!title) return null;

  const startTime = typeof span.startTime === "number" ? span.startTime : Number(span.startTime);
  const endTime = typeof span.endTime === "number" ? span.endTime : Number(span.endTime);
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime <= startTime) return null;

  const highlights = Array.isArray(span.highlights)
    ? span.highlights.map((item) => String(item).trim()).filter(Boolean)
    : undefined;

  const summary = String(span.summary ?? highlights?.[0] ?? title).trim();

  return {
    id: String(span.id ?? `segment-${index + 1}`),
    title,
    label: String(span.label ?? title).trim() || title,
    startTime,
    endTime,
    confidence: typeof span.confidence === "number" && Number.isFinite(span.confidence)
      ? Math.max(0, Math.min(1, span.confidence))
      : 0.7,
    summary,
    highlights: highlights?.length ? highlights : undefined,
    location: span.location != null ? String(span.location).trim() || null : null,
    category: span.category != null ? String(span.category).trim() || null : null,
    phaseId: legacyPhaseId,
  };
}

export function normalizeConversationPhaseSegmentation(raw: unknown): ConversationPhaseSegmentation | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.spans)) return null;

  const spans = obj.spans
    .map((item, index) => normalizeConversationPhaseSpan(item, index))
    .filter((span): span is ConversationPhaseSpan => span !== null)
    .sort((a, b) => a.startTime - b.startTime || a.endTime - b.endTime);

  if (spans.length === 0) return null;

  return {
    spans,
    structureNotes: typeof obj.structureNotes === "string" ? obj.structureNotes.trim() : undefined,
  };
}

export function findPhaseForTimestamp(
  timestamp: number,
  segmentation: ConversationPhaseSegmentation | null | undefined
): ConversationPhaseSpan | undefined {
  if (!segmentation?.spans.length) return undefined;

  const containing = segmentation.spans.filter(
    (span) => timestamp >= span.startTime && timestamp <= span.endTime
  );
  if (containing.length > 0) {
    return containing.sort((a, b) => b.confidence - a.confidence)[0];
  }

  let best: ConversationPhaseSpan | undefined;
  let bestDist = Infinity;
  for (const span of segmentation.spans) {
    const mid = (span.startTime + span.endTime) / 2;
    const dist = Math.abs(timestamp - mid);
    if (dist < bestDist) {
      bestDist = dist;
      best = span;
    }
  }
  return bestDist <= 30 ? best : undefined;
}

export type PhaseTrackSegment = {
  id: string;
  title: string;
  label: string;
  leftPct: number;
  widthPct: number;
  confidence: number;
  colorIndex: number;
  startTime: number;
  endTime: number;
  summary: string;
  highlights?: string[];
  location?: string | null;
  /** @deprecated Legacy static phase id. */
  phaseId?: ConversationPhaseId;
};

export function buildPhaseTracks(
  segmentation: ConversationPhaseSegmentation | null | undefined,
  duration: number
): PhaseTrackSegment[] {
  if (!segmentation?.spans.length || duration <= 0) return [];

  return segmentation.spans.map((span, index) => ({
    id: span.id,
    title: span.title,
    label: span.label,
    leftPct: Math.max(0, Math.min(100, (span.startTime / duration) * 100)),
    widthPct: Math.max(0.5, Math.min(100, ((span.endTime - span.startTime) / duration) * 100)),
    confidence: span.confidence,
    colorIndex: index,
    startTime: span.startTime,
    endTime: span.endTime,
    summary: span.summary,
    highlights: span.highlights,
    location: span.location,
    phaseId: span.phaseId,
  }));
}

export function shortPhaseLabel(label: string): string {
  const cleaned = label.trim();
  if (cleaned.length <= 28) return cleaned;
  return `${cleaned.slice(0, 25)}…`;
}

export function formatSegmentTimeRange(startTime: number, endTime: number): string {
  return `${formatClock(startTime)} - ${formatClock(endTime)}`;
}

function formatClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
