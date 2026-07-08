import type { SessionSummary } from "@tour/shared";

export type DashboardMetrics = {
  todaySessions: number;
  upcomingSessions: number;
  processingSessions: number;
  liveSessions: number;
  reviewQueue: number;
  analyzedSessions: number;
  completedSessions: number;
  averageScore: number | null;
};

export function computeDashboardMetrics(sessions: SessionSummary[]): DashboardMetrics {
  const now = Date.now();
  const oneDay = 24 * 60 * 60 * 1000;
  const inProgressStatuses = ["uploaded", "transcribing", "segmenting", "analyzing"];

  const todaySessions = sessions.filter((session) => {
    if (!session.scheduledAt) {
      return false;
    }
    const ts = new Date(session.scheduledAt).getTime();
    return Math.abs(ts - now) < oneDay;
  }).length;

  const upcomingSessions = sessions.filter((session) => {
    return (
      (session.scheduledAt && new Date(session.scheduledAt).getTime() > now) ||
      inProgressStatuses.includes(session.status)
    );
  }).length;

  const processingSessions = sessions.filter((session) =>
    inProgressStatuses.includes(session.status)
  ).length;
  const liveSessions = sessions.filter((session) => session.status === "in_progress").length;
  const reviewQueue = sessions.filter((session) =>
    ["uploaded", "analysis_ready", "failed"].includes(session.status)
  ).length;
  const analyzedSessions = sessions.filter((session) =>
    ["analysis_ready", "reviewed"].includes(session.status)
  ).length;
  const completedSessions = sessions.filter((session) => session.status === "reviewed").length;

  const scored = sessions.filter((session) => typeof session.overallScore === "number");
  const averageScore = scored.length
    ? Math.round(scored.reduce((acc, session) => acc + (session.overallScore ?? 0), 0) / scored.length)
    : null;

  return {
    todaySessions,
    upcomingSessions,
    processingSessions,
    liveSessions,
    reviewQueue,
    analyzedSessions,
    completedSessions,
    averageScore
  };
}
