"use client";

import { Clock, MessageSquare, MoreHorizontal, Pencil, Reply, Send, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import styles from "./session-detail.module.css";
import { InlineCommentEditor } from "./InlineCommentEditor";
import type { SessionComment } from "./session-detail-utils";
import { isDiscussionComment } from "./session-detail-utils";

function fmtSec(v: number) {
  const m = Math.floor(v / 60);
  const s = Math.floor(v % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function SidebarCommentsPanel({
  sessionId,
  currentTime,
  comments: externalComments,
  onCommentsUpdated,
  onSeek,
  selectedCommentId,
  onCommentSelect,
}: {
  sessionId: string;
  currentTime: number;
  comments: SessionComment[];
  onCommentsUpdated: (comments: SessionComment[]) => void;
  onSeek: (seconds: number) => void;
  selectedCommentId: string | null;
  onCommentSelect: (commentId: string) => void;
}) {
  const [body, setBody] = useState("");
  const [linkTimestamp, setLinkTimestamp] = useState(false);
  const [timestampSec, setTimestampSec] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [openMenuCommentId, setOpenMenuCommentId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const selectedRef = useRef<HTMLDivElement>(null);

  const topLevel = externalComments.filter((c) => !c.parentId && isDiscussionComment(c));
  const replies = (parentId: string) =>
    externalComments.filter((c) => c.parentId === parentId && isDiscussionComment(c));

  const reload = useCallback(async () => {
    try {
      const res = await fetch(`/api/sessions/${sessionId}/comments`);
      if (!res.ok) throw new Error("Failed");
      const data = (await res.json()) as { comments: SessionComment[] };
      onCommentsUpdated(data.comments);
      setError(null);
    } catch {
      setError("Could not load comments");
    }
  }, [sessionId, onCommentsUpdated]);

  useEffect(() => {
    if (!selectedCommentId || !selectedRef.current) return;
    selectedRef.current.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedCommentId]);

  useEffect(() => {
    if (!openMenuCommentId) return;
    const closeMenu = () => setOpenMenuCommentId(null);
    window.addEventListener("click", closeMenu);
    return () => window.removeEventListener("click", closeMenu);
  }, [openMenuCommentId]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!body.trim()) return;
    setSubmitting(true);
    try {
      let sec: number | null = null;
      if (linkTimestamp) {
        const ts = timestampSec.trim();
        if (ts) {
          const parts = ts.split(":").map(Number);
          if (parts.length === 2 && parts.every((n) => !isNaN(n))) {
            sec = parts[0]! * 60 + parts[1]!;
          } else if (!isNaN(Number(ts))) {
            sec = Number(ts);
          }
        } else {
          sec = Math.floor(currentTime);
        }
      }

      const res = await fetch(`/api/sessions/${sessionId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body: body.trim(),
          timestampSec: sec,
          parentId: replyTo,
        }),
      });
      if (!res.ok) throw new Error("Failed");
      setBody("");
      setTimestampSec("");
      setReplyTo(null);
      await reload();
    } catch {
      setError("Failed to post comment");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(commentId: string) {
    try {
      await fetch(`/api/sessions/${sessionId}/comments`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commentId }),
      });
      await reload();
    } catch {
      setError("Failed to delete");
    }
  }

  function renderCommentMenu(commentId: string) {
    const isOpen = openMenuCommentId === commentId;
    return (
      <div
        className={`${styles.sidebarCommentMenuWrap} ${isOpen ? styles.commentMenuWrapOpen : ""}`}
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className={styles.sidebarCommentMore}
          aria-label="Comment options"
          aria-expanded={isOpen}
          onClick={() => setOpenMenuCommentId(isOpen ? null : commentId)}
        >
          <MoreHorizontal size={15} />
        </button>
        {isOpen && (
          <div className={styles.commentMenu} role="menu">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setEditingCommentId(commentId);
                setOpenMenuCommentId(null);
              }}
            >
              <Pencil size={13} />
              Edit
            </button>
            <button
              type="button"
              role="menuitem"
              className={styles.commentMenuDanger}
              onClick={() => {
                setOpenMenuCommentId(null);
                void handleDelete(commentId);
              }}
            >
              <Trash2 size={13} />
              Delete
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={styles.sidebarComments}>
      <div className={styles.sidebarCommentsList}>
        {error && (
          <div className={styles.sidebarCommentsError}>
            {error}
            <button type="button" onClick={() => void reload()}>Retry</button>
          </div>
        )}

        {topLevel.length === 0 ? (
          <div className={styles.sidebarCommentsEmpty}>
            <MessageSquare size={22} strokeWidth={1.5} />
            <p>No session comments yet</p>
            <span>Add general feedback below, or comment inline on the transcript.</span>
          </div>
        ) : (
          topLevel.map((comment) => (
            <div
              key={comment.id}
              ref={selectedCommentId === comment.id ? selectedRef : undefined}
              className={`${styles.sidebarCommentCard} ${selectedCommentId === comment.id ? styles.sidebarCommentCardActive : ""}`}
              onClick={() => onCommentSelect(comment.id)}
            >
              <div className={styles.sidebarCommentHead}>
                <span className={styles.sidebarCommentAvatar}>{comment.authorName[0]?.toUpperCase()}</span>
                <div className={styles.sidebarCommentMeta}>
                  <strong>{comment.authorName}</strong>
                  <span>{relativeTime(comment.createdAt)}</span>
                </div>
                {comment.timestampSec != null ? (
                  <button
                    type="button"
                    className={styles.sidebarCommentTs}
                    onClick={(event) => {
                      event.stopPropagation();
                      onSeek(comment.timestampSec!);
                    }}
                  >
                    <Clock size={10} />
                    {fmtSec(comment.timestampSec)}
                  </button>
                ) : (
                  <span className={styles.sidebarCommentGeneral}>General</span>
                )}
                {renderCommentMenu(comment.id)}
              </div>
              {editingCommentId === comment.id ? (
                <InlineCommentEditor
                  sessionId={sessionId}
                  commentId={comment.id}
                  initialBody={comment.body}
                  onSaved={() => {
                    setEditingCommentId(null);
                    void reload();
                  }}
                  onCancel={() => setEditingCommentId(null)}
                />
              ) : (
                <p
                  className={styles.sidebarCommentBody}
                  onDoubleClick={(event) => {
                    event.stopPropagation();
                    setEditingCommentId(comment.id);
                  }}
                  title="Double-click to edit"
                >
                  {comment.body}
                </p>
              )}
              <div className={styles.sidebarCommentActions}>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setReplyTo(comment.id);
                    inputRef.current?.focus();
                  }}
                >
                  <Reply size={13} />
                  Reply
                </button>
              </div>

              {replies(comment.id).map((reply) => (
                <div key={reply.id} className={styles.sidebarCommentReply}>
                  <div className={styles.sidebarCommentHead}>
                    <span className={`${styles.sidebarCommentAvatar} ${styles.sidebarCommentAvatarSm}`}>
                      {reply.authorName[0]?.toUpperCase()}
                    </span>
                    <div className={styles.sidebarCommentMeta}>
                      <strong>{reply.authorName}</strong>
                      <span>{relativeTime(reply.createdAt)}</span>
                    </div>
                    {renderCommentMenu(reply.id)}
                  </div>
                  {editingCommentId === reply.id ? (
                    <InlineCommentEditor
                      sessionId={sessionId}
                      commentId={reply.id}
                      initialBody={reply.body}
                      onSaved={() => {
                        setEditingCommentId(null);
                        void reload();
                      }}
                      onCancel={() => setEditingCommentId(null)}
                    />
                  ) : (
                    <p
                      className={styles.sidebarCommentBody}
                      onDoubleClick={(event) => {
                        event.stopPropagation();
                        setEditingCommentId(reply.id);
                      }}
                      title="Double-click to edit"
                    >
                      {reply.body}
                    </p>
                  )}
                </div>
              ))}
            </div>
          ))
        )}
      </div>

      <form className={styles.sidebarCommentsCompose} onSubmit={handleSubmit}>
        {replyTo && (
          <div className={styles.sidebarCommentsReplyBanner}>
            <Reply size={12} />
            <span>Replying to comment</span>
            <button type="button" onClick={() => setReplyTo(null)}>&times;</button>
          </div>
        )}
        <textarea
          ref={inputRef}
          className={styles.sidebarCommentsInput}
          placeholder="Add session feedback..."
          value={body}
          rows={3}
          onChange={(event) => setBody(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              void handleSubmit(event);
            }
          }}
        />
        <label className={styles.sidebarCommentsLinkRow}>
          <input
            type="checkbox"
            checked={linkTimestamp}
            onChange={(event) => {
              setLinkTimestamp(event.target.checked);
              if (event.target.checked && !timestampSec) {
                setTimestampSec(fmtSec(Math.floor(currentTime)));
              }
              if (!event.target.checked) setTimestampSec("");
            }}
          />
          <span>Link to timestamp</span>
        </label>
        {linkTimestamp && (
          <div className={styles.sidebarCommentsTsRow}>
            <Clock size={13} />
            <input
              type="text"
              value={timestampSec}
              placeholder={fmtSec(Math.floor(currentTime))}
              onChange={(event) => setTimestampSec(event.target.value)}
            />
            <button
              type="button"
              onClick={() => setTimestampSec(fmtSec(Math.floor(currentTime)))}
            >
              Use current
            </button>
          </div>
        )}
        <button type="submit" className={styles.sidebarCommentsSubmit} disabled={!body.trim() || submitting}>
          <Send size={14} />
          {submitting ? "Posting..." : "Post comment"}
        </button>
      </form>
    </div>
  );
}
