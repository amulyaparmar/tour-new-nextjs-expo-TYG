import type { AudioInsightsStatus } from "./audio-insights-status";
import type { SessionParticipants } from "./speaker-labels";

export type SessionStatus =
  | "scheduled"
  | "in_progress"
  | "uploaded"
  | "transcribing"
  | "segmenting"
  | "analyzing"
  | "analysis_ready"
  | "reviewed"
  | "failed";

export type SessionSource = "manual" | "qr" | "entrata";
export type SessionKind = "tour" | "call" | "ai_call";

export const SESSION_KIND_LABELS: Record<SessionKind, string> = {
  tour: "Tour",
  call: "Call",
  ai_call: "AI call",
};

export function normalizeSessionKind(value: string | null | undefined): SessionKind {
  if (value === "call" || value === "ai_call") return value;
  return "tour";
}

export type SessionLead = {
  name: string;
  email: string | null;
  phone: string | null;
  wantsSummary: boolean;
  createdAt: string;
  // Richer fields captured by the /p/[slug] check-in card. All optional so
  // existing leads (which only carry name/email/phone) remain valid.
  firstName?: string | null;
  lastName?: string | null;
  jobTitle?: string | null;
  /** Free-text reason for the visit, e.g. "Tour TYG Apartments". */
  reason?: string | null;
  /** Answers to the per-property qualifying questions, keyed by question id. */
  questionAnswers?: Record<string, string>;
  /** Slug of the rep whose card captured this lead. */
  repSlug?: string | null;
  /** Leasing-team notes about this specific checked-in person. */
  notes?: string | null;
};

export type SessionAttachment = {
  id: string;
  name: string;
  type: "video" | "image" | "document" | "link" | "other";
  url: string | null;
  materialId?: string | null;
  description?: string | null;
  mimeType?: string | null;
  createdAt: string;
  addedBy?: string | null;
};

export type SessionSummary = {
  id: string;
  title: string;
  prospectName: string | null;
  agentName: string | null;
  scheduledAt: string | null;
  location: string | null;
  status: SessionStatus;
  source: SessionSource;
  sessionKind: SessionKind;
  leads: SessionLead[];
  attachments: SessionAttachment[];
  customerInterests?: SessionCustomerInterest[];
  rubricId: string | null;
  agentId?: string | null;
  propertyId?: string | null;
  unitLabel?: string | null;
  overallScore: number | null;
  duration: number | null;
  createdAt: string;
  audioInsightsStatus: AudioInsightsStatus;
  analysisWorkflowRunId?: string | null;
  analysisWorkflowStartedAt?: string | null;
  analysisWorkflowCompletedAt?: string | null;
  analysisWorkflowError?: string | null;
  analysisWorkflowAttempts?: number;
  audioInsightsWorkflowRunId?: string | null;
  audioInsightsStartedAt?: string | null;
  audioInsightsCompletedAt?: string | null;
  audioInsightsError?: string | null;
  audioInsightsAttempts?: number;
  /** Pipeline-authored ~9-word card blurb. */
  cardSummary?: string | null;
  /** Pipeline-authored improvement line for cards. */
  needsImprovement?: string | null;
};

export type SessionDetail = SessionSummary & {
  notes: string | null;
  videoUrl: string | null;
  audioUrl: string | null;
};

export type CreateSessionInput = {
  /** Optional preallocated UUID, used by URL-bound check-in initiations. */
  id?: string;
  title?: string | null;
  sourceFileName?: string | null;
  status?: SessionStatus;
  scheduledAt?: string | null;
  location?: string | null;
  prospectName?: string | null;
  agentName?: string | null;
  notes?: string | null;
  source?: SessionSource;
  sessionKind?: SessionKind;
  leads?: SessionLead[];
  attachments?: SessionAttachment[];
  customerInterests?: SessionCustomerInterest[];
  rubricId?: string | null;
  agentId?: string | null;
  propertyId?: string | null;
  unitLabel?: string | null;
};

export type QuestionScore = {
  id: string;
  question: string;
  maxPoints: number;
  earnedPoints: number;
  passed: boolean;
  evidence: string;
};

export const PROSPECT_INTEREST_CATEGORIES = [
  "budget_specials",
  "floor_plan",
  "move_in_timing",
  "amenities",
  "pets",
  "parking_transportation",
  "location_commute",
  "lease_terms",
  "accessibility",
  "community_security",
  "other",
] as const;

export type ProspectInterestCategory = (typeof PROSPECT_INTEREST_CATEGORIES)[number];
export type ProspectInterestCoverage =
  | "addressed"
  | "partially_addressed"
  | "missed"
  | "not_discussed";

export const PROSPECT_INTEREST_CATEGORY_LABELS: Record<ProspectInterestCategory, string> = {
  budget_specials: "Budget & specials",
  floor_plan: "Floor plan",
  move_in_timing: "Move-in timing",
  amenities: "Amenities",
  pets: "Pets",
  parking_transportation: "Parking & transportation",
  location_commute: "Location & commute",
  lease_terms: "Lease terms",
  accessibility: "Accessibility",
  community_security: "Community & security",
  other: "Other",
};

export type SessionCustomerInterest = {
  id: string;
  category: ProspectInterestCategory;
  detail: string;
};

export function normalizeSessionCustomerInterests(value: unknown): SessionCustomerInterest[] {
  if (!Array.isArray(value)) return [];
  const validCategories = new Set<string>(PROSPECT_INTEREST_CATEGORIES);
  const usedIds = new Set<string>();

  return value
    .slice(0, 8)
    .map((candidate, index) => {
      if (!candidate || typeof candidate !== "object") return null;
      const item = candidate as Record<string, unknown>;
      const detail = String(item.detail ?? item.interest ?? "").trim().slice(0, 500);
      if (!detail) return null;
      const category = validCategories.has(String(item.category))
        ? String(item.category) as ProspectInterestCategory
        : "other";
      const requestedId = String(item.id ?? "").trim().replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
      const baseId = requestedId || `interest-${index + 1}`;
      let id = baseId;
      let suffix = 2;
      while (usedIds.has(id)) {
        id = `${baseId}-${suffix}`;
        suffix += 1;
      }
      usedIds.add(id);
      return { id, category, detail };
    })
    .filter((item): item is SessionCustomerInterest => item !== null);
}

export type ProspectInterestInsight = {
  category: ProspectInterestCategory;
  detail: string;
  importance: "high" | "medium" | "low";
  source: "provided" | "stated" | "inferred";
  evidence: string;
  timestamp: string | null;
  agentResponse: string;
  coverage: ProspectInterestCoverage;
};

export type ProspectInsights = {
  summary: string;
  intentStage: "ready" | "considering" | "exploring" | "unknown";
  intentRationale: string;
  interests: ProspectInterestInsight[];
  conversionDrivers: string[];
  objections: string[];
  nextBestAction: string;
};

export type AnalysisResult = {
  overallScore: number;
  totalPointsEarned: number;
  totalPointsPossible: number;
  summary: string;
  /** One-to-four-word interaction topic used in inferred session titles. */
  topicSummary?: string | null;
  /** Exactly ~9 words for session list cards. */
  cardSummary: string;
  /** One short coaching improvement line for session list cards. */
  needsImprovement: string;
  strengths: string[];
  opportunities: string[];
  suggestedRewrite: string;
  sectionScores: Array<{
    section: string;
    score: number;
    pointsEarned: number;
    pointsPossible: number;
    questions: QuestionScore[];
  }>;
  fairHousingFlags?: string[];
  /** Participant names and extraction confidence captured during rubric analysis. */
  participantNames?: SessionParticipants;
  /** Transcript-grounded prospect needs, interest coverage, and conversion guidance. */
  prospectInsights?: ProspectInsights;
  exactMoments: Array<{
    timestamp: string;
    transcriptQuote: string;
    explanation: string;
    suggestedImprovement: string;
  }>;
};

export function normalizeProspectInsights(value: unknown): ProspectInsights | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const validCategories = new Set<string>(PROSPECT_INTEREST_CATEGORIES);
  const validCoverage = new Set<string>([
    "addressed",
    "partially_addressed",
    "missed",
    "not_discussed",
  ]);
  const validImportance = new Set<string>(["high", "medium", "low"]);
  const validSources = new Set<string>(["provided", "stated", "inferred"]);
  const validStages = new Set<string>(["ready", "considering", "exploring", "unknown"]);

  const interests = Array.isArray(raw.interests)
    ? raw.interests
        .slice(0, 12)
        .map((value) => {
          if (!value || typeof value !== "object") return null;
          const item = value as Record<string, unknown>;
          const detail = String(item.detail ?? "").trim();
          if (!detail) return null;
          const category = validCategories.has(String(item.category))
            ? String(item.category) as ProspectInterestCategory
            : "other";
          const timestamp = typeof item.timestamp === "string"
            && /^\d+:[0-5]\d$/.test(item.timestamp.trim())
            ? item.timestamp.trim()
            : null;
          return {
            category,
            detail,
            importance: validImportance.has(String(item.importance))
              ? String(item.importance) as ProspectInterestInsight["importance"]
              : "medium",
            source: validSources.has(String(item.source))
              ? String(item.source) as ProspectInterestInsight["source"]
              : "inferred",
            evidence: String(item.evidence ?? "").trim(),
            timestamp,
            agentResponse: String(item.agentResponse ?? "").trim(),
            coverage: validCoverage.has(String(item.coverage))
              ? String(item.coverage) as ProspectInterestCoverage
              : "not_discussed",
          };
        })
        .filter((item): item is ProspectInterestInsight => item != null)
    : [];

  const stringList = (candidate: unknown, limit: number) =>
    Array.isArray(candidate)
      ? candidate.map((item) => String(item).trim()).filter(Boolean).slice(0, limit)
      : [];

  return {
    summary: String(raw.summary ?? "").trim(),
    intentStage: validStages.has(String(raw.intentStage))
      ? String(raw.intentStage) as ProspectInsights["intentStage"]
      : "unknown",
    intentRationale: String(raw.intentRationale ?? "").trim(),
    interests,
    conversionDrivers: stringList(raw.conversionDrivers, 5),
    objections: stringList(raw.objections, 5),
    nextBestAction: String(raw.nextBestAction ?? "").trim(),
  };
}

export type AnalysisRunTrigger = "initial" | "reanalyze";

export type AnalysisRunSummary = {
  id: string;
  sessionId: string;
  version: number;
  isCurrent: boolean;
  overallScore: number;
  rubricId: string | null;
  rubricName: string | null;
  trigger: AnalysisRunTrigger | null;
  createdAt: string;
};

export type AnalysisRun = AnalysisRunSummary & {
  result: AnalysisResult;
};

export type FollowUpAction = {
  id: string;
  sessionId: string;
  title: string;
  description: string;
  priority: "low" | "medium" | "high";
  status: "open" | "completed" | "dismissed";
  suggestedMessage: string | null;
  createdAt: string;
};

/** Map legacy DB statuses to the current pipeline. */
export function normalizeSessionStatus(status: string): SessionStatus {
  if (status === "extracting_screenshots") return "analyzing";
  return status as SessionStatus;
}

export const SESSION_STATUS_LABELS: Record<SessionStatus, string> = {
  scheduled: "Scheduled",
  in_progress: "In progress",
  uploaded: "Uploaded",
  transcribing: "Transcribing",
  segmenting: "Segmenting conversation",
  analyzing: "Analyzing",
  analysis_ready: "Analysis ready",
  reviewed: "Reviewed",
  failed: "Failed"
};
