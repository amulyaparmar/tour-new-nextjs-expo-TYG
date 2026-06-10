import type { SessionSummary } from "@tour/shared";

export type DashboardMetrics = {
  todaySessions: number;
  upcomingSessions: number;
  processingSessions: number;
  averageScore: number | null;
};

export function computeDashboardMetrics(sessions: SessionSummary[]): DashboardMetrics {
  const now = Date.now();
  const oneDay = 24 * 60 * 60 * 1000;

  const todaySessions = sessions.filter((session) => {
    if (!session.scheduledAt) {
      return false;
    }
    const ts = new Date(session.scheduledAt).getTime();
    return Math.abs(ts - now) < oneDay;
  }).length;

  const upcomingSessions = sessions.filter((session) => {
    if (!session.scheduledAt) {
      return false;
    }
    return new Date(session.scheduledAt).getTime() > now;
  }).length;

  const processingSessions = sessions.filter((session) =>
    ["uploaded", "transcribing", "extracting_screenshots", "analyzing"].includes(session.status)
  ).length;

  const scored = sessions.filter((session) => typeof session.overallScore === "number");
  const averageScore = scored.length
    ? Math.round(scored.reduce((acc, session) => acc + (session.overallScore ?? 0), 0) / scored.length)
    : null;

  return {
    todaySessions,
    upcomingSessions,
    processingSessions,
    averageScore
  };
}
