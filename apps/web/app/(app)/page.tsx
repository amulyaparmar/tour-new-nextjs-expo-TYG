import Link from "next/link";
import { SESSION_STATUS_LABELS } from "@tour/shared";
import { listFollowUpActions, listSessions } from "@/lib/sessions";

export default async function DashboardPage() {
  const sessions = await listSessions();
  const now = Date.now();
  const oneDayMs = 24 * 60 * 60 * 1000;

  const todayCount = sessions.filter((s) => {
    if (!s.scheduledAt) return false;
    return Math.abs(new Date(s.scheduledAt).getTime() - now) < oneDayMs;
  }).length;

  const analysisReadyCount = sessions.filter(
    (s) => s.status === "analysis_ready"
  ).length;

  const scored = sessions.filter((s) => typeof s.overallScore === "number");
  const avgScore = scored.length
    ? Math.round(scored.reduce((sum, s) => sum + (s.overallScore ?? 0), 0) / scored.length)
    : null;

  const allActions = (
    await Promise.all(sessions.map((s) => listFollowUpActions(s.id)))
  ).flat();
  const openActionCount = allActions.filter((a) => a.status === "open").length;

  const upcoming = sessions
    .filter((s) => s.scheduledAt && new Date(s.scheduledAt).getTime() > now - oneDayMs)
    .slice(0, 5);

  const recentAnalysed = sessions
    .filter((s) => s.overallScore !== null)
    .slice(0, 4);

  const openActions = allActions.filter((a) => a.status === "open").slice(0, 6);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <>
      <div className="page-header">
        <div className="page-header-row">
          <div>
            <h1>{greeting}, Alex</h1>
            <p>Here&apos;s your sessions for today</p>
          </div>
          <span style={{ fontSize: 13, color: "var(--slate-400)", fontWeight: 500 }}>
            {new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
          </span>
        </div>
      </div>

      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-label">Today&apos;s Sessions</div>
          <div className="metric-value indigo">{todayCount}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Analysis Ready</div>
          <div className="metric-value indigo">{analysisReadyCount}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Average Score</div>
          <div className="metric-value" style={{ fontSize: 34 }}>
            {avgScore !== null ? `${avgScore}%` : "—"}
          </div>
          {scored.length > 0 && (
            <div className="metric-sub">
              <span className="metric-trend-up">from {scored.length} session{scored.length !== 1 ? "s" : ""}</span>
            </div>
          )}
        </div>
        <div className="metric-card">
          <div className="metric-label">Open Actions</div>
          <div className="metric-value indigo">{openActionCount}</div>
        </div>
      </div>

      <div className="two-col">
        <div className="card">
          <div className="card-header">
            <h2>Upcoming Sessions</h2>
            <div style={{ display: "flex", gap: 12 }}>
              <Link href="/calendar" className="btn btn-ghost">View Calendar</Link>
              <Link href="/calendar" className="btn btn-ghost">View all</Link>
            </div>
          </div>
          {upcoming.length === 0 ? (
            <div className="empty-state">No upcoming sessions scheduled.</div>
          ) : (
            upcoming.map((s) => (
              <Link key={s.id} href={`/sessions/${s.id}`} className="session-row">
                <span className="session-row-time">
                  {s.scheduledAt
                    ? new Date(s.scheduledAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
                    : "—"}
                </span>
                <div className="session-row-info">
                  <div className="session-row-title">{s.title}</div>
                  <div className="session-row-meta">{s.prospectName ?? "No prospect"}</div>
                </div>
                <span className={`badge badge-${s.status}`}>
                  {SESSION_STATUS_LABELS[s.status]}
                </span>
                {s.overallScore !== null && (
                  <span className="session-row-score">{s.overallScore}</span>
                )}
              </Link>
            ))
          )}
        </div>

        <div className="card">
          <div className="card-header">
            <h2>Recent Analyses</h2>
            <Link href="/sessions" className="btn btn-ghost">View all</Link>
          </div>
          {recentAnalysed.length === 0 ? (
            <div className="empty-state">No sessions have been analysed yet.</div>
          ) : (
            recentAnalysed.map((s) => (
              <Link key={s.id} href={`/sessions/${s.id}`} className="session-row">
                <div className="session-row-info">
                  <div className="session-row-title">{s.title}</div>
                  <div className="session-row-meta">
                    {s.prospectName ?? "—"}
                    {s.scheduledAt
                      ? ` · ${new Date(s.scheduledAt).toLocaleDateString()}`
                      : ""}
                  </div>
                </div>
                {s.overallScore !== null && (
                  <span className="session-row-score">{s.overallScore}</span>
                )}
              </Link>
            ))
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-header">
          <h2>Follow-Up Actions</h2>
          <span className="badge badge-open">{openActionCount} open</span>
        </div>
        {openActions.length === 0 ? (
          <div className="empty-state">No pending follow-up actions. Great job!</div>
        ) : (
          openActions.map((a) => (
            <Link key={a.id} href={`/sessions/${a.sessionId}`} className="action-row">
              <div className="action-row-info">
                <div className="action-row-title">{a.title}</div>
                <div className="action-row-desc">{a.description}</div>
                <div className="action-row-badges">
                  <span className={`badge badge-priority-${a.priority}`}>{a.priority}</span>
                </div>
              </div>
              <span style={{ color: "var(--slate-400)", fontSize: 16 }}>›</span>
            </Link>
          ))
        )}
      </div>
    </>
  );
}
