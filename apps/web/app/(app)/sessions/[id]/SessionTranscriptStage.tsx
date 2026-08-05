"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ConversationPhaseSegmentation, SessionParticipants } from "@tour/shared";
import { findPhaseForTimestamp, formatSegmentTimeRange, formatSpeakerAnnotation } from "@tour/shared";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  MapPin,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Search,
  Sparkles,
  Tag,
  Trash2,
} from "lucide-react";

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
  participants: SessionParticipants;
  phases?: ConversationPhaseSegmentation | null;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  moments: SessionMoment[];
  comments: SessionComment[];
  showComments: boolean;
  activeCommentId: string | null;
  selectedMomentId: string | null;
  seekTo: (seconds: number) => void;
  onScrollTimeChange: (seconds: number) => void;
  onCommentsUpdated: () => void;
  onInlineComposeOpen?: () => void;
  onCommentSelect: (commentId: string) => void;
  onMomentClick: (moment: SessionMoment) => void;
  chatScrollRequest?: { key: number; seconds: number } | null;
  readOnly?: boolean;
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
  return Boolean(target.closest("input, textarea, select, button, [contenteditable='true']"));
}

export function SessionTranscriptStage({
  sessionId,
  transcript,
  participants,
  phases,
  currentTime,
  duration,
  isPlaying,
  moments,
  comments,
  showComments,
  activeCommentId,
  selectedMomentId,
  seekTo,
  onScrollTimeChange,
  onCommentsUpdated,
  onInlineComposeOpen,
  onCommentSelect,
  onMomentClick,
  chatScrollRequest,
  readOnly = false,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const scrollRafRef = useRef<number | null>(null);
  const skipAutoScrollRef = useRef(false);
  const phaseMenuRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [phaseMenuOpen, setPhaseMenuOpen] = useState(false);
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

  const phaseBySegmentId = useMemo(() => {
    const map = new Map<string, ReturnType<typeof findPhaseForTimestamp>>();
    for (const segment of transcript) {
      map.set(segment.id, findPhaseForTimestamp(segment.startTime, phases));
    }
    return map;
  }, [phases, transcript]);

  const activePhase = activeSegment
    ? phaseBySegmentId.get(activeSegment.id)
    : undefined;
  const activePhaseIndex = activePhase
    ? (phases?.spans.findIndex((span) => span.id === activePhase.id) ?? -1)
    : -1;
  const phaseCount = phases?.spans.length ?? 0;
  const activePhaseProgress = activePhase && activePhase.endTime > activePhase.startTime
    ? Math.min(
        100,
        Math.max(
          0,
          ((currentTime - activePhase.startTime) / (activePhase.endTime - activePhase.startTime)) * 100,
        ),
      )
    : 0;

  const navigatePhase = useCallback((direction: -1 | 1) => {
    if (activePhaseIndex < 0) return;
    const nextPhase = phases?.spans[activePhaseIndex + direction];
    if (nextPhase) {
      seekTo(nextPhase.startTime);
      setPhaseMenuOpen(false);
    }
  }, [activePhaseIndex, phases, seekTo]);

  const selectPhase = useCallback((startTime: number) => {
    seekTo(startTime);
    setPhaseMenuOpen(false);
  }, [seekTo]);

  const labelForSpeaker = useCallback(
    (speaker: string | null | undefined) => formatSpeakerAnnotation(speaker, participants),
    [participants]
  );

  const filteredTranscript = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return transcript;
    return transcript.filter((seg) =>
      seg.text.toLowerCase().includes(trimmed)
      || seg.speaker.toLowerCase().includes(trimmed)
      || labelForSpeaker(seg.speaker).toLowerCase().includes(trimmed)
    );
  }, [query, transcript, labelForSpeaker]);

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

  useEffect(() => {
    if (!phaseMenuOpen) return;

    const closeOnOutsidePress = (event: PointerEvent) => {
      if (!phaseMenuRef.current?.contains(event.target as Node)) {
        setPhaseMenuOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPhaseMenuOpen(false);
    };

    document.addEventListener("pointerdown", closeOnOutsidePress);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePress);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [phaseMenuOpen]);

  useEffect(() => () => {
    if (scrollRafRef.current != null) window.cancelAnimationFrame(scrollRafRef.current);
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (readOnly) return;
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
  }, [activeSegment, openInlineCompose, openKeyMomentCompose, readOnly]);

  return (
    <div className={styles.stage}>
      <div className={styles.stageToolbar}>
        <div className={styles.stageSearchShell} ref={phaseMenuRef}>
          <div className={styles.stageSearch}>
            <Search size={15} aria-hidden="true" />
            <input
              type="search"
              placeholder={activePhase ? `Search in ${activePhase.title}...` : "Search transcript..."}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label="Search transcript"
            />
            {activePhase ? (
              <div className={styles.transcriptPhaseControl}>
                <button
                  type="button"
                  className={styles.transcriptPhaseArrow}
                  onClick={() => navigatePhase(-1)}
                  disabled={activePhaseIndex <= 0}
                  aria-label="Previous segment"
                  title="Previous segment"
                >
                  <ChevronLeft size={14} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className={styles.transcriptPhaseTrigger}
                  onClick={() => setPhaseMenuOpen((open) => !open)}
                  aria-expanded={phaseMenuOpen}
                  aria-haspopup="listbox"
                  aria-label={`Segment ${activePhaseIndex + 1} of ${phaseCount}: ${activePhase.title}`}
                >
                  <span className={styles.transcriptPhaseIndex}>{activePhaseIndex + 1}</span>
                  <span className={styles.transcriptPhaseCurrent}>
                    <span>Segment {activePhaseIndex + 1} of {phaseCount}</span>
                    <strong>{activePhase.title}</strong>
                  </span>
                  <ChevronDown
                    className={phaseMenuOpen ? styles.transcriptPhaseChevronOpen : undefined}
                    size={14}
                    aria-hidden="true"
                  />
                  <span className={styles.transcriptPhaseProgress} aria-hidden="true">
                    <span style={{ width: `${activePhaseProgress}%` }} />
                  </span>
                </button>
                <button
                  type="button"
                  className={styles.transcriptPhaseArrow}
                  onClick={() => navigatePhase(1)}
                  disabled={activePhaseIndex >= phaseCount - 1}
                  aria-label="Next segment"
                  title="Next segment"
                >
                  <ChevronRight size={14} aria-hidden="true" />
                </button>
              </div>
            ) : null}
          </div>
          {phaseMenuOpen && phases?.spans.length ? (
            <div className={styles.transcriptPhasePopover} role="listbox" aria-label="Transcript segments">
              <div className={styles.transcriptPhasePopoverHeader}>
                <div>
                  <strong>Transcript segments</strong>
                  <span>Jump to a section of the conversation</span>
                </div>
                <span>{phaseCount}</span>
              </div>
              <div className={styles.transcriptPhaseList}>
                {phases.spans.map((phase, index) => {
                  const isActive = phase.id === activePhase?.id;
                  return (
                    <button
                      key={phase.id}
                      type="button"
                      role="option"
                      aria-selected={isActive}
                      className={`${styles.transcriptPhaseOption} ${isActive ? styles.transcriptPhaseOptionActive : ""}`}
                      onClick={() => selectPhase(phase.startTime)}
                    >
                      <span className={styles.transcriptPhaseOptionIndex}>{index + 1}</span>
                      <span className={styles.transcriptPhaseOptionCopy}>
                        <span>
                          <strong>{phase.title}</strong>
                          <time>{formatSegmentTimeRange(phase.startTime, phase.endTime)}</time>
                        </span>
                        {phase.summary ? <small>{phase.summary}</small> : null}
                      </span>
                      {isActive ? <Check size={15} aria-hidden="true" /> : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
        {activeSegment && !readOnly ? (
          <div className={styles.transcriptToolbarActions}>
            <button
              type="button"
              className={styles.transcriptToolbarAction}
              onClick={() => openInlineCompose(activeSegment)}
              title="Comment on the current line"
              aria-label="Comment on the current line"
            >
              <MessageSquare size={15} />
            </button>
            <button
              type="button"
              className={styles.transcriptToolbarAction}
              onClick={() => openKeyMomentCompose(activeSegment)}
              title="Mark the current line as a key moment"
              aria-label="Mark the current line as a key moment"
            >
              <Tag size={15} />
            </button>
          </div>
        ) : null}
      </div>

      <div className={styles.stageBody}>
        <div className={styles.transcriptScroll} ref={scrollRef} onScroll={handleScroll}>
          {filteredTranscript.length === 0 ? (
            <div className={styles.transcriptEmpty}>No transcript available yet.</div>
          ) : (
            filteredTranscript.map((seg, index) => {
              const palette = speakerMap.get(seg.speaker || "Speaker") ?? SPEAKER_PALETTE[0]!;
              const active = activeSegment?.id === seg.id;
              const segMoments = momentsBySegment.get(seg.id) ?? [];
              const segComments = commentsBySegment.get(seg.id) ?? [];
              const phase = phaseBySegmentId.get(seg.id);
              const prevPhase = index > 0
                ? phaseBySegmentId.get(filteredTranscript[index - 1]!.id)
                : undefined;
              const showSegmentHeader = phase && phase.id !== prevPhase?.id;
              const segmentNumber = phase
                ? (phases?.spans.findIndex((span) => span.id === phase.id) ?? -1) + 1
                : 0;

              return (
                <div key={seg.id}>
                  {showSegmentHeader && phase && (
                    <div className={styles.transcriptSegmentLandmark}>
                      <button
                        type="button"
                        className={styles.transcriptSegmentLandmarkButton}
                        onClick={() => seekTo(phase.startTime)}
                      >
                        <span className={styles.transcriptSegmentLandmarkIndex}>{segmentNumber}</span>
                        <span className={styles.transcriptSegmentLandmarkCopy}>
                          <span className={styles.transcriptSegmentLandmarkHead}>
                            <strong>{phase.title}</strong>
                            <span>{formatSegmentTimeRange(phase.startTime, phase.endTime)}</span>
                          </span>
                          {phase.summary ? (
                            <span className={styles.transcriptSegmentLandmarkSummary}>{phase.summary}</span>
                          ) : null}
                        </span>
                        <span className={styles.transcriptSegmentLandmarkMeta}>
                          {phase.location ? (
                            <span title={phase.location}>
                              <MapPin size={13} />
                              {phase.location}
                            </span>
                          ) : null}
                          {phase.highlights?.length ? (
                            <span title={`${phase.highlights.length} segment highlights`}>
                              <Sparkles size={13} />
                              {phase.highlights.length}
                            </span>
                          ) : null}
                          <ChevronRight size={15} aria-hidden="true" />
                        </span>
                      </button>
                    </div>
                  )}

                  <div
                    className={`${styles.transcriptBlock} ${active ? styles.transcriptBlockActive : ""}`}
                    ref={(node) => { rowRefs.current[seg.id] = node; }}
                  >
                    <div className={`${styles.transcriptRowWrap} ${useCommentLayout ? styles.transcriptRowWrapComments : ""}`}>
                    <div className={styles.transcriptTurn}>
                      <button
                        type="button"
                        className={styles.transcriptRow}
                        onClick={() => seekTo(seg.startTime)}
                        onDoubleClick={(event) => {
                          if (readOnly) return;
                          event.preventDefault();
                          openInlineCompose(seg);
                        }}
                      >
                        <span className={styles.transcriptAvatar} style={{ background: palette.soft, color: palette.color }}>
                          {initialsFor(labelForSpeaker(seg.speaker))}
                        </span>
                        <span className={styles.transcriptCopy}>
                          <span className={styles.transcriptMeta}>
                            <strong style={{ color: palette.color }}>{labelForSpeaker(seg.speaker)}</strong>
                            <span>{formatTime(seg.startTime)}</span>
                          </span>
                          <span className={styles.transcriptText}>{seg.text}</span>
                        </span>
                      </button>

                      {segMoments.length > 0 ? (
                        <div className={styles.transcriptMomentMarkers} aria-label="Key moments on this line">
                          {segMoments.map((moment) => (
                            <button
                              key={moment.id}
                              type="button"
                              className={`${styles.transcriptMomentMarker} ${selectedMomentId === moment.id ? styles.transcriptMomentMarkerActive : ""}`}
                              onClick={() => onMomentClick(moment)}
                              title={`Open key moment: ${moment.label}`}
                              aria-current={selectedMomentId === moment.id ? "true" : undefined}
                            >
                              <span className={styles.transcriptMomentMarkerIcon}>
                                <Sparkles size={14} aria-hidden="true" />
                              </span>
                              <span className={styles.transcriptMomentMarkerCopy}>
                                <span className={styles.transcriptMomentMarkerMeta}>
                                  <span>Key moment</span>
                                  <time>{formatTime(moment.timestamp)}</time>
                                </span>
                                <span className={styles.transcriptMomentMarkerText}>{moment.label}</span>
                              </span>
                              <ChevronRight className={styles.transcriptMomentMarkerChevron} size={15} aria-hidden="true" />
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>

                    {!readOnly && inlineCompose?.segmentId === seg.id && (
                      <InlineCommentComposer
                        sessionId={sessionId}
                        timestampSec={inlineCompose.timestampSec}
                        onPosted={() => setInlineCompose(null)}
                        onCancel={() => setInlineCompose(null)}
                        onCommentsUpdated={onCommentsUpdated}
                      />
                    )}

                    {!readOnly && keyMomentCompose?.segmentId === seg.id && (
                      <InlineKeyMomentComposer
                        sessionId={sessionId}
                        timestampSec={keyMomentCompose.timestampSec}
                        onPosted={() => setKeyMomentCompose(null)}
                        onCancel={() => setKeyMomentCompose(null)}
                        onCommentsUpdated={onCommentsUpdated}
                      />
                    )}

                    {showComments && segComments.map((comment) =>
                      !readOnly && editingCommentId === comment.id ? (
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
                            if (readOnly) return;
                            event.preventDefault();
                            event.stopPropagation();
                            setEditingCommentId(comment.id);
                          }}
                        >
                          <div className={styles.floatingCommentHead}>
                            <span className={styles.floatingCommentAvatar}>{initialsFor(comment.authorName)}</span>
                            <span className={styles.floatingCommentAuthor}>{comment.authorName}</span>
                            <span className={styles.floatingCommentTime}>{relativeTime(comment.createdAt)}</span>
                            {!readOnly && <span
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
                            </span>}
                          </div>
                          <p>{comment.body}</p>
                        </div>
                      )
                    )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className={styles.stageStatus} aria-live="polite">
        <span>{formatTime(currentTime)}</span>
        <span>{activeSegment ? `${labelForSpeaker(activeSegment.speaker)} speaking` : "Ready"}</span>
        <span>{formatTime(duration)}</span>
      </div>
    </div>
  );
}
