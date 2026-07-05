/** Standard leasing tour conversation phases (independent of scoring rubrics). */
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
  phaseId: ConversationPhaseId;
  label: string;
  startTime: number;
  endTime: number;
  /** 0–1 model confidence for this span */
  confidence: number;
  summary: string;
};

export type ConversationPhaseSegmentation = {
  spans: ConversationPhaseSpan[];
  /** Brief note on non-linear structure, e.g. discovery resumed during tour */
  structureNotes?: string;
};

export const CONVERSATION_PHASE_LABELS: Record<ConversationPhaseId, string> = Object.fromEntries(
  LEASING_TOUR_PHASES.map((phase) => [phase.id, phase.label])
) as Record<ConversationPhaseId, string>;

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
  phaseId: ConversationPhaseId;
  label: string;
  leftPct: number;
  widthPct: number;
  confidence: number;
};

export function buildPhaseTracks(
  segmentation: ConversationPhaseSegmentation | null | undefined,
  duration: number
): PhaseTrackSegment[] {
  if (!segmentation?.spans.length || duration <= 0) return [];

  return segmentation.spans.map((span) => ({
    id: span.id,
    phaseId: span.phaseId,
    label: span.label,
    leftPct: Math.max(0, Math.min(100, (span.startTime / duration) * 100)),
    widthPct: Math.max(0.5, Math.min(100, ((span.endTime - span.startTime) / duration) * 100)),
    confidence: span.confidence
  }));
}

export function shortPhaseLabel(label: string): string {
  return label
    .replace(" & ", " ")
    .replace("Property Tour", "Tour")
    .replace("Greeting & Rapport", "Greeting")
    .replace("Discovery & Needs", "Discovery")
    .replace("Objections & Concerns", "Objections")
    .replace("Closing & Application", "Closing")
    .replace("Follow-Up & Next Steps", "Follow-up");
}
