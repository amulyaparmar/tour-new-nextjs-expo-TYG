import { listSessions } from "@/lib/sessions";
import { SmartSessionForm } from "../SmartSessionForm";
import { CalendarView } from "./CalendarView";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const sessions = await listSessions();

  return (
    <>
      <div className="page-header">
        <div className="page-header-row">
          <div>
            <h1>Sessions</h1>
            <p>Schedule, browse, and manage your tour sessions</p>
          </div>
        </div>
      </div>

      <details className="card create-session-collapse">
        <summary className="card-header" style={{ cursor: "pointer", userSelect: "none" }}>
          <h2>+ Add New Session</h2>
        </summary>
        <div className="card-body">
          <SmartSessionForm />
        </div>
      </details>

      {/* ── Calendar + session list ── */}
      <CalendarView sessions={sessions} />
    </>
  );
}
