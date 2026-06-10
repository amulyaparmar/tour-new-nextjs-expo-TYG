import { redirect } from "next/navigation";
import { createSession } from "@/lib/sessions";

export default function NewSessionPage() {
  return (
    <>
      <div className="page-header">
        <h1>New Session</h1>
        <p>Create a session to record and analyze</p>
      </div>

      <div className="card">
        <div className="card-body">
          <form action={createSessionAction} className="form-grid">
            <div className="form-group">
              <label htmlFor="title" className="form-label">Session title</label>
              <input id="title" name="title" type="text" className="form-input" placeholder="Downtown Unit Tour" required />
            </div>
            <div className="form-group">
              <label htmlFor="scheduledAt" className="form-label">Date &amp; time</label>
              <input id="scheduledAt" name="scheduledAt" type="datetime-local" className="form-input" />
            </div>
            <div className="form-group">
              <label htmlFor="prospectName" className="form-label">Prospect name</label>
              <input id="prospectName" name="prospectName" type="text" className="form-input" placeholder="Sarah Johnson" />
            </div>
            <div className="form-group">
              <label htmlFor="location" className="form-label">Location</label>
              <input id="location" name="location" type="text" className="form-input" placeholder="Tower A - Unit 1204" />
            </div>
            <div className="form-group">
              <label htmlFor="notes" className="form-label">Notes</label>
              <textarea id="notes" name="notes" rows={3} className="form-textarea" placeholder="Focus on parking, lease timeline..." />
            </div>
            <button type="submit" className="btn btn-primary btn-block">Create Session</button>
          </form>
        </div>
      </div>
    </>
  );
}

async function createSessionAction(formData: FormData) {
  "use server";

  const title = String(formData.get("title") ?? "").trim();
  if (!title) return;

  const scheduledAt = normalizeDateTime(formData.get("scheduledAt"));
  const prospectName = normalize(formData.get("prospectName"));
  const location = normalize(formData.get("location"));
  const notes = normalize(formData.get("notes"));

  const session = await createSession({ title, scheduledAt, prospectName, location, notes });
  redirect(`/sessions/${session.id}`);
}

function normalize(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t || null;
}

function normalizeDateTime(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
