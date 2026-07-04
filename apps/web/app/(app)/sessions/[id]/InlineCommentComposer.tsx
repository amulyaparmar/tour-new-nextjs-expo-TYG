"use client";

import { useEffect, useRef, useState } from "react";
import { Send, X } from "lucide-react";

import styles from "./session-detail.module.css";
import { formatTime } from "./session-detail-utils";

type Props = {
  sessionId: string;
  timestampSec: number;
  onPosted: () => void;
  onCancel: () => void;
  onCommentsUpdated?: () => void;
};

export function InlineCommentComposer({
  sessionId,
  timestampSec,
  onPosted,
  onCancel,
  onCommentsUpdated,
}: Props) {
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function handleSubmit(event?: React.FormEvent) {
    event?.preventDefault();
    if (!body.trim() || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body: body.trim(),
          timestampSec: Math.floor(timestampSec),
          parentId: null,
        }),
      });
      if (!res.ok) throw new Error("Failed to post");
      setBody("");
      onCommentsUpdated?.();
      onPosted();
    } catch {
      setSubmitting(false);
    }
  }

  return (
    <form
      className={styles.inlineCommentCompose}
      onSubmit={handleSubmit}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onCancel();
        }
      }}
    >
      <div className={styles.inlineCommentComposeHead}>
        <span className={styles.inlineCommentComposeTime}>{formatTime(timestampSec)}</span>
        <button type="button" className={styles.inlineCommentComposeClose} onClick={onCancel} aria-label="Cancel">
          <X size={14} />
        </button>
      </div>
      <textarea
        ref={inputRef}
        className={styles.inlineCommentComposeInput}
        placeholder="Write a comment..."
        value={body}
        rows={3}
        onChange={(event) => setBody(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            void handleSubmit();
          }
        }}
      />
      <div className={styles.inlineCommentComposeActions}>
        <span className={styles.inlineCommentComposeHint}>Enter to post · Esc to cancel</span>
        <button type="submit" className={styles.inlineCommentComposeSubmit} disabled={!body.trim() || submitting}>
          <Send size={13} />
          {submitting ? "Posting..." : "Post"}
        </button>
      </div>
    </form>
  );
}
