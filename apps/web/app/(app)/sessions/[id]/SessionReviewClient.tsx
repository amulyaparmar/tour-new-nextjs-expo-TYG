"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { AnalysisResult } from "@tour/shared";
import { CheckSquare, ChevronRight, MessageSquare, Pause, Play, Scissors, Share2, SkipForward, Volume2 } from "lucide-react";
import { TranscriptReader } from "./TranscriptReader";

type TranscriptSegment = {
  id: string;
  sessionId: string;
  speaker: string;
  startTime: number;
  endTime: number;
  text: string;
};

type SessionScreenshot = {
  id: string;
  sessionId: string;
  timestamp: number;
  imageUrl: string;
  reason: "key_moment" | "interval";
  label: string;
};

type Props = {
  sessionId: string;
  videoUrl: string | null;
  audioUrl: string | null;
  recordingUrl?: string | null;
  duration: number;
  analysis: AnalysisResult;
  transcript: TranscriptSegment[];
  screenshots: SessionScreenshot[];
};

type Moment = {
  id: string;
  timestamp: number;
  label: string;
  type: "screenshot" | "key_moment" | "moment";
  transcriptQuote?: string;
  explanation?: string;
  screenshot?: SessionScreenshot;
  section?: string;
  sectionScore?: number;
};

const playbackRates = [0.75, 1, 1.25, 1.5, 2];

export function SessionReviewClient({
  sessionId,
  videoUrl,
  audioUrl,
  recordingUrl,
  duration,
  analysis,
  transcript,
  screenshots,
}: Props) {
  const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement | null>(null);
  const momentsListRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [loadedDuration, setLoadedDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [selectedMoment, setSelectedMoment] = useState<Moment | null>(null);

  const src = recordingUrl || audioUrl || videoUrl || "";
  const isVideo =
    /\.(mp4|webm|mov)(\?|$)/i.test(src) ||
    (!!videoUrl && !audioUrl && !recordingUrl?.includes("/recording"));
  const transcriptEnd = useMemo(() => {
    return transcript.reduce((max, seg) => Math.max(max, seg.endTime || seg.startTime), 0);
  }, [transcript]);
  const effectiveDuration = loadedDuration || duration || transcriptEnd;
  const [mediaError, setMediaError] = useState(false);

  const allMoments = useMemo(() => {
    const moments: Moment[] = [];

    for (const s of screenshots) {
      const section = findSectionForTimestamp(s.timestamp, effectiveDuration, analysis.sectionScores);
      moments.push({
        id: `ss-${s.id}`,
        timestamp: s.timestamp,
        label: s.label,
        type: s.reason === "key_moment" ? "key_moment" : "screenshot",
        screenshot: s,
        section: section?.section,
        sectionScore: section?.score,
        transcriptQuote: findNearestTranscript(s.timestamp, transcript)
      });
    }

    for (const m of analysis.exactMoments) {
      const sec = parseTimestampToSeconds(m.timestamp);
      if (sec < 0) continue;
      const alreadyCovered = moments.some((mo) => Math.abs(mo.timestamp - sec) < 5);
      if (alreadyCovered) continue;
      const section = findSectionForTimestamp(sec, effectiveDuration, analysis.sectionScores);
      moments.push({
        id: `em-${m.timestamp}`,
        timestamp: sec,
        label: m.explanation || m.timestamp,
        type: "moment",
        explanation: m.explanation,
        transcriptQuote: m.transcriptQuote || findNearestTranscript(sec, transcript),
        section: section?.section,
        sectionScore: section?.score
      });
    }

    moments.sort((a, b) => a.timestamp - b.timestamp);
    return moments;
  }, [screenshots, analysis, transcript, effectiveDuration]);

  const seekTo = useCallback((seconds: number, options?: { play?: boolean }) => {
    const clamped = effectiveDuration > 0
      ? Math.max(0, Math.min(effectiveDuration, seconds))
      : Math.max(0, seconds);

    if (mediaRef.current && Number.isFinite(clamped)) {
      mediaRef.current.currentTime = clamped;
      mediaRef.current.playbackRate = playbackRate;
      if (options?.play) {
        void mediaRef.current.play().then(() => setIsPlaying(true)).catch(() => undefined);
      }
    }
    setCurrentTime(clamped);
  }, [effectiveDuration, playbackRate]);

  const cyclePlaybackRate = useCallback(() => {
    setPlaybackRate((current) => {
      const index = playbackRates.indexOf(current);
      return playbackRates[(index + 1) % playbackRates.length] ?? 1;
    });
  }, []);

  const togglePlayback = useCallback(() => {
    const el = mediaRef.current;
    if (!el) return;
    el.playbackRate = playbackRate;
    if (el.paused) {
      void el.play().then(() => setIsPlaying(true)).catch(() => undefined);
    } else {
      el.pause();
      setIsPlaying(false);
    }
  }, [playbackRate]);

  const handleMomentClick = useCallback((moment: Moment) => {
    setSelectedMoment((prev) => prev?.id === moment.id ? null : moment);
    seekTo(moment.timestamp, { play: true });
  }, [seekTo]);

  useEffect(() => {
    if (mediaRef.current) {
      mediaRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate, src]);

  useEffect(() => {
    if (!momentsListRef.current || allMoments.length === 0) return;
    const idx = allMoments.findIndex((m, i) => {
      const next = allMoments[i + 1];
      return currentTime >= m.timestamp && (!next || currentTime < next.timestamp);
    });
    if (idx >= 0) {
      const el = momentsListRef.current.querySelector(`[data-moment-id="${allMoments[idx]?.id}"]`) as HTMLElement | undefined;
      el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [currentTime, allMoments]);

  if (!src) {
    return (
      <div className="sr-client">
        <div className="sa-card" style={{ padding: 20, textAlign: "center", color: "var(--slate-500)", fontSize: 13, fontWeight: 600 }}>
          No recording available for this session.
        </div>
      </div>
    );
  }

  if (mediaError) {
    return (
      <div className="sr-client">
        <div className="sa-card" style={{ padding: 20, textAlign: "center", color: "var(--red-700)", fontSize: 13, fontWeight: 600 }}>
          Could not load recording. Try refreshing the page.
        </div>
      </div>
    );
  }

  return (
    <div className="sr-client">
      <div className="sr-player-combined">
        <PlayerController
          allMoments={allMoments}
          currentTime={currentTime}
          duration={effectiveDuration}
          isPlaying={isPlaying}
          isVideo={isVideo}
          mediaRef={mediaRef}
          onMomentClick={handleMomentClick}
          onError={() => setMediaError(true)}
          onLoadedDuration={setLoadedDuration}
          onPlaybackRate={cyclePlaybackRate}
          onPlayingChange={setIsPlaying}
          onSeek={seekTo}
          onTimeChange={setCurrentTime}
          playbackRate={playbackRate}
          selectedMomentId={selectedMoment?.id ?? null}
          src={src}
          togglePlayback={togglePlayback}
        />

        <SessionTimeline
          analysis={analysis}
          duration={effectiveDuration}
        />
      </div>

      {selectedMoment && (
        <MomentDetail moment={selectedMoment} onClose={() => setSelectedMoment(null)} />
      )}

      <TimelineMoments
        currentTime={currentTime}
        moments={allMoments}
        onMomentClick={handleMomentClick}
        refObject={momentsListRef}
        selectedMomentId={selectedMoment?.id ?? null}
      />

      {transcript.length > 0 && (
        <TranscriptReader
          currentTime={currentTime}
          duration={effectiveDuration}
          seekTo={(seconds) => seekTo(seconds, { play: true })}
          summary={analysis.summary}
          transcript={transcript}
        />
      )}
    </div>
  );
}

function PlayerController({
  allMoments,
  currentTime,
  duration,
  isPlaying,
  isVideo,
  mediaRef,
  onMomentClick,
  onError,
  onLoadedDuration,
  onPlaybackRate,
  onPlayingChange,
  onSeek,
  onTimeChange,
  playbackRate,
  selectedMomentId,
  src,
  togglePlayback,
}: {
  allMoments: Moment[];
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  isVideo: boolean;
  mediaRef: RefObject<HTMLVideoElement | HTMLAudioElement | null>;
  onMomentClick: (moment: Moment) => void;
  onError: () => void;
  onLoadedDuration: (duration: number) => void;
  onPlaybackRate: () => void;
  onPlayingChange: (isPlaying: boolean) => void;
  onSeek: (seconds: number, options?: { play?: boolean }) => void;
  onTimeChange: (seconds: number) => void;
  playbackRate: number;
  selectedMomentId: string | null;
  src: string;
  togglePlayback: () => void;
}) {
  const handleLoadedMetadata = (element: HTMLVideoElement | HTMLAudioElement) => {
    element.playbackRate = playbackRate;
    onLoadedDuration(Number.isFinite(element.duration) ? element.duration : 0);
  };

  return (
    <div className="sr-player">
      <div className="video-preview-wrap">
        {isVideo ? (
          <>
            <video
              ref={mediaRef as RefObject<HTMLVideoElement>}
              playsInline
              className="video-preview-player"
              src={src}
              onEnded={() => {
                onTimeChange(duration);
                onPlayingChange(false);
              }}
              onError={onError}
              onLoadedMetadata={(e) => handleLoadedMetadata(e.currentTarget)}
              onPause={() => onPlayingChange(false)}
              onPlay={() => onPlayingChange(true)}
              onTimeUpdate={(e) => onTimeChange(e.currentTarget.currentTime)}
            >
              <track kind="captions" />
            </video>
            <UnifiedControls
              allMoments={allMoments}
              currentTime={currentTime}
              duration={duration}
              isPlaying={isPlaying}
              onMomentClick={onMomentClick}
              onPlaybackRate={onPlaybackRate}
              onSeek={onSeek}
              playbackRate={playbackRate}
              selectedMomentId={selectedMomentId}
              togglePlayback={togglePlayback}
            />
          </>
        ) : (
          <div className="sr-audio-controller">
            <audio
              ref={mediaRef as RefObject<HTMLAudioElement>}
              src={src}
              preload="metadata"
              onEnded={() => {
                onTimeChange(duration);
                onPlayingChange(false);
              }}
              onError={onError}
              onLoadedMetadata={(e) => handleLoadedMetadata(e.currentTarget)}
              onPause={() => onPlayingChange(false)}
              onPlay={() => onPlayingChange(true)}
              onTimeUpdate={(e) => onTimeChange(e.currentTarget.currentTime)}
            />
            <UnifiedControls
              allMoments={allMoments}
              currentTime={currentTime}
              duration={duration}
              isPlaying={isPlaying}
              onMomentClick={onMomentClick}
              onPlaybackRate={onPlaybackRate}
              onSeek={onSeek}
              playbackRate={playbackRate}
              selectedMomentId={selectedMomentId}
              togglePlayback={togglePlayback}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function UnifiedControls({
  allMoments,
  currentTime,
  duration,
  isPlaying,
  onMomentClick,
  onPlaybackRate,
  onSeek,
  playbackRate,
  selectedMomentId,
  togglePlayback,
}: {
  allMoments: Moment[];
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  onMomentClick: (moment: Moment) => void;
  onPlaybackRate: () => void;
  onSeek: (seconds: number, options?: { play?: boolean }) => void;
  playbackRate: number;
  selectedMomentId: string | null;
  togglePlayback: () => void;
}) {
  return (
    <div className="sr-controller-bar">
      <button
        onClick={togglePlayback}
        type="button"
        aria-label={isPlaying ? "Pause recording" : "Play recording"}
        className="sr-play-btn"
      >
        {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
      </button>

      <span className="sr-time">{formatTime(currentTime)}</span>

      <div
        className="sr-progress-bar"
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const pct = (e.clientX - rect.left) / rect.width;
          onSeek(pct * duration, { play: isPlaying });
        }}
      >
        <div className="sr-progress-fill" style={{ width: duration > 0 ? `${(currentTime / duration) * 100}%` : "0%" }} />
        {allMoments.map((m) => (
          <button
            key={m.id}
            className={`sr-audio-marker sr-audio-marker--${m.type} ${selectedMomentId === m.id ? "sr-audio-marker--active" : ""}`}
            style={{ left: `${clampPct(m.timestamp, duration)}%` }}
            title={`${formatTime(m.timestamp)} - ${m.label}`}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onMomentClick(m);
            }}
          />
        ))}
      </div>

      <span className="sr-time">{formatTime(duration)}</span>

      <button type="button" className="sr-skip-btn" onClick={() => onSeek(currentTime + 15, { play: isPlaying })} aria-label="Skip forward 15 seconds">
        <SkipForward size={16} />
      </button>

      <button type="button" className="sr-speed-btn sr-speed-btn--dark" onClick={onPlaybackRate} aria-label="Change playback speed">
        {playbackRate}x
      </button>
      <Volume2 size={16} className="sr-volume-icon" />
    </div>
  );
}

function SessionTimeline({
  analysis,
  duration,
}: {
  analysis: AnalysisResult;
  duration: number;
}) {
  if (duration <= 0) return null;

  return (
    <div className="vtl">
      <div className="vtl-sections">
        {analysis.sectionScores.map((sec, index) => {
          const c = scoreColor(sec.score);
          return (
            <div
              key={sec.section}
              className={`vtl-sec vtl-sec--${c}`}
              style={{ flex: timelineSectionFlex(sec.section, index, analysis.sectionScores.length) }}
              title={`${sec.section}: ${Math.round(sec.score / 10)}/10`}
            >
              <span className="vtl-sec-label">{formatTimelineSectionLabel(sec.section)}</span>
            </div>
          );
        })}
      </div>

      <div className="vtl-times">
        <span>0:00</span>
        <span>{formatTime(Math.floor(duration / 2))}</span>
        <span>{formatTime(Math.floor(duration))}</span>
      </div>

      <div className="vtl-legend">
        <span><span className="vtl-legend-dot vtl-legend-dot--key" /> Key moment</span>
        <span><span className="vtl-legend-dot vtl-legend-dot--shot" /> Screenshot</span>
        <span><span className="vtl-legend-dot vtl-legend-dot--green" /> Good</span>
        <span><span className="vtl-legend-dot vtl-legend-dot--amber" /> Fair</span>
        <span><span className="vtl-legend-dot vtl-legend-dot--red" /> Needs work</span>
      </div>
    </div>
  );
}

function MomentDetail({ moment, onClose }: { moment: Moment; onClose: () => void }) {
  return (
    <div className="sr-moment-detail">
      <div className="sr-moment-detail-header">
        <span className="sr-moment-detail-time">{formatTime(moment.timestamp)}</span>
        <span className={`sr-moment-detail-badge sr-moment-detail-badge--${moment.type}`}>
          {moment.type === "key_moment" ? "Key Moment" : moment.type === "screenshot" ? "Screenshot" : "Moment"}
        </span>
        {moment.section && moment.sectionScore != null && (
          <span className={`sr-moment-detail-score sr-moment-detail-score--${scoreColor(moment.sectionScore)}`}>
            {moment.section}: {Math.round(moment.sectionScore / 10)}/10
          </span>
        )}
        <button onClick={onClose} type="button" className="sr-moment-close" aria-label="Close moment detail">
          &times;
        </button>
      </div>
      <p className="sr-moment-detail-label">{moment.label}</p>
      {moment.screenshot && (
        <img src={moment.screenshot.imageUrl} alt={moment.label} className="sr-moment-detail-img" />
      )}
      {moment.transcriptQuote && (
        <blockquote className="sr-moment-detail-quote">
          &ldquo;{moment.transcriptQuote}&rdquo;
        </blockquote>
      )}
    </div>
  );
}

function TimelineMoments({
  currentTime,
  moments,
  onMomentClick,
  refObject,
  selectedMomentId,
}: {
  currentTime: number;
  moments: Moment[];
  onMomentClick: (moment: Moment) => void;
  refObject: RefObject<HTMLDivElement | null>;
  selectedMomentId: string | null;
}) {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

  if (moments.length === 0) return null;

  const toggleSelected = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <div ref={refObject} className="sr-moments-list">
      <h3 className="sr-moments-heading">Timeline Moments</h3>
      {selectedIds.size > 0 && (
        <div className="sr-moment-bulkbar">
          <span>{selectedIds.size} selected</span>
          <button type="button"><MessageSquare size={13} /> Leave comment</button>
          <button type="button"><Scissors size={13} /> Select as clip</button>
          <button type="button" onClick={() => setSelectedIds(new Set())}>Clear</button>
        </div>
      )}
      {moments.map((m) => {
        const isActive = selectedMomentId === m.id;
        const isNearPlayhead = Math.abs(m.timestamp - currentTime) < 3;
        const isSelected = selectedIds.has(m.id);
        const menuOpen = openMenuId === m.id;
        const commentType = m.sectionScore != null && m.sectionScore < 50 ? "Coach" : "Default";
        return (
          <div
            key={m.id}
            data-moment-id={m.id}
            className={`sr-moment-row ${isActive ? "sr-moment-row--active" : ""} ${isNearPlayhead ? "sr-moment-row--near" : ""} ${isSelected ? "sr-moment-row--selected" : ""}`}
          >
            <button
              type="button"
              className="sr-moment-row-main"
              onClick={() => onMomentClick(m)}
            >
              <span className="sr-moment-row-time">{formatTime(m.timestamp)}</span>
              <span className="sr-moment-row-body">
              <span className="sr-moment-row-label">{m.label}</span>
                {m.transcriptQuote && (
                  <span className="sr-moment-row-quote">
                    &ldquo;{m.transcriptQuote.slice(0, 100)}{m.transcriptQuote.length > 100 ? "..." : ""}&rdquo;
                  </span>
                )}
              </span>
            </button>
            {m.screenshot && (
              <img src={m.screenshot.imageUrl} alt="" className="sr-moment-row-thumb" />
            )}
            {m.sectionScore != null && (
              <span className={`sr-moment-row-score sr-moment-row-score--${scoreColor(m.sectionScore)}`}>
                {Math.round(m.sectionScore / 10)}/10
              </span>
            )}
            <div className="sr-moment-side-rail">
              <span className={`sr-moment-comment-pill ${commentType === "Coach" ? "sr-moment-comment-pill--coach" : ""}`}>
                {commentType}
              </span>
              <button
                type="button"
                className="sr-moment-menu-trigger"
                aria-label={`Open actions for ${formatTime(m.timestamp)}`}
                aria-expanded={menuOpen}
                onClick={(event) => {
                  event.stopPropagation();
                  setOpenMenuId((current) => current === m.id ? null : m.id);
                }}
              >
                <ChevronRight size={15} />
              </button>
            </div>
            {menuOpen && (
              <div className="sr-moment-action-popover">
                <button type="button"><MessageSquare size={14} /> Leave a comment</button>
                <button type="button"><Share2 size={14} /> Share as a clip</button>
                <button type="button"><Scissors size={14} /> Cut as a clip</button>
                <button type="button" onClick={() => toggleSelected(m.id)}><CheckSquare size={14} /> Select as a clip</button>
                <button type="button" onClick={() => toggleSelected(m.id)}><CheckSquare size={14} /> {isSelected ? "Deselect" : "Select"}</button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function formatTime(seconds: number) {
  const s = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function scoreColor(score: number) {
  return score >= 75 ? "green" : score >= 50 ? "amber" : "red";
}

function parseTimestampToSeconds(ts: string): number {
  const parts = ts.split(":").map(Number);
  if (parts.length === 2 && parts.every((n) => !isNaN(n))) return parts[0]! * 60 + parts[1]!;
  if (parts.length === 3 && parts.every((n) => !isNaN(n))) return parts[0]! * 3600 + parts[1]! * 60 + parts[2]!;
  return -1;
}

function clampPct(time: number, dur: number) {
  if (dur <= 0) return 0;
  return Math.min(Math.max((time / dur) * 100, 0), 100);
}

function formatTimelineSectionLabel(name: string): string {
  const normalized = name.toLowerCase();
  if (normalized.includes("greeting") || normalized.includes("introduction")) return "THE GREETING";
  if (normalized.includes("property") || normalized.includes("tour") || normalized.includes("demonstration")) return "PROPERTY TOUR";
  if (normalized.includes("closing")) return "CLOSING";
  if (normalized.includes("follow")) return "FOLLOW UP";
  if (normalized.includes("compliance") || normalized.includes("fair housing")) return "COMPLIANCE";
  return name.toUpperCase();
}

function timelineSectionFlex(name: string, index: number, sectionCount: number): string {
  if (sectionCount === 4) {
    const normalized = name.toLowerCase();
    if (normalized.includes("greeting") || normalized.includes("introduction")) return "1.25 1 0";
    if (normalized.includes("property") || normalized.includes("tour") || normalized.includes("demonstration")) return "4 1 0";
    if (normalized.includes("closing")) return "2 1 0";
    if (normalized.includes("follow")) return "1.1 1 0";
    return `${index === 1 ? 4 : 1.5} 1 0`;
  }

  return "1 1 0";
}

function findSectionForTimestamp(
  timestamp: number,
  duration: number,
  sectionScores: AnalysisResult["sectionScores"]
) {
  if (sectionScores.length === 0 || duration <= 0) return undefined;
  const sectionDuration = duration / sectionScores.length;
  const idx = Math.min(Math.floor(timestamp / sectionDuration), sectionScores.length - 1);
  return sectionScores[idx];
}

function findNearestTranscript(timestamp: number, transcript: TranscriptSegment[]): string | undefined {
  let best: TranscriptSegment | undefined;
  let bestDist = Infinity;
  for (const seg of transcript) {
    const dist = Math.abs(seg.startTime - timestamp);
    if (dist < bestDist) {
      bestDist = dist;
      best = seg;
    }
  }
  return bestDist < 15 ? best?.text : undefined;
}
