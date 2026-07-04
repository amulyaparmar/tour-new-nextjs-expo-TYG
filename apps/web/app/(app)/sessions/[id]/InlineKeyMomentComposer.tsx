"use client";

import { useEffect, useRef, useState } from "react";
import { Send, X } from "lucide-react";

import styles from "./session-detail.module.css";
import { formatTime } from "./session-detail-utils";

export function InlineKeyMomentComposer({
  sessionId,
  timestampSec,
  onPosted,
  onCancel,
  onCommentsUpdated,
}: {
  sessionId: string;
  timestampSec: number;
  onPosted: () => void;
  onCancel: () => void;
  onCommentsUpdated?: () => void;
}) {
  const [label, setLabel] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function handleSubmit(event?: React.FormEvent) {
    event?.preventDefault();
    if (!label.trim() || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body: label.trim(),
          kind: "key_moment",
          timestampSec,
        }),
      });
      if (!res.ok) throw new Error("Failed to post");
      setLabel("");
      onCommentsUpdated?.();
      onPosted();
    } catch {
      setSubmitting(false);
    }
  }

  return (
    <form
      className={styles.inlineKeyMomentCompose}
      onSubmit={handleSubmit}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onCancel();
        }
      }}
    >
      <div className={styles.inlineCommentComposeHead}>
        <span className={styles.inlineKeyMomentComposeTag}>Key moment</span>
        <span className={styles.inlineCommentComposeTime}>{formatTime(timestampSec)}</span>
        <button type="button" className={styles.inlineCommentComposeClose} onClick={onCancel} aria-label="Cancel">
          <X size={14} />
        </button>
      </div>
      <input
        ref={inputRef}
        className={styles.inlineKeyMomentComposeInput}
        placeholder="Describe this moment..."
        value={label}
        onChange={(event) => setLabel(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            void handleSubmit();
          }
        }}
      />
      <div className={styles.inlineCommentComposeActions}>
        <span className={styles.inlineCommentComposeHint}>Enter to save · Esc to cancel</span>
        <button type="submit" className={styles.inlineKeyMomentComposeSubmit} disabled={!label.trim() || submitting}>
          <Send size={13} />
          {submitting ? "Saving..." : "Add moment"}
        </button>
      </div>
    </form>
  );
}
