import { redirect } from "next/navigation";

import { createSession, listSessions } from "@/lib/sessions";
import { CalendarView } from "./CalendarView";

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

      {/* ── Create session (collapsible card) ── */}
      <details className="card create-session-collapse">
        <summary className="card-header" style={{ cursor: "pointer", userSelect: "none" }}>
          <h2>+ New Session</h2>
        </summary>
        <div className="card-body">
          <form action={createSessionAction} className="form-grid create-session-form">
            <div className="create-session-fields">
              <div className="form-group">
                <label htmlFor="title" className="form-label">Title</label>
                <input id="title" name="title" type="text" className="form-input" placeholder="Downtown Unit Tour" required />
              </div>
              <div className="form-group">
                <label htmlFor="scheduledAt" className="form-label">Date &amp; time</label>
                <input id="scheduledAt" name="scheduledAt" type="datetime-local" className="form-input" />
              </div>
              <div className="form-group">
                <label htmlFor="prospectName" className="form-label">Prospect</label>
                <input id="prospectName" name="prospectName" type="text" className="form-input" placeholder="Jordan Lee" />
              </div>
              <div className="form-group">
                <label htmlFor="location" className="form-label">Location</label>
                <input id="location" name="location" type="text" className="form-input" placeholder="Tower A – Unit 1204" />
              </div>
              <div className="form-group">
                <label htmlFor="notes" className="form-label">Notes</label>
                <textarea id="notes" name="notes" rows={2} className="form-textarea" placeholder="Focus areas, reminders..." />
              </div>
            </div>
            <button type="submit" className="btn btn-primary" style={{ justifySelf: "start" }}>
              Create session
            </button>
          </form>
        </div>
      </details>

      {/* ── Calendar + session list ── */}
      <CalendarView sessions={sessions} />
    </>
  );
}

async function createSessionAction(formData: FormData) {
  "use server";

  const title = String(formData.get("title") ?? "").trim();
  if (!title) return;

  const scheduledAt = normalizeDateTimeInput(formData.get("scheduledAt"));
  const prospectName = normalizeOptionalField(formData.get("prospectName"));
  const location = normalizeOptionalField(formData.get("location"));
  const notes = normalizeOptionalField(formData.get("notes"));

  const session = await createSession({ title, scheduledAt, prospectName, location, notes });
  redirect(`/sessions/${session.id}`);
}

function normalizeOptionalField(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function normalizeDateTimeInput(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}
