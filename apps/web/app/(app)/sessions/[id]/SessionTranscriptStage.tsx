"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ConversationPhaseSegmentation } from "@tour/shared";
import { findPhaseForTimestamp, shortPhaseLabel } from "@tour/shared";
import { ChevronDown, ChevronUp, MessageSquare, MoreHorizontal, Pencil, Search, Tag, Trash2 } from "lucide-react";

import styles from "./session-detail.module.css";
import { InlineCommentComposer } from "./InlineCommentComposer";
import { InlineCommentEditor } from "./InlineCommentEditor";
import { InlineKeyMomentComposer } from "./InlineKeyMomentComposer";
import {
  formatTime,
  findNearestSegment,
  initialsFor,
  relativeTime,
  scrollTranscriptRowIntoView,
  SPEAKER_PALETTE,
  type SessionComment,
  type SessionMoment,
  type TranscriptSegment,
} from "./session-detail-utils";

type Props = {
  sessionId: string;
  transcript: TranscriptSegment[];
  phases?: ConversationPhaseSegmentation | null;
  summary?: string | null;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  moments: SessionMoment[];
  comments: SessionComment[];
  showComments: boolean;
  activeCommentId: string | null;
  commentNavIndex: number;
  commentNavTotal: number;
  seekTo: (seconds: number) => void;
  onScrollTimeChange: (seconds: number) => void;
  onCommentsUpdated: () => void;
  onInlineComposeOpen?: () => void;
  onCommentSelect: (commentId: string) => void;
  onCommentNavigate: (direction: -1 | 1) => void;
  onMomentClick: (moment: SessionMoment) => void;
  chatScrollRequest?: { key: number; seconds: number } | null;
};

type InlineCompose = {
  segmentId: string;
  timestampSec: number;
};

type KeyMomentCompose = {
  segmentId: string;
  timestampSec: number;
};

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}

export function SessionTranscriptStage({
  sessionId,
  transcript,
  phases,
  summary,
  currentTime,
  duration,
  isPlaying,
  moments,
  comments,
  showComments,
  activeCommentId,
  commentNavIndex,
  commentNavTotal,
  seekTo,
  onScrollTimeChange,
  onCommentsUpdated,
  onInlineComposeOpen,
  onCommentSelect,
  onCommentNavigate,
  onMomentClick,
  chatScrollRequest,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const scrollRafRef = useRef<number | null>(null);
  const skipAutoScrollRef = useRef(false);
  const [query, setQuery] = useState("");
  const [inlineCompose, setInlineCompose] = useState<InlineCompose | null>(null);
  const [keyMomentCompose, setKeyMomentCompose] = useState<KeyMomentCompose | null>(null);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [openCommentMenuId, setOpenCommentMenuId] = useState<string | null>(null);

  const useCommentLayout = showComments || inlineCompose != null || keyMomentCompose != null;

  const openInlineCompose = useCallback((segment: TranscriptSegment) => {
    onInlineComposeOpen?.();
    setKeyMomentCompose(null);
    setInlineCompose({ segmentId: segment.id, timestampSec: segment.startTime });
  }, [onInlineComposeOpen]);

  const openKeyMomentCompose = useCallback((segment: TranscriptSegment) => {
    setInlineCompose(null);
    setKeyMomentCompose({ segmentId: segment.id, timestampSec: Math.floor(currentTime) });
  }, [currentTime]);

  const handleDeleteComment = useCallback(async (commentId: string) => {
    try {
      const res = await fetch(`/api/sessions/${sessionId}/comments`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commentId }),
      });
      if (!res.ok) throw new Error("Failed to delete comment");
      setOpenCommentMenuId(null);
      onCommentsUpdated();
    } catch {
      setOpenCommentMenuId(null);
    }
  }, [sessionId, onCommentsUpdated]);

  const speakerMap = useMemo(() => {
    const speakers = Array.from(new Set(transcript.map((seg) => seg.speaker || "Speaker")));
    return new Map(
      speakers.map((speaker, index) => [speaker, SPEAKER_PALETTE[index % SPEAKER_PALETTE.length]!])
    );
  }, [transcript]);

  const activeSegment = useMemo(() => {
    if (transcript.length === 0) return null;
    return transcript.reduce<TranscriptSegment | null>((active, seg) => {
      if (currentTime >= seg.startTime && (!active || seg.startTime >= active.startTime)) return seg;
      return active;
    }, null) ?? transcript[0]!;
  }, [currentTime, transcript]);

  const filteredTranscript = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return transcript;
    return transcript.filter((seg) =>
      seg.text.toLowerCase().includes(trimmed) || seg.speaker.toLowerCase().includes(trimmed)
    );
  }, [query, transcript]);

  const commentsBySegment = useMemo(() => {
    const map = new Map<string, SessionComment[]>();
    for (const comment of comments.filter((item) => item.timestampSec != null && !item.parentId)) {
      const target = findNearestSegment(comment.timestampSec!, transcript);
      if (!target) continue;
      map.set(target.id, [...(map.get(target.id) ?? []), comment]);
    }
    return map;
  }, [comments, transcript]);

  const momentsBySegment = useMemo(() => {
    const map = new Map<string, SessionMoment[]>();
    for (const moment of moments) {
      const target = findNearestSegment(moment.timestamp, transcript);
      if (!target) continue;
      map.set(target.id, [...(map.get(target.id) ?? []), moment]);
    }
    return map;
  }, [moments, transcript]);

  const syncTimeFromScroll = useCallback(() => {
    const container = scrollRef.current;
    if (!container || isPlaying) return;

    const centerY = container.scrollTop + container.clientHeight * 0.35;
    let bestSegment: TranscriptSegment | null = null;
    let bestDist = Infinity;

    for (const seg of filteredTranscript) {
      const row = rowRefs.current[seg.id];
      if (!row) continue;
      const rowTop = row.offsetTop - container.offsetTop;
      const rowCenter = rowTop + row.clientHeight / 2;
      const dist = Math.abs(rowCenter - centerY);
      if (dist < bestDist) {
        bestDist = dist;
        bestSegment = seg;
      }
    }

    if (bestSegment) {
      onScrollTimeChange(bestSegment.startTime);
    }
  }, [filteredTranscript, isPlaying, onScrollTimeChange]);

  const handleScroll = useCallback(() => {
    if (isPlaying) return;
    if (scrollRafRef.current != null) return;
    scrollRafRef.current = window.requestAnimationFrame(() => {
      scrollRafRef.current = null;
      syncTimeFromScroll();
    });
  }, [isPlaying, syncTimeFromScroll]);

  useEffect(() => {
    if (skipAutoScrollRef.current) return;
    if (!isPlaying || !activeSegment || !scrollRef.current) return;
    const row = rowRefs.current[activeSegment.id];
    if (!row) return;
    scrollTranscriptRowIntoView(scrollRef.current, row);
  }, [activeSegment?.id, isPlaying]);

  useEffect(() => {
    if (!chatScrollRequest || !scrollRef.current) return;
    const segment = findNearestSegment(chatScrollRequest.seconds, transcript);
    if (!segment) return;

    skipAutoScrollRef.current = true;

    const scrollToSegment = () => {
      const row = rowRefs.current[segment.id];
      const container = scrollRef.current;
      if (!row || !container) return false;
      scrollTranscriptRowIntoView(container, row, { fromChat: true });
      return true;
    };

    if (!scrollToSegment()) {
      requestAnimationFrame(scrollToSegment);
    }

    const timer = window.setTimeout(() => {
      skipAutoScrollRef.current = false;
    }, 220);

    return () => window.clearTimeout(timer);
  }, [chatScrollRequest, transcript]);

  useEffect(() => {
    if (!activeCommentId || !scrollRef.current) return;
    for (const [segmentId, segmentComments] of commentsBySegment.entries()) {
      if (!segmentComments.some((comment) => comment.id === activeCommentId)) continue;
      const row = rowRefs.current[segmentId];
      if (!row) return;
      const container = scrollRef.current;
      const offset = row.offsetTop - container.offsetTop - container.clientHeight / 3 + row.clientHeight / 2;
      container.scrollTo({ top: Math.max(0, offset), behavior: "smooth" });
      break;
    }
  }, [activeCommentId, commentsBySegment]);

  useEffect(() => {
    if (!openCommentMenuId) return;
    const closeMenu = () => setOpenCommentMenuId(null);
    window.addEventListener("click", closeMenu);
    return () => window.removeEventListener("click", closeMenu);
  }, [openCommentMenuId]);

  useEffect(() => () => {
    if (scrollRafRef.current != null) window.cancelAnimationFrame(scrollRafRef.current);
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (isEditableTarget(event.target)) return;
      if (!activeSegment) return;

      if (event.key === "Enter") {
        event.preventDefault();
        openInlineCompose(activeSegment);
        return;
      }

      if (event.key === "t" || event.key === "T") {
        event.preventDefault();
        openKeyMomentCompose(activeSegment);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeSegment, openInlineCompose, openKeyMomentCompose]);

  return (
    <div className={styles.stage}>
      <div className={styles.stageToolbar}>
        <div className={styles.stageSearch}>
          <Search size={15} />
          <input
            type="search"
            placeholder="Search transcript..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Search transcript"
          />
        </div>
      </div>

      <div className={styles.stageBody}>
        {activeSegment && (
          <div className={styles.transcriptShortcuts}>
            <button
              type="button"
              className={styles.transcriptCommentShortcut}
              onClick={() => openInlineCompose(activeSegment)}
              title="Comment on active line (Enter)"
            >
              <MessageSquare size={14} />
              <kbd>enter</kbd>
            </button>
            <button
              type="button"
              className={styles.transcriptCommentShortcut}
              onClick={() => openKeyMomentCompose(activeSegment)}
              title="Tag key moment (T)"
            >
              <Tag size={14} />
              <kbd>t</kbd>
            </button>
          </div>
        )}

        <div className={styles.transcriptScroll} ref={scrollRef} onScroll={handleScroll}>
          {summary && (
            <div className={styles.stageSummary}>
              <span className={styles.stageSummaryLabel}>AI summary</span>
              <p>{summary}</p>
            </div>
          )}

          {filteredTranscript.length === 0 ? (
            <div className={styles.transcriptEmpty}>No transcript available yet.</div>
          ) : (
            filteredTranscript.map((seg) => {
              const palette = speakerMap.get(seg.speaker || "Speaker") ?? SPEAKER_PALETTE[0]!;
              const active = activeSegment?.id === seg.id;
              const segMoments = momentsBySegment.get(seg.id) ?? [];
              const segComments = commentsBySegment.get(seg.id) ?? [];
              const phase = findPhaseForTimestamp(seg.startTime, phases);

              return (
                <div
                  key={seg.id}
                  className={`${styles.transcriptBlock} ${active ? styles.transcriptBlockActive : ""}`}
                  ref={(node) => { rowRefs.current[seg.id] = node; }}
                >
                  {segMoments.map((moment) => (
                    <button
                      key={moment.id}
                      type="button"
                      className={styles.keyMomentBanner}
                      onClick={() => onMomentClick(moment)}
                    >
                      <span className={styles.keyMomentTag}>+ Key Moment</span>
                      <span className={styles.keyMomentTitle}>{moment.label}</span>
                    </button>
                  ))}

                  <div className={`${styles.transcriptRowWrap} ${useCommentLayout ? styles.transcriptRowWrapComments : ""}`}>
                    <button
                      type="button"
                      className={styles.transcriptRow}
                      onClick={() => seekTo(seg.startTime)}
                      onDoubleClick={(event) => {
                        event.preventDefault();
                        openInlineCompose(seg);
                      }}
                    >
                      <span className={styles.transcriptAvatar} style={{ background: palette.soft, color: palette.color }}>
                        {initialsFor(seg.speaker || "Speaker")}
                      </span>
                      <span className={styles.transcriptCopy}>
                        <span className={styles.transcriptMeta}>
                          <strong style={{ color: palette.color }}>{seg.speaker || "Speaker"}</strong>
                          {phase && (
                            <span className={styles.transcriptPhase}>{shortPhaseLabel(phase.label)}</span>
                          )}
                          <span>{formatTime(seg.startTime)}</span>
                        </span>
                        <span className={styles.transcriptText}>{seg.text}</span>
                      </span>
                    </button>

                    {inlineCompose?.segmentId === seg.id && (
                      <InlineCommentComposer
                        sessionId={sessionId}
                        timestampSec={inlineCompose.timestampSec}
                        onPosted={() => setInlineCompose(null)}
                        onCancel={() => setInlineCompose(null)}
                        onCommentsUpdated={onCommentsUpdated}
                      />
                    )}

                    {keyMomentCompose?.segmentId === seg.id && (
                      <InlineKeyMomentComposer
                        sessionId={sessionId}
                        timestampSec={keyMomentCompose.timestampSec}
                        onPosted={() => setKeyMomentCompose(null)}
                        onCancel={() => setKeyMomentCompose(null)}
                        onCommentsUpdated={onCommentsUpdated}
                      />
                    )}

                    {showComments && segComments.map((comment) =>
                      editingCommentId === comment.id ? (
                        <InlineCommentEditor
                          key={comment.id}
                          sessionId={sessionId}
                          commentId={comment.id}
                          initialBody={comment.body}
                          variant="floating"
                          onSaved={() => {
                            setEditingCommentId(null);
                            onCommentsUpdated();
                          }}
                          onCancel={() => setEditingCommentId(null)}
                        />
                      ) : (
                        <div
                          key={comment.id}
                          role="button"
                          tabIndex={0}
                          className={`${styles.floatingComment} ${activeCommentId === comment.id ? styles.floatingCommentActive : ""}`}
                          onClick={() => {
                            if (comment.timestampSec != null) seekTo(comment.timestampSec);
                            onCommentSelect(comment.id);
                          }}
                          onKeyDown={(event) => {
                            if (event.key !== "Enter" && event.key !== " ") return;
                            event.preventDefault();
                            if (comment.timestampSec != null) seekTo(comment.timestampSec);
                            onCommentSelect(comment.id);
                          }}
                          onDoubleClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            setEditingCommentId(comment.id);
                          }}
                        >
                          <div className={styles.floatingCommentHead}>
                            <span className={styles.floatingCommentAvatar}>{initialsFor(comment.authorName)}</span>
                            <span className={styles.floatingCommentAuthor}>{comment.authorName}</span>
                            <span className={styles.floatingCommentTime}>{relativeTime(comment.createdAt)}</span>
                            <span
                              className={`${styles.floatingCommentMenuWrap} ${openCommentMenuId === comment.id ? styles.commentMenuWrapOpen : ""}`}
                              onClick={(event) => event.stopPropagation()}
                              onKeyDown={(event) => event.stopPropagation()}
                            >
                              <button
                                type="button"
                                className={styles.floatingCommentMore}
                                aria-label="Comment options"
                                aria-expanded={openCommentMenuId === comment.id}
                                onClick={() => setOpenCommentMenuId(openCommentMenuId === comment.id ? null : comment.id)}
                              >
                                <MoreHorizontal size={14} />
                              </button>
                              {openCommentMenuId === comment.id && (
                                <span className={styles.commentMenu} role="menu">
                                  <button
                                    type="button"
                                    role="menuitem"
                                    onClick={() => {
                                      setEditingCommentId(comment.id);
                                      setOpenCommentMenuId(null);
                                    }}
                                  >
                                    <Pencil size={13} />
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    role="menuitem"
                                    className={styles.commentMenuDanger}
                                    onClick={() => void handleDeleteComment(comment.id)}
                                  >
                                    <Trash2 size={13} />
                                    Delete
                                  </button>
                                </span>
                              )}
                            </span>
                          </div>
                          <p>{comment.body}</p>
                        </div>
                      )
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {showComments && commentNavTotal > 0 && (
          <div className={styles.floatingCommentNav} aria-label="Navigate comments">
            <button type="button" aria-label="Previous comment" onClick={() => onCommentNavigate(-1)}>
              <ChevronUp size={16} />
            </button>
            <span>{commentNavIndex + 1}/{commentNavTotal}</span>
            <button type="button" aria-label="Next comment" onClick={() => onCommentNavigate(1)}>
              <ChevronDown size={16} />
            </button>
          </div>
        )}
      </div>

      <div className={styles.stageStatus} aria-live="polite">
        <span>{formatTime(currentTime)}</span>
        <span>{activeSegment ? `${activeSegment.speaker} speaking` : "Ready"}</span>
        <span>{formatTime(duration)}</span>
      </div>
    </div>
  );
}
