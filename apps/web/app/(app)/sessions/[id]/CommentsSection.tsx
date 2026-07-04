"use client";

import { MessageSquare, Clock, Send, Trash2, Reply } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

export type Comment = {
  id: string;
  sessionId: string;
  authorName: string;
  body: string;
  timestampSec: number | null;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ComposeRequest = {
  timestampSec: number | null;
  mode: "comment" | "annotation";
  nonce: number;
};

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
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export function CommentsSection({
  sessionId,
  variant = "full",
  currentTime,
  onSeek,
  onCommentsUpdated,
  composeRequest,
  onComposeRequestHandled,
  selectedCommentId,
  onCommentSelect,
}: {
  sessionId: string;
  variant?: "full" | "sidebar" | "inline";
  currentTime?: number;
  onSeek?: (seconds: number) => void;
  onCommentsUpdated?: (comments: Comment[]) => void;
  composeRequest?: ComposeRequest | null;
  onComposeRequestHandled?: () => void;
  selectedCommentId?: string | null;
  onCommentSelect?: (commentId: string) => void;
}) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState("");
  const [timestampSec, setTimestampSec] = useState<string>("");
  const [linkTimestamp, setLinkTimestamp] = useState(false);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [composeMode, setComposeMode] = useState<"comment" | "annotation">("comment");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const selectedRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/sessions/${sessionId}/comments`);
      if (!res.ok) throw new Error("Failed to load");
      const data = (await res.json()) as { comments: Comment[] };
      setComments(data.comments);
      onCommentsUpdated?.(data.comments);
      setError(null);
    } catch {
      setError("Could not load comments");
    } finally {
      setLoading(false);
    }
  }, [sessionId, onCommentsUpdated]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!composeRequest) return;
    const hasTimestamp = composeRequest.timestampSec != null;
    setComposeMode(composeRequest.mode);
    setLinkTimestamp(hasTimestamp);
    setTimestampSec(hasTimestamp ? fmtSec(Math.floor(composeRequest.timestampSec!)) : "");
    setReplyTo(null);
    window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      onComposeRequestHandled?.();
    });
  }, [composeRequest, onComposeRequestHandled]);

  useEffect(() => {
    if (!selectedCommentId || !selectedRef.current) return;
    selectedRef.current.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedCommentId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
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
        } else if (currentTime != null && Number.isFinite(currentTime)) {
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
      if (!res.ok) throw new Error("Failed to post");
      setBody("");
      setTimestampSec("");
      setReplyTo(null);
      await load();
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
      await load();
    } catch {
      setError("Failed to delete");
    }
  }

  const topLevel = comments.filter((c) => !c.parentId);
  const replies = (parentId: string) => comments.filter((c) => c.parentId === parentId);
  const isSidebar = variant === "sidebar";
  const placeholder = composeMode === "annotation"
    ? "Add an annotation..."
    : "Add a comment...";

  const form = (
    <form className="sa-comment-form" onSubmit={handleSubmit}>
      {replyTo && (
        <div className="sa-comment-reply-banner">
          <Reply size={12} />
          <span>Replying to comment</span>
          <button type="button" onClick={() => setReplyTo(null)} className="sa-comment-reply-cancel">&times;</button>
        </div>
      )}
      <div className="sa-comment-form-row">
        <textarea
          ref={inputRef}
          className="sa-comment-input"
          placeholder={placeholder}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={isSidebar ? 3 : 2}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSubmit(e); }}
        />
      </div>
      <div className="sa-comment-form-actions">
        <label className="sa-comment-link-ts">
          <input
            type="checkbox"
            checked={linkTimestamp}
            onChange={(e) => {
              setLinkTimestamp(e.target.checked);
              if (e.target.checked && !timestampSec && currentTime != null) {
                setTimestampSec(fmtSec(Math.floor(currentTime)));
              }
              if (!e.target.checked) setTimestampSec("");
            }}
          />
          Link to timestamp
        </label>
        {linkTimestamp && (
          <div className="sa-comment-ts-input">
            <Clock size={13} />
            <input
              type="text"
              placeholder={currentTime != null ? fmtSec(Math.floor(currentTime)) : "2:30"}
              value={timestampSec}
              onChange={(e) => setTimestampSec(e.target.value)}
              className="sa-comment-ts-field"
            />
            {currentTime != null && (
              <button
                type="button"
                className="sa-comment-use-time"
                onClick={() => setTimestampSec(fmtSec(Math.floor(currentTime)))}
              >
                Use current
              </button>
            )}
          </div>
        )}
        <button type="submit" className="sa-comment-submit" disabled={!body.trim() || submitting}>
          <Send size={14} />
          {submitting ? "Posting..." : "Post"}
        </button>
      </div>
    </form>
  );

  const list = loading ? (
    <div className="sa-comments-loading">Loading comments...</div>
  ) : topLevel.length === 0 ? (
    <div className="sa-comments-empty">
      <MessageSquare size={24} strokeWidth={1.5} />
      <p>No comments yet</p>
      <p className="sa-comments-empty-sub">Press Enter on a transcript line or double-click to comment.</p>
    </div>
  ) : (
    <div className="sa-comments-list">
      {topLevel.map((c) => (
        <div
          key={c.id}
          ref={selectedCommentId === c.id ? selectedRef : undefined}
          className={`sa-comment ${selectedCommentId === c.id ? "sa-comment--selected" : ""}`}
          onClick={() => onCommentSelect?.(c.id)}
        >
          <div className="sa-comment-header">
            <div className="sa-comment-avatar">{c.authorName[0]?.toUpperCase()}</div>
            <span className="sa-comment-author">{c.authorName}</span>
            <span className="sa-comment-time">{relativeTime(c.createdAt)}</span>
            {c.timestampSec !== null ? (
              <button
                type="button"
                className="sa-comment-ts-badge"
                onClick={(e) => {
                  e.stopPropagation();
                  onSeek?.(c.timestampSec!);
                }}
              >
                <Clock size={10} /> {fmtSec(c.timestampSec)}
              </button>
            ) : (
              <span className="sa-comment-general-badge">General</span>
            )}
            <div className="sa-comment-actions">
              <button
                type="button"
                className="sa-comment-action-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  setReplyTo(c.id);
                  inputRef.current?.focus();
                }}
                title="Reply"
              >
                <Reply size={13} />
              </button>
              <button
                type="button"
                className="sa-comment-action-btn sa-comment-action-btn--delete"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(c.id);
                }}
                title="Delete"
              >
                <Trash2 size={13} />
              </button>
            </div>
          </div>
          <p className="sa-comment-body">{c.body}</p>

          {replies(c.id).map((r) => (
            <div key={r.id} className="sa-comment sa-comment--reply">
              <div className="sa-comment-header">
                <div className="sa-comment-avatar sa-comment-avatar--sm">{r.authorName[0]?.toUpperCase()}</div>
                <span className="sa-comment-author">{r.authorName}</span>
                <span className="sa-comment-time">{relativeTime(r.createdAt)}</span>
                <div className="sa-comment-actions">
                  <button type="button" className="sa-comment-action-btn sa-comment-action-btn--delete" onClick={() => handleDelete(r.id)} title="Delete">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
              <p className="sa-comment-body">{r.body}</p>
            </div>
          ))}
        </div>
      ))}
    </div>
  );

  return (
    <div className={variant === "sidebar" ? "sa-comments sa-comments--sidebar" : variant === "inline" ? "sa-comments sa-comments--inline" : "sa-comments"}>
      {variant === "full" && (
        <div className="sa-comments-header">
          <MessageSquare size={16} />
          <h3>Comments</h3>
          <span className="sa-comments-count">{comments.length}</span>
        </div>
      )}

      {error && (
        <div className="sa-comments-error">
          {error}
          <button type="button" onClick={load} className="sa-comments-retry">Retry</button>
        </div>
      )}

      {isSidebar ? (
        <>
          <div className="sa-comments-sidebar-list">{list}</div>
          <div className="sa-comments-sidebar-compose">{form}</div>
        </>
      ) : (
        <>
          {form}
          {list}
        </>
      )}
    </div>
  );
}
