export type SessionStatus =
  | "scheduled"
  | "uploaded"
  | "transcribing"
  | "extracting_screenshots"
  | "analyzing"
  | "analysis_ready"
  | "reviewed"
  | "failed";

export type SessionSummary = {
  id: string;
  title: string;
  prospectName: string | null;
  scheduledAt: string | null;
  location: string | null;
  status: SessionStatus;
  overallScore: number | null;
  createdAt: string;
};

export type SessionDetail = SessionSummary & {
  notes: string | null;
  videoUrl: string | null;
  audioUrl: string | null;
  duration: number | null;
};

export type CreateSessionInput = {
  title: string;
  scheduledAt?: string | null;
  location?: string | null;
  prospectName?: string | null;
  notes?: string | null;
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
  uploaded: "Uploaded",
  transcribing: "Transcribing",
  extracting_screenshots: "Extracting screenshots",
  analyzing: "Analyzing",
  analysis_ready: "Analysis ready",
  reviewed: "Reviewed",
  failed: "Failed"
};
