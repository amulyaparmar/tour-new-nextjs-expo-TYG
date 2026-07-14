import type { AudioInsightsStatus } from "./audio-insights-status";

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
  leads: SessionLead[];
  rubricId: string | null;
  agentId?: string | null;
  propertyId?: string | null;
  unitLabel?: string | null;
  overallScore: number | null;
  duration: number | null;
  createdAt: string;
  audioInsightsStatus: AudioInsightsStatus;
};

export type SessionDetail = SessionSummary & {
  notes: string | null;
  videoUrl: string | null;
  audioUrl: string | null;
};

export type CreateSessionInput = {
  title: string;
  status?: SessionStatus;
  scheduledAt?: string | null;
  location?: string | null;
  prospectName?: string | null;
  agentName?: string | null;
  notes?: string | null;
  source?: SessionSource;
  leads?: SessionLead[];
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

export type AnalysisResult = {
  overallScore: number;
  totalPointsEarned: number;
  totalPointsPossible: number;
  summary: string;
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
  exactMoments: Array<{
    timestamp: string;
    transcriptQuote: string;
    explanation: string;
    suggestedImprovement: string;
  }>;
};

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
