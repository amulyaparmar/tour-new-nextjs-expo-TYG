"use client";

import { useMemo } from "react";
import {
  ChevronDown,
  ChevronUp,
  MessageSquare,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  SkipBack,
  SkipForward,
} from "lucide-react";

import type { ConversationPhaseSegmentation } from "@tour/shared";
import { buildPhaseTracks, formatSegmentTimeRange } from "@tour/shared";

import { playerMarkerByType, playerSpeakerSegment, segmentTrackClasses } from "./session-detail-class-maps";
import { PlayerActiveCaption } from "./PlayerActiveCaption";
import styles from "./session-detail.module.css";
import {
  buildSpeakerTracks,
  formatTime,
  type SessionComment,
  type SessionMoment,
  type TranscriptSegment,
} from "./session-detail-utils";

type Props = {
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  moments: SessionMoment[];
  comments: SessionComment[];
  commentCount: number;
  commentNavIndex: number;
  commentNavTotal: number;
  showComments: boolean;
  activeComment: SessionComment | null;
  selectedCommentId: string | null;
  playbackRate: number;
  selectedMomentIndex: number;
  transcript: TranscriptSegment[];
  phases: ConversationPhaseSegmentation | null;
  onToggleComments: () => void;
  onCommentNavigate: (direction: -1 | 1) => void;
  onMomentNavigate: (direction: -1 | 1) => void;
  onMomentSelect: (moment: SessionMoment) => void;
  onPlaybackRate: () => void;
  onSeek: (seconds: number, options?: { play?: boolean }) => void;
  togglePlayback: () => void;
};

export function FloatingSessionPlayer({
  currentTime,
  duration,
  isPlaying,
  moments,
  comments,
  commentCount,
  commentNavIndex,
  commentNavTotal,
  showComments,
  activeComment,
  selectedCommentId,
  playbackRate,
  selectedMomentIndex,
  transcript,
  phases,
  onToggleComments,
  onCommentNavigate,
  onMomentNavigate,
  onMomentSelect,
  onPlaybackRate,
  onSeek,
  togglePlayback,
}: Props) {
  const speakerTracks = useMemo(() => buildSpeakerTracks(transcript, duration), [transcript, duration]);
  const phaseTracks = useMemo(() => buildPhaseTracks(phases, duration), [phases, duration]);
  const playheadPct = duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0;
  const activeMoment = moments[selectedMomentIndex] ?? null;
  const hasCommentNav = commentNavTotal > 0;

  const hasSideControls = moments.length > 0;

  return (
    <div className={`${styles.floatingPlayer} ${!hasSideControls ? styles.floatingPlayerCompact : ""}`}>
      {hasSideControls && (
        <div className={styles.playerSideControls}>
          {moments.length > 0 && (
            <div className={styles.playerMomentNav}>
              <span className={styles.playerNavLabel}>Moments</span>
              <button type="button" aria-label="Previous key moment" onClick={() => onMomentNavigate(-1)}>
                <ChevronUp size={14} />
              </button>
              <span>{selectedMomentIndex + 1}/{moments.length}</span>
              <button type="button" aria-label="Next key moment" onClick={() => onMomentNavigate(1)}>
                <ChevronDown size={14} />
              </button>
            </div>
          )}
        </div>
      )}

      <div className={styles.playerMain}>
        <div className={styles.playerCommentsNav}>
          <button
            type="button"
            className={`${styles.playerCommentsToggle} ${showComments ? styles.playerCommentsToggleActive : ""}`}
            onClick={onToggleComments}
            aria-pressed={showComments}
          >
            <MessageSquare size={14} />
            Comments{commentCount > 0 ? ` (${commentCount})` : ""}
          </button>
          {hasCommentNav && (
            <>
              <button
                type="button"
                className={styles.playerIconBtn}
                aria-label="Previous comment"
                onClick={() => onCommentNavigate(-1)}
              >
                <ChevronUp size={14} />
              </button>
              <span className={styles.playerCommentsNavCount}>
                {commentNavIndex + 1}/{commentNavTotal}
              </span>
              <button
                type="button"
                className={styles.playerIconBtn}
                aria-label="Next comment"
                onClick={() => onCommentNavigate(1)}
              >
                <ChevronDown size={14} />
              </button>
            </>
          )}
        </div>

        <div className={styles.playerTimelineStack}>
          <div className={styles.playerControlsCentered}>
            <button
              type="button"
              className={styles.playerIconBtn}
              onClick={() => onSeek(Math.max(0, currentTime - 10), { play: isPlaying })}
              aria-label="Go back 10 seconds"
            >
              <RotateCcw size={15} />
            </button>
            <button
              type="button"
              className={styles.playerIconBtn}
              onClick={() => onSeek(Math.max(0, currentTime - 15), { play: isPlaying })}
              aria-label="Rewind 15 seconds"
            >
              <SkipBack size={16} />
            </button>
            <button type="button" className={styles.playerPlay} onClick={togglePlayback} aria-label={isPlaying ? "Pause" : "Play"}>
              {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
            </button>
            <button
              type="button"
              className={styles.playerIconBtn}
              onClick={() => onSeek(currentTime + 15, { play: isPlaying })}
              aria-label="Skip forward 15 seconds"
            >
              <SkipForward size={16} />
            </button>
            <button
              type="button"
              className={styles.playerIconBtn}
              onClick={() => onSeek(currentTime + 10, { play: isPlaying })}
              aria-label="Go forward 10 seconds"
            >
              <RotateCw size={15} />
            </button>
            <button type="button" className={styles.playerSpeed} onClick={onPlaybackRate}>{playbackRate}x</button>
          </div>

          <div className={styles.playerTimes}>
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
          <div
            className={styles.playerProgress}
            onClick={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              const pct = (event.clientX - rect.left) / rect.width;
              onSeek(pct * duration, { play: isPlaying });
            }}
          >
            <div className={styles.playerProgressFill} style={{ width: `${playheadPct}%` }} />
            {moments.map((moment) => (
              <button
                key={moment.id}
                type="button"
                className={`${styles.playerMarker} ${playerMarkerByType[moment.type] ?? styles.playerMarkerMoment}`}
                style={{ left: `${duration > 0 ? Math.min(100, Math.max(0, (moment.timestamp / duration) * 100)) : 0}%` }}
                title={moment.label}
                onClick={(event) => {
                  event.stopPropagation();
                  onMomentSelect(moment);
                }}
              />
            ))}
            {showComments && comments.map((comment) => comment.timestampSec != null && (
              <button
                key={comment.id}
                type="button"
                className={`${styles.playerMarker} ${styles.playerMarkerComment} ${selectedCommentId === comment.id ? styles.playerMarkerActive : ""}`}
                style={{ left: `${duration > 0 ? Math.min(100, Math.max(0, (comment.timestampSec / duration) * 100)) : 0}%` }}
                title={comment.body}
                onClick={(event) => {
                  event.stopPropagation();
                  onSeek(comment.timestampSec!, { play: true });
                }}
              />
            ))}
          </div>

          {phaseTracks.length > 0 && (
            <div className={styles.playerSpeakerTimeline}>
              <div className={styles.playerSpeakerLane}>
                <span className={styles.playerSpeakerLaneLabel}>Tour</span>
                <div className={styles.playerSpeakerLaneTrack}>
                  {phaseTracks.map((segment) => {
                    const trackClass = segmentTrackClasses[segment.colorIndex % segmentTrackClasses.length]
                      ?? styles.playerPhaseSegmentDefault;
                    const tooltip = [
                      segment.title,
                      formatSegmentTimeRange(segment.startTime, segment.endTime),
                      segment.location ? `Location: ${segment.location}` : null,
                      segment.summary,
                    ].filter(Boolean).join(" · ");

                    return (
                      <button
                        key={segment.id}
                        type="button"
                        className={`${styles.playerSegmentBlock} ${trackClass}`}
                        style={{ left: `${segment.leftPct}%`, width: `${segment.widthPct}%` }}
                        title={tooltip}
                        aria-label={tooltip}
                        onClick={() => onSeek(segment.startTime, { play: isPlaying })}
                      />
                    );
                  })}
                  <span className={styles.playerSpeakerPlayhead} style={{ left: `${playheadPct}%` }} />
                </div>
              </div>
            </div>
          )}

          {speakerTracks.length > 0 && (
            <div className={styles.playerSpeakerTimeline}>
              {speakerTracks.map((track) => (
                <div key={track.speaker} className={styles.playerSpeakerLane}>
                  <span className={styles.playerSpeakerLaneLabel}>{track.speaker}</span>
                  <div className={styles.playerSpeakerLaneTrack}>
                    {track.segments.map((segment) => (
                      <span
                        key={segment.id}
                        className={playerSpeakerSegment[track.colorIndex] ?? styles.playerSpeakerSegment0}
                        style={{ left: `${segment.leftPct}%`, width: `${segment.widthPct}%` }}
                      />
                    ))}
                    <span className={styles.playerSpeakerPlayhead} style={{ left: `${playheadPct}%` }} />
                  </div>
                  <span className={styles.playerSpeakerLanePct}>{track.pct}%</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {(activeComment && showComments) ? (
        <PlayerActiveCaption
          key={activeComment.id}
          label="Comment"
          text={activeComment.body}
        />
      ) : activeMoment ? (
        <PlayerActiveCaption
          key={activeMoment.id}
          label="Key moment"
          phase={activeMoment.phase}
          text={activeMoment.label}
        />
      ) : null}
    </div>
  );
}
