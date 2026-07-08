"use client";

import { UserPen } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import styles from "./session-detail.module.css";

type Props = {
  sessionId: string;
  agentName: string | null;
  prospectName: string | null;
};

export function EditSessionParticipants({ sessionId, agentName, prospectName }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    const formData = new FormData(event.currentTarget);
    const nextAgentName = String(formData.get("agentName") ?? "").trim();
    const nextProspectName = String(formData.get("prospectName") ?? "").trim();
    const body: Record<string, string> = {};

    if (nextAgentName !== (agentName ?? "")) body.agentName = nextAgentName;
    if (nextProspectName !== (prospectName ?? "")) body.prospectName = nextProspectName;

    try {
      if (Object.keys(body).length > 0) {
        const response = await fetch(`/api/sessions/${sessionId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          const data = await response.json().catch(() => null) as { error?: string } | null;
          throw new Error(data?.error ?? "Could not update names.");
        }
      }

      router.refresh();
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update names.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.participantEditorRoot}>
      <button
        type="button"
        className={`btn btn-outline btn-sm ${styles.participantEditButton}`}
        onClick={() => {
          setError(null);
          setOpen((value) => !value);
        }}
        aria-expanded={open}
      >
        <UserPen size={14} />
        Edit names
      </button>

      {open && (
        <form onSubmit={handleSubmit} className={styles.participantEditorPopover}>
          <div className="form-group">
            <label htmlFor="session-agent-name" className="form-label">Agent name</label>
            <input
              id="session-agent-name"
              name="agentName"
              type="text"
              className="form-input"
              defaultValue={agentName ?? ""}
              placeholder="Agent name"
              autoComplete="name"
            />
          </div>
          <div className="form-group">
            <label htmlFor="session-prospect-name" className="form-label">Prospect name</label>
            <input
              id="session-prospect-name"
              name="prospectName"
              type="text"
              className="form-input"
              defaultValue={prospectName ?? ""}
              placeholder="Prospect name"
              autoComplete="name"
            />
          </div>
          {error && <p className={styles.participantEditorError}>{error}</p>}
          <div className={styles.participantEditorActions}>
            <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setError(null);
                setOpen(false);
              }}
              disabled={saving}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
