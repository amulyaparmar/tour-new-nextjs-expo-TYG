"use client";

import { useEffect, useMemo, useState } from "react";
import { MapPin } from "lucide-react";

import type { ConversationPhaseSegmentation } from "@tour/shared";
import {
  buildPhaseTracks,
  findPhaseForTimestamp,
  formatSegmentTimeRange,
  tourSegmentColor,
  type PhaseTrackSegment,
} from "@tour/shared";

import styles from "./session-detail.module.css";

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  if (m <= 0) return `${s}s`;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

function segmentDuration(segment: PhaseTrackSegment): number {
  return Math.max(0, segment.endTime - segment.startTime);
}

export function TourSegmentSummary({
  phases,
  duration,
  currentTime = 0,
  onSeek,
}: {
  phases: ConversationPhaseSegmentation | null;
  duration: number;
  currentTime?: number;
  onSeek?: (seconds: number) => void;
}) {
  const tracks = useMemo(() => buildPhaseTracks(phases, duration), [phases, duration]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const playheadPct = duration > 0
    ? Math.min(100, Math.max(0, (currentTime / duration) * 100))
    : 0;

  const activeSpan = useMemo(
    () => findPhaseForTimestamp(currentTime, phases),
    [currentTime, phases]
  );

  useEffect(() => {
    if (activeSpan?.id) {
      setSelectedId(activeSpan.id);
    }
  }, [activeSpan?.id]);

  const selectedTrack = useMemo(() => {
    if (selectedId) {
      const match = tracks.find((track) => track.id === selectedId);
      if (match) return match;
    }
    if (activeSpan) {
      return tracks.find((track) => track.id === activeSpan.id) ?? tracks[0] ?? null;
    }
    return tracks[0] ?? null;
  }, [activeSpan, selectedId, tracks]);

  if (tracks.length === 0) return null;

  const totalSpanSeconds = tracks.reduce((sum, track) => sum + segmentDuration(track), 0);

  return (
    <div
      className={styles.tourSegmentSummary}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <div className={styles.tourSegmentHead}>
        <span className={styles.tourSegmentEyebrow}>Tour flow</span>
        <span className={styles.tourSegmentMeta}>
          {tracks.length} sections · {formatDuration(duration || totalSpanSeconds)}
        </span>
      </div>

      <div className={styles.tourSegmentTimeline} role="img" aria-label="Tour segment timeline">
        <div className={styles.tourSegmentTimelineTrack}>
          {tracks.map((segment, index) => {
            const color = tourSegmentColor(index);
            const isActive = selectedTrack?.id === segment.id;
            const pct = totalSpanSeconds > 0
              ? Math.round((segmentDuration(segment) / totalSpanSeconds) * 100)
              : 0;

            return (
              <button
                key={segment.id}
                type="button"
                className={`${styles.tourSegmentBlock} ${isActive ? styles.tourSegmentBlockActive : ""}`}
                style={{
                  left: `${segment.leftPct}%`,
                  width: `${Math.max(segment.widthPct, 1.2)}%`,
                  backgroundColor: color,
                }}
                title={`${segment.title} (${formatSegmentTimeRange(segment.startTime, segment.endTime)})`}
                aria-pressed={isActive}
                onClick={() => {
                  setSelectedId(segment.id);
                  onSeek?.(segment.startTime);
                }}
              >
                <span className={styles.tourSegmentBlockLabel}>{pct}%</span>
              </button>
            );
          })}
          {duration > 0 && (
            <span className={styles.tourSegmentPlayhead} style={{ left: `${playheadPct}%` }} />
          )}
        </div>
        <div className={styles.tourSegmentTimelineAxis}>
          <span>0:00</span>
          <span>{formatDuration(duration || totalSpanSeconds)}</span>
        </div>
      </div>

      {selectedTrack && (
        <div className={styles.tourSegmentFocus}>
          <div className={styles.tourSegmentFocusHead}>
            <span
              className={styles.tourSegmentSwatch}
              style={{ backgroundColor: tourSegmentColor(selectedTrack.colorIndex) }}
            />
            <div className={styles.tourSegmentFocusTitle}>
              <strong>{selectedTrack.title}</strong>
              <span>{formatSegmentTimeRange(selectedTrack.startTime, selectedTrack.endTime)}</span>
            </div>
          </div>
          {selectedTrack.location && (
            <p className={styles.tourSegmentLocation}>
              <MapPin size={12} />
              {selectedTrack.location}
            </p>
          )}
          <p className={styles.tourSegmentSummaryText}>{selectedTrack.summary}</p>
          {selectedTrack.highlights && selectedTrack.highlights.length > 0 && (
            <ul className={styles.tourSegmentHighlights}>
              {selectedTrack.highlights.slice(0, 3).map((highlight) => (
                <li key={highlight}>{highlight}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className={styles.tourSegmentList}>
        {tracks.map((segment, index) => {
          const color = tourSegmentColor(index);
          const isActive = selectedTrack?.id === segment.id;
          const share = totalSpanSeconds > 0
            ? (segmentDuration(segment) / totalSpanSeconds) * 100
            : 0;

          return (
            <button
              key={segment.id}
              type="button"
              className={`${styles.tourSegmentRow} ${isActive ? styles.tourSegmentRowActive : ""}`}
              aria-pressed={isActive}
              onClick={() => {
                setSelectedId(segment.id);
                onSeek?.(segment.startTime);
              }}
            >
              <span className={styles.tourSegmentRowIndex} style={{ color }}>{index + 1}</span>
              <span className={styles.tourSegmentRowBody}>
                <span className={styles.tourSegmentRowTitle}>{segment.title}</span>
                <span className={styles.tourSegmentRowRange}>
                  {formatSegmentTimeRange(segment.startTime, segment.endTime)}
                </span>
                <span className={styles.tourSegmentRowBar} aria-hidden>
                  <span
                    className={styles.tourSegmentRowBarFill}
                    style={{ width: `${share}%`, backgroundColor: color }}
                  />
                </span>
              </span>
              <span className={styles.tourSegmentRowPct}>{Math.round(share)}%</span>
            </button>
          );
        })}
      </div>

      {phases?.structureNotes && (
        <p className={styles.tourSegmentObservation}>
          <span>Key observation</span>
          {phases.structureNotes}
        </p>
      )}
    </div>
  );
}
