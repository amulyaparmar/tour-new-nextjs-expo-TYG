export type SessionStatus =
  | "scheduled"
  | "in_progress"
  | "uploaded"
  | "transcribing"
  | "analyzing_audio"
  | "segmenting"
  | "extracting_screenshots"
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
};

export type SessionDetail = SessionSummary & {
  notes: string | null;
  videoUrl: string | null;
  audioUrl: string | null;
};

export type CreateSessionInput = {
  title: string;
  scheduledAt?: string | null;
  location?: string | null;
  prospectName?: string | null;
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

export const SESSION_STATUS_LABELS: Record<SessionStatus, string> = {
  scheduled: "Scheduled",
  in_progress: "In progress",
  uploaded: "Uploaded",
  transcribing: "Transcribing",
  analyzing_audio: "Analyzing audio",
  segmenting: "Segmenting conversation",
  extracting_screenshots: "Extracting screenshots",
  analyzing: "Analyzing",
  analysis_ready: "Analysis ready",
  reviewed: "Reviewed",
  failed: "Failed"
};
