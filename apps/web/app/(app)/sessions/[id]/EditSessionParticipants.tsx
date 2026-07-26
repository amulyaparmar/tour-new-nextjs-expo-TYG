"use client";

import { buildSessionTourTitle, withRecordingParticipants } from "@tour/shared";
import { UserPen } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import styles from "./session-detail.module.css";

type Props = {
  sessionId: string;
  title: string;
  agentName: string | null;
  prospectName: string | null;
};

function suggestParticipantTitle(input: {
  title: string;
  currentAgentName: string | null;
  currentProspectName: string | null;
  nextAgentName: string | null;
  nextProspectName: string | null;
}): string | null {
  const currentTitle = input.title.trim();
  const recordingTitle = withRecordingParticipants(
    currentTitle,
    input.nextAgentName,
    input.nextProspectName,
  );
  if (recordingTitle !== currentTitle) return recordingTitle;

  const genericTitle = buildSessionTourTitle({
    title: currentTitle,
    agentName: input.nextAgentName,
    prospectName: input.nextProspectName,
  });
  if (genericTitle !== currentTitle) return genericTitle;

  const currentPeopleTitle = buildSessionTourTitle({
    title: currentTitle,
    agentName: input.currentAgentName,
    prospectName: input.currentProspectName,
    preferPeopleTitle: true,
  });
  if (currentPeopleTitle !== currentTitle) return null;

  const nextPeopleTitle = buildSessionTourTitle({
    title: currentTitle,
    agentName: input.nextAgentName,
    prospectName: input.nextProspectName,
    preferPeopleTitle: true,
  });
  return nextPeopleTitle !== currentTitle ? nextPeopleTitle : null;
}

export function EditSessionParticipants({ sessionId, title, agentName, prospectName }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestedTitle, setSuggestedTitle] = useState<string | null>(null);

  async function patchSession(body: Record<string, string>, failureMessage: string) {
    const response = await fetch(`/api/sessions/${sessionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => null) as { error?: string } | null;
      throw new Error(data?.error ?? failureMessage);
    }
  }

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
        await patchSession(body, "Could not update names.");
      }

      const nextTitle = suggestParticipantTitle({
        title,
        currentAgentName: agentName,
        currentProspectName: prospectName,
        nextAgentName: nextAgentName || null,
        nextProspectName: nextProspectName || null,
      });
      if (Object.keys(body).length > 0 && nextTitle) {
        setSuggestedTitle(nextTitle);
      } else {
        router.refresh();
        setOpen(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update names.");
    } finally {
      setSaving(false);
    }
  }

  async function handleTitleChoice(updateTitle: boolean) {
    setSaving(true);
    setError(null);

    try {
      if (updateTitle && suggestedTitle) {
        await patchSession({ title: suggestedTitle }, "Names were saved, but the title could not be updated.");
      }
      router.refresh();
      setSuggestedTitle(null);
      setOpen(false);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Names were saved, but the title could not be updated."
      );
    } finally {
      setSaving(false);
    }
  }

  function closeEditor() {
    setError(null);
    setSuggestedTitle(null);
    setOpen(false);
  }

  return (
    <div className={styles.participantEditorRoot}>
      <button
        type="button"
        className={`btn btn-outline btn-sm ${styles.participantEditButton}`}
        onClick={() => {
          if (open) {
            if (suggestedTitle) router.refresh();
            closeEditor();
            return;
          }
          setError(null);
          setSuggestedTitle(null);
          setOpen(true);
        }}
        aria-expanded={open}
      >
        <UserPen size={14} />
        Edit names
      </button>

      {open && (
        <div className={styles.participantEditorPopover}>
          {suggestedTitle ? (
            <>
              <div className={styles.participantTitleSuggestion}>
                <strong>Names saved</strong>
                <p>Would you like to update the session title too?</p>
                <span>{suggestedTitle}</span>
              </div>
              {error && <p className={styles.participantEditorError}>{error}</p>}
              <div className={styles.participantEditorActions}>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => void handleTitleChoice(true)}
                  disabled={saving}
                >
                  {saving ? "Updating..." : "Update title"}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => void handleTitleChoice(false)}
                  disabled={saving}
                >
                  Keep current title
                </button>
              </div>
            </>
          ) : (
            <form onSubmit={handleSubmit} className={styles.participantEditorForm}>
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
                  onClick={closeEditor}
                  disabled={saving}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
