import Link from "next/link";
import { SESSION_STATUS_LABELS } from "@tour/shared";
import { listSessions } from "@/lib/sessions";
import { ContactCardPanel } from "./ContactCardPanel";
import { SmartSessionModalButton } from "./SmartSessionForm";
import { UserGreeting } from "./UserGreeting";
import { requireTourWorkspace } from "@/lib/tour-auth";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const workspace = await requireTourWorkspace();
  const sessions = await listSessions({ limit: 100, propertyId: workspace.community.id });
  const now = Date.now();
  const oneDayMs = 24 * 60 * 60 * 1000;
  const inProgressStatuses = ["uploaded", "transcribing", "extracting_screenshots", "analyzing"];
  const analyzedOrActiveStatuses = [...inProgressStatuses, "analysis_ready", "reviewed"];

  const todayCount = sessions.filter((s) => {
    if (!s.scheduledAt) return false;
    return Math.abs(new Date(s.scheduledAt).getTime() - now) < oneDayMs;
  }).length;

  const analysisReadyCount = sessions.filter(
    (s) => s.status === "analysis_ready"
  ).length;
  const managerFeedbackReviewCount = 4;
  const totalReviewCount = analysisReadyCount + managerFeedbackReviewCount;

  const scored = sessions.filter((s) => typeof s.overallScore === "number");
  const avgScore = scored.length
    ? Math.round(scored.reduce((sum, s) => sum + (s.overallScore ?? 0), 0) / scored.length)
    : null;

  const liveSessions = sessions.filter((s) => s.status === "in_progress");

  const upcoming = sessions
    .filter((s) => (
      (s.scheduledAt &&
        new Date(s.scheduledAt).getTime() > now - oneDayMs &&
        s.status === "scheduled") ||
      inProgressStatuses.includes(s.status)
    ))
    .slice(0, 5);

  const recentSessions = sessions
    .filter((s) => analyzedOrActiveStatuses.includes(s.status))
    .slice(0, 4);
  const displayName = workspace.user.fullName ?? workspace.user.email.split("@")[0] ?? "LeaseMagnets";

  return (
    <>
      <div className="page-header">
        <div className="page-header-row">
          <div>
            <UserGreeting initialName={displayName} />
            <p>Here&apos;s your sessions for today</p>
          </div>
          <span style={{ fontSize: 13, color: "var(--slate-400)", fontWeight: 500 }}>
            {new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
          </span>
        </div>
      </div>

      <ContactCardPanel id="home-contact-card-heading" variant="home" />

      {liveSessions.length > 0 && (
        <div className="live-now-card">
          <div className="live-now-header">
            <span className="live-dot" aria-hidden="true" />
            <h2>Happening now</h2>
          </div>
          {liveSessions.map((s) => (
            <Link key={s.id} href={`/sessions/${s.id}`} className="live-now-row">
              <div className="session-row-info">
                <div className="session-row-title">{s.title}</div>
                <div className="session-row-meta">
                  {s.leads?.length
                    ? s.leads.map((l) => l.name).join(", ")
                    : s.prospectName ?? "No prospect"}
                  {s.source === "qr" ? " · via QR check-in" : ""}
                </div>
              </div>
              <span className="btn btn-primary btn-sm">Continue tour</span>
            </Link>
          ))}
        </div>
      )}

      <div className="two-col">
        <div className="card">
          <div className="card-header">
            <h2>Upcoming Sessions</h2>
            <div style={{ display: "flex", gap: 12 }}>
              <SmartSessionModalButton title="New tour lead" />
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
                  <div className="session-row-meta">
                    {s.leads?.length
                      ? s.leads.map((l) => l.name).join(", ")
                      : s.prospectName ?? "No prospect"}
                  </div>
                </div>
                {s.source === "qr" && <span className="badge badge-source-qr">QR</span>}
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
            <h2>Recent Sessions</h2>
            <Link href="/sessions" className="btn btn-ghost">View all</Link>
          </div>
          {recentSessions.length === 0 ? (
            <div className="empty-state">No recent sessions yet.</div>
          ) : (
            recentSessions.map((s) => (
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
                {s.overallScore === null && (
                  <span className={`badge badge-${s.status}`}>
                    {SESSION_STATUS_LABELS[s.status]}
                  </span>
                )}
                {s.overallScore !== null && (
                  <span className="session-row-score">{s.overallScore}</span>
                )}
              </Link>
            ))
          )}
        </div>
      </div>

      <div className="metrics-grid metrics-grid-bottom">
        <div className="metric-card">
          <div className="metric-label">Today&apos;s Sessions</div>
          <div className="metric-value indigo">{todayCount}</div>
        </div>
        <Link href="/sessions?status=analysis_ready" className="metric-card metric-card-link metric-card-wide metric-card-review">
          <div className="metric-label">Analysis Ready For Review</div>
          <div className="metric-value indigo">{totalReviewCount}</div>
          <div className="metric-review-lines">
            <div className="metric-sub"><strong>{analysisReadyCount}</strong> AI feedback for your review</div>
            <div className="metric-sub"><strong>{managerFeedbackReviewCount}</strong> Manager feedback for your review</div>
          </div>
        </Link>
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
      </div>

      {/* <div className="card" style={{ marginTop: 16 }}>
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
      </div> */}
    </>
  );
}
