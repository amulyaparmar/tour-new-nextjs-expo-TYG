"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";

import type { PhaseTrackSegment } from "@tour/shared";
import { formatSegmentTimeRange, tourSegmentColor } from "@tour/shared";

import styles from "./session-detail.module.css";
import {
  formatTime,
  isDiscussionComment,
  type SessionComment,
  type SpeakerTrack,
  type UnifiedSpeakerSegment,
} from "./session-detail-utils";
import { playerSpeakerSegment, speakerLegendSwatch } from "./session-detail-class-maps";

const POPOVER_WIDTH = 280;
const POPOVER_EDGE_PADDING = 8;

type ScrubHover = {
  leftPct: number;
  seconds: number;
  segment: PhaseTrackSegment | null;
  popoverLeft: number;
  popoverWidth: number;
  arrowLeft: number;
};

function computePopoverLayout(containerWidth: number, cursorPct: number) {
  const popoverWidth = Math.min(
    POPOVER_WIDTH,
    Math.max(0, containerWidth - POPOVER_EDGE_PADDING * 2),
  );
  const cursorX = (cursorPct / 100) * containerWidth;
  const idealLeft = cursorX - popoverWidth / 2;
  const minLeft = POPOVER_EDGE_PADDING;
  const maxLeft = Math.max(minLeft, containerWidth - popoverWidth - POPOVER_EDGE_PADDING);
  const popoverLeft = Math.max(minLeft, Math.min(idealLeft, maxLeft));
  const arrowLeft = Math.max(12, Math.min(popoverWidth - 12, cursorX - popoverLeft));

  return { popoverLeft, popoverWidth, arrowLeft };
}

function findPhaseAtTime(seconds: number, tracks: PhaseTrackSegment[]): PhaseTrackSegment | null {
  return tracks.find((track) => seconds >= track.startTime && seconds <= track.endTime) ?? null;
}

function commentsInSegment(segment: PhaseTrackSegment, comments: SessionComment[]) {
  return comments.filter(
    (comment) =>
      comment.timestampSec != null
      && !comment.parentId
      && isDiscussionComment(comment)
      && comment.timestampSec >= segment.startTime
      && comment.timestampSec < segment.endTime,
  );
}

function scrubFromClientX(clientX: number, rect: DOMRect, duration: number) {
  const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  return {
    leftPct: pct * 100,
    seconds: pct * duration,
  };
}

export function PlayerProgressBar({
  duration,
  playheadPct,
  phaseTracks,
  isPlaying,
  markers,
  speakerSegments,
  speakerLegend,
  comments,
  onSeek,
}: {
  duration: number;
  playheadPct: number;
  phaseTracks: PhaseTrackSegment[];
  isPlaying: boolean;
  markers: ReactNode;
  speakerSegments: UnifiedSpeakerSegment[];
  speakerLegend: SpeakerTrack[];
  comments: SessionComment[];
  onSeek: (seconds: number, options?: { play?: boolean }) => void;
}) {
  const scrubRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<ScrubHover | null>(null);

  const updateHover = useCallback((clientX: number) => {
    const rect = scrubRef.current?.getBoundingClientRect();
    if (!rect || duration <= 0) return;
    const { leftPct, seconds } = scrubFromClientX(clientX, rect, duration);
    const layout = computePopoverLayout(rect.width, leftPct);
    setHover({
      leftPct,
      seconds,
      segment: findPhaseAtTime(seconds, phaseTracks),
      ...layout,
    });
  }, [duration, phaseTracks]);

  const seekFromClientX = useCallback((clientX: number, play?: boolean) => {
    const rect = scrubRef.current?.getBoundingClientRect();
    if (!rect || duration <= 0) return;
    const { seconds } = scrubFromClientX(clientX, rect, duration);
    onSeek(seconds, { play: play ?? isPlaying });
  }, [duration, isPlaying, onSeek]);

  const activeSegmentId = hover?.segment?.id ?? null;
  const hoverSegmentComments = hover?.segment ? commentsInSegment(hover.segment, comments) : [];

  return (
    <div
      ref={scrubRef}
      className={styles.playerScrubArea}
      onMouseMove={(event) => updateHover(event.clientX)}
      onMouseLeave={() => setHover(null)}
      onClick={(event) => {
        if ((event.target as HTMLElement).closest("[data-player-marker]")) return;
        seekFromClientX(event.clientX);
      }}
    >
      <div className={styles.playerProgress}>
        {phaseTracks.length > 0 ? (
          <div className={styles.playerPhaseRow} aria-hidden>
            {phaseTracks.map((segment, index) => (
              <div
                key={segment.id}
                className={`${styles.playerPhaseSlice} ${activeSegmentId === segment.id ? styles.playerPhaseSliceActive : ""}`}
                style={{
                  flex: `${Math.max(segment.endTime - segment.startTime, 0.5)} 1 0`,
                  backgroundColor: tourSegmentColor(index),
                }}
              />
            ))}
          </div>
        ) : (
          <div className={styles.playerProgressBackdrop} />
        )}

        <div className={styles.playerProgressPlayed} style={{ width: `${playheadPct}%` }} />
        <div className={styles.playerProgressKnob} style={{ left: `${playheadPct}%` }} />
        {markers}
      </div>

      {speakerSegments.length > 0 && (
        <div className={styles.playerUnifiedSpeaker}>
          <div className={styles.playerSpeakerLaneTrack}>
            {speakerSegments.map((segment) => (
              <span
                key={segment.id}
                className={playerSpeakerSegment[segment.colorIndex] ?? styles.playerSpeakerSegment0}
                style={{ left: `${segment.leftPct}%`, width: `${segment.widthPct}%` }}
              />
            ))}
            <span className={styles.playerSpeakerPlayhead} style={{ left: `${playheadPct}%` }} />
          </div>
          {speakerLegend.length > 0 && (
            <div className={styles.playerSpeakerLegend}>
              {speakerLegend.map((track) => (
                <span key={track.speaker} className={styles.playerSpeakerLegendItem}>
                  <span
                    className={`${styles.playerSpeakerLegendSwatch} ${
                      speakerLegendSwatch[track.colorIndex] ?? styles.playerSpeakerLegendSwatch0
                    }`}
                  />
                  {track.speaker}
                  <strong>{track.pct}%</strong>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {hover && (
        <div
          className={styles.playerPhasePopover}
          style={{
            left: hover.popoverLeft,
            width: hover.popoverWidth,
            ["--popover-arrow-left" as string]: `${hover.arrowLeft}px`,
          }}
          role="tooltip"
        >
          <strong>{formatTime(hover.seconds)}</strong>
          {hover.segment && (
            <span className={styles.playerPhasePopoverTitle}>
              {hover.segment.title}
              {" · "}
              {formatSegmentTimeRange(hover.segment.startTime, hover.segment.endTime)}
            </span>
          )}
          {hover.segment?.location && (
            <span className={styles.playerPhasePopoverMeta}>{hover.segment.location}</span>
          )}
          {hover.segment?.highlights && hover.segment.highlights.length > 0 && (
            <ul className={styles.playerPhasePopoverHighlights}>
              {hover.segment.highlights.map((highlight) => (
                <li key={highlight}>{highlight}</li>
              ))}
            </ul>
          )}
          {hoverSegmentComments.length > 0 && (
            <ul className={styles.playerPhasePopoverComments}>
              {hoverSegmentComments.map((comment) => (
                <li key={comment.id}>
                  <span className={styles.playerPhasePopoverCommentMeta}>
                    {comment.authorName}
                    {comment.timestampSec != null ? ` · ${formatTime(comment.timestampSec)}` : ""}
                  </span>
                  {comment.body}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {hover && (
        <span
          className={styles.playerScrubPreviewLine}
          style={{ left: `${hover.leftPct}%` }}
          aria-hidden
        />
      )}
    </div>
  );
}
