import { NextResponse } from "next/server";

import { listFollowUpActions, listSessions } from "@/lib/sessions";

export async function GET() {
  try {
    const sessions = await listSessions();
    const now = Date.now();
    const oneDayMs = 24 * 60 * 60 * 1000;
    const inProgressStatuses = ["uploaded", "transcribing", "extracting_screenshots", "analyzing"];

    const todaySessions = sessions.filter((session) => {
      if (!session.scheduledAt) {
        return false;
      }
      const when = new Date(session.scheduledAt).getTime();
      return Math.abs(when - now) < oneDayMs;
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

    const scoredSessions = sessions.filter((session) => typeof session.overallScore === "number");
    const averageScore = scoredSessions.length
      ? Math.round(
          scoredSessions.reduce((acc, session) => acc + (session.overallScore ?? 0), 0) /
            scoredSessions.length
        )
      : null;

    const actions = (
      await Promise.all(sessions.map((session) => listFollowUpActions(session.id)))
    ).flat();
    const openActions = actions.filter((action) => action.status === "open").length;

    const latestAnalysisSession = [...scoredSessions].sort((a, b) =>
      (b.createdAt ?? "").localeCompare(a.createdAt ?? "")
    )[0];

    return NextResponse.json({
      dashboard: {
        todaySessions,
        upcomingSessions,
        processingSessions,
        averageScore,
        openActions,
        latestAnalysisSession
      }
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load dashboard." },
      { status: 500 }
    );
  }
}
