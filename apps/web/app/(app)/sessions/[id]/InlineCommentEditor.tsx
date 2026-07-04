"use client";

import { useEffect, useRef, useState } from "react";
import { Check, X } from "lucide-react";

import styles from "./session-detail.module.css";

export function InlineCommentEditor({
  sessionId,
  commentId,
  initialBody,
  variant = "sidebar",
  onSaved,
  onCancel,
}: {
  sessionId: string;
  commentId: string;
  initialBody: string;
  variant?: "sidebar" | "floating";
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [body, setBody] = useState(initialBody);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  async function handleSave(event?: React.FormEvent) {
    event?.preventDefault();
    if (!body.trim() || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/comments`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commentId, body: body.trim() }),
      });
      if (!res.ok) throw new Error("Failed to update");
      onSaved();
    } catch {
      setSubmitting(false);
    }
  }

  const formClass =
    variant === "floating" ? styles.floatingCommentEdit : styles.sidebarCommentEdit;

  return (
    <form
      className={formClass}
      onSubmit={handleSave}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onCancel();
        }
      }}
    >
      <textarea
        ref={inputRef}
        className={styles.sidebarCommentEditInput}
        value={body}
        rows={variant === "floating" ? 2 : 3}
        onChange={(event) => setBody(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            void handleSave();
          }
        }}
      />
      <div className={styles.sidebarCommentEditActions}>
        <span className={styles.inlineCommentComposeHint}>⌘↵ save · Esc cancel</span>
        <button type="button" onClick={onCancel} aria-label="Cancel edit">
          <X size={13} />
        </button>
        <button type="submit" disabled={!body.trim() || submitting} aria-label="Save edit">
          <Check size={13} />
        </button>
      </div>
    </form>
  );
}
