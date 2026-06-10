import Link from "next/link";
import { SESSION_STATUS_LABELS } from "@tour/shared";
import { listSessions } from "@/lib/sessions";

export default async function SessionsPage() {
  const sessions = await listSessions();

  return (
    <>
      <div className="page-header">
        <h1>Sessions</h1>
        <p>{sessions.length} total session{sessions.length !== 1 ? "s" : ""}</p>
      </div>

      <div className="card">
        {sessions.length === 0 ? (
          <div className="empty-state">No sessions yet. Tap + to create one.</div>
        ) : (
          sessions.map((s) => (
            <Link key={s.id} href={`/sessions/${s.id}`} className="session-row">
              <div className="session-row-info">
                <div className="session-row-title">{s.title}</div>
                <div className="session-row-meta">
                  {s.prospectName ?? "No prospect"}
                  {s.scheduledAt ? ` · ${new Date(s.scheduledAt).toLocaleDateString()}` : ""}
                  {s.location ? ` · ${s.location}` : ""}
                </div>
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
    </>
  );
}
