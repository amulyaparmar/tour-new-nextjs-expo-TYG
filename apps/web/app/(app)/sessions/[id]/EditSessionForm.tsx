"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  sessionId: string;
  title: string;
  scheduledAt: string | null;
  prospectName: string | null;
  location: string | null;
  notes: string | null;
};

function toLocalDatetime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function EditSessionForm({ sessionId, title, scheduledAt, prospectName, location, notes }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const fd = new FormData(e.currentTarget);
    const body: Record<string, string> = {};

    const newTitle = String(fd.get("title") ?? "").trim();
    if (newTitle && newTitle !== title) body.title = newTitle;

    const dt = String(fd.get("scheduledAt") ?? "").trim();
    if (dt) body.scheduledAt = new Date(dt).toISOString();

    const pn = String(fd.get("prospectName") ?? "").trim();
    if (pn !== (prospectName ?? "")) body.prospectName = pn;

    const loc = String(fd.get("location") ?? "").trim();
    if (loc !== (location ?? "")) body.location = loc;

    const n = String(fd.get("notes") ?? "").trim();
    if (n !== (notes ?? "")) body.notes = n;

    if (Object.keys(body).length > 0) {
      await fetch(`/api/sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      router.refresh();
    }
    setSaving(false);
    setOpen(false);
  }

  if (!open) {
    return (
      <button type="button" className="btn btn-outline btn-sm" onClick={() => setOpen(true)}>
        Edit Details
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="form-grid" style={{ marginTop: 8 }}>
      <div className="form-group">
        <label htmlFor="title" className="form-label">Title</label>
        <input id="title" name="title" type="text" className="form-input" defaultValue={title} required />
      </div>
      <div className="form-group">
        <label htmlFor="scheduledAt" className="form-label">Date &amp; time</label>
        <input id="scheduledAt" name="scheduledAt" type="datetime-local" className="form-input" defaultValue={toLocalDatetime(scheduledAt)} />
      </div>
      <div className="form-group">
        <label htmlFor="prospectName" className="form-label">Prospect name</label>
        <input id="prospectName" name="prospectName" type="text" className="form-input" defaultValue={prospectName ?? ""} placeholder="Sarah Johnson" />
      </div>
      <div className="form-group">
        <label htmlFor="location" className="form-label">Location</label>
        <input id="location" name="location" type="text" className="form-input" defaultValue={location ?? ""} placeholder="Tower A - Unit 1204" />
      </div>
      <div className="form-group">
        <label htmlFor="notes" className="form-label">Notes</label>
        <textarea id="notes" name="notes" rows={2} className="form-textarea" defaultValue={notes ?? ""} placeholder="Focus on parking, lease timeline..." />
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  );
}
