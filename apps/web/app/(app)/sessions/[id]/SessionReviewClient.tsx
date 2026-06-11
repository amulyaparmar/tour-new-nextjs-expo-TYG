"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AnalysisResult, FollowUpAction } from "@tour/shared";
import { Pause, Play, Volume2 } from "lucide-react";

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
  actions: FollowUpAction[];
};

function formatTime(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
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
  return Math.min(Math.max((time / dur) * 100, 0), 100);
}

function abbreviate(name: string): string {
  const map: Record<string, string> = {
    "Greeting & Introduction": "Greeting",
    "Greeting": "Greeting",
    "Needs Discovery": "Discovery",
    "Tour & Demonstration": "Tour",
    "Personalization": "Personal.",
    "Objection Handling": "Objection",
    "Closing": "Closing",
    "Follow-Up": "Follow-Up",
    "Compliance / Fair Housing": "Compliance"
  };
  return map[name] ?? name.split(" ")[0] ?? name;
}

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
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [selectedMoment, setSelectedMoment] = useState<Moment | null>(null);
  const momentsListRef = useRef<HTMLDivElement>(null);

  const src = videoUrl || audioUrl || recordingUrl || `/api/local-uploads/${sessionId}.webm`;
  const isVideo = !!videoUrl || (!audioUrl && !recordingUrl && /\.(mp4|webm|mov)$/i.test(src));

  const allMoments = useMemo(() => {
    const moments: Moment[] = [];

    for (const s of screenshots) {
      const section = findSectionForTimestamp(s.timestamp, duration, analysis.sectionScores);
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
      const section = findSectionForTimestamp(sec, duration, analysis.sectionScores);
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
  }, [screenshots, analysis, transcript, duration]);

  const seekTo = useCallback((seconds: number) => {
    if (mediaRef.current) {
      mediaRef.current.currentTime = seconds;
      mediaRef.current.playbackRate = playbackRate;
      void mediaRef.current.play().then(() => setIsPlaying(true)).catch(() => undefined);
    }
    setCurrentTime(seconds);
  }, [playbackRate]);

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
    seekTo(moment.timestamp);
  }, [seekTo]);

  useEffect(() => {
    if (mediaRef.current) {
      mediaRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate, src]);

  // Auto-scroll moments list to track current playback
  useEffect(() => {
    if (!momentsListRef.current || allMoments.length === 0) return;
    const idx = allMoments.findIndex((m, i) => {
      const next = allMoments[i + 1];
      return currentTime >= m.timestamp && (!next || currentTime < next.timestamp);
    });
    if (idx >= 0) {
      const el = momentsListRef.current.children[idx] as HTMLElement | undefined;
      el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [currentTime, allMoments]);

  return (
    <div className="sr-client">
      {/* Player */}
      <div className="sr-player">
        <div className="video-preview-wrap">
          {isVideo ? (
            <>
              <video
                ref={mediaRef as React.RefObject<HTMLVideoElement>}
                controls
                playsInline
                className="video-preview-player"
                src={src}
                onLoadedMetadata={(e) => { e.currentTarget.playbackRate = playbackRate; }}
                onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
              >
                <track kind="captions" />
              </video>
              <div className="sr-video-tools">
                <span>{formatTime(currentTime)} / {formatTime(duration)}</span>
                <button type="button" className="sr-speed-btn" onClick={cyclePlaybackRate} aria-label="Change playback speed">
                  {playbackRate}x
                </button>
              </div>
            </>
          ) : (
            <div style={{ padding: "20px 16px", background: "var(--slate-900)", borderRadius: 12 }}>
              <audio
                ref={mediaRef as React.RefObject<HTMLAudioElement>}
                src={src}
                preload="metadata"
                onLoadedMetadata={(e) => { e.currentTarget.playbackRate = playbackRate; }}
                onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
              />
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <button
                  onClick={togglePlayback}
                  type="button"
                  style={{ width: 44, height: 44, borderRadius: "50%", background: "#006ce5", color: "white", border: "none", cursor: "pointer", display: "grid", placeItems: "center", flexShrink: 0, boxShadow: "0 8px 20px rgba(0,108,229,0.24)" }}
                >
                  {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
                </button>
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--slate-400)", fontVariantNumeric: "tabular-nums", minWidth: 36 }}>
                  {formatTime(currentTime)}
                </span>
                <div
                  style={{ flex: 1, height: 6, background: "var(--slate-700)", borderRadius: 9999, cursor: "pointer", position: "relative" }}
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const pct = (e.clientX - rect.left) / rect.width;
                    seekTo(pct * duration);
                  }}
                >
                  <div style={{ position: "absolute", inset: 0, right: "auto", width: duration > 0 ? `${(currentTime / duration) * 100}%` : "0%", background: "#006ce5", borderRadius: 9999, transition: "width 0.1s linear" }} />
                  {allMoments.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      aria-label={`Jump to ${formatTime(m.timestamp)}: ${m.label}`}
                      title={`${formatTime(m.timestamp)} - ${m.label}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        handleMomentClick(m);
                      }}
                      className={`sr-audio-marker ${selectedMoment?.id === m.id ? "sr-audio-marker--active" : ""}`}
                      style={{ left: `${clampPct(m.timestamp, duration)}%` }}
                    />
                  ))}
                </div>
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--slate-400)", fontVariantNumeric: "tabular-nums", minWidth: 36 }}>
                  {formatTime(duration)}
                </span>
                <button type="button" className="sr-speed-btn sr-speed-btn--dark" onClick={cyclePlaybackRate} aria-label="Change playback speed">
                  {playbackRate}x
                </button>
                <Volume2 size={16} style={{ color: "var(--slate-500)", flexShrink: 0 }} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Interactive Timeline Bar */}
      {duration > 0 && (
        <div className="vtl">
          <div className="vtl-sections">
            {analysis.sectionScores.map((sec) => {
              const c = scoreColor(sec.score);
              return (
                <div key={sec.section} className={`vtl-sec vtl-sec--${c}`} title={`${sec.section}: ${Math.round(sec.score / 10)}/10`}>
                  <span className="vtl-sec-label">{abbreviate(sec.section)}</span>
                </div>
              );
            })}
          </div>

          <div className="vtl-bar" onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const pct = (e.clientX - rect.left) / rect.width;
            seekTo(pct * duration);
          }}>
            <div className="vtl-track" />
            <div className="vtl-playhead" style={{ left: `${clampPct(currentTime, duration)}%` }} />
            {allMoments.map((m) => (
              <div
                key={m.id}
                className={`vtl-dot ${m.type === "key_moment" ? "vtl-dot--key" : m.type === "screenshot" ? "vtl-dot--shot" : "vtl-dot--moment"} ${selectedMoment?.id === m.id ? "vtl-dot--active" : ""}`}
                style={{ left: `${clampPct(m.timestamp, duration)}%` }}
                title={`${formatTime(m.timestamp)} - ${m.label}`}
                onClick={(e) => { e.stopPropagation(); handleMomentClick(m); }}
              />
            ))}
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
      )}

      {/* Moment Detail Popover */}
      {selectedMoment && (
        <div style={{ border: "1px solid var(--slate-200)", borderRadius: 8, background: "white", padding: 12, boxShadow: "0 4px 12px rgba(0,0,0,.08)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--slate-700)", fontVariantNumeric: "tabular-nums" }}>
              {formatTime(selectedMoment.timestamp)}
            </span>
            <span style={{
              fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 9999, textTransform: "uppercase", letterSpacing: ".3px",
              background: selectedMoment.type === "key_moment" ? "var(--amber-100)" : selectedMoment.type === "screenshot" ? "var(--indigo-100)" : "var(--slate-100)",
              color: selectedMoment.type === "key_moment" ? "var(--amber-700)" : selectedMoment.type === "screenshot" ? "var(--indigo-600)" : "var(--slate-600)"
            }}>
              {selectedMoment.type === "key_moment" ? "Key Moment" : selectedMoment.type === "screenshot" ? "Screenshot" : "Moment"}
            </span>
            {selectedMoment.section && selectedMoment.sectionScore != null && (
              <span style={{
                fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 9999,
                background: selectedMoment.sectionScore >= 75 ? "var(--green-100)" : selectedMoment.sectionScore >= 50 ? "var(--amber-100)" : "var(--red-100)",
                color: selectedMoment.sectionScore >= 75 ? "var(--green-700)" : selectedMoment.sectionScore >= 50 ? "var(--amber-700)" : "var(--red-700)"
              }}>
                {selectedMoment.section}: {Math.round(selectedMoment.sectionScore / 10)}/10
              </span>
            )}
            <button
              onClick={() => setSelectedMoment(null)}
              type="button"
              style={{ marginLeft: "auto", border: "none", background: "none", cursor: "pointer", fontSize: 18, color: "var(--slate-400)", lineHeight: 1 }}
            >
              &times;
            </button>
          </div>
          <p style={{ fontSize: 13, color: "var(--slate-700)", marginBottom: 6, margin: "0 0 6px" }}>{selectedMoment.label}</p>
          {selectedMoment.screenshot && (
            <img src={selectedMoment.screenshot.imageUrl} alt={selectedMoment.label} style={{ width: "100%", maxHeight: 160, objectFit: "cover", borderRadius: 4, marginBottom: 6 }} />
          )}
          {selectedMoment.transcriptQuote && (
            <blockquote style={{ fontSize: 12, color: "var(--slate-500)", fontStyle: "italic", borderLeft: "2px solid var(--slate-200)", paddingLeft: 8, margin: 0 }}>
              &ldquo;{selectedMoment.transcriptQuote}&rdquo;
            </blockquote>
          )}
        </div>
      )}

      {/* Scrollable Moments List */}
      {allMoments.length > 0 && (
        <div
          ref={momentsListRef}
          style={{ maxHeight: 320, overflowY: "auto", border: "1px solid var(--slate-200)", borderRadius: 8, background: "white" }}
        >
          <h3 style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".3px", color: "var(--slate-500)", padding: "10px 12px 6px", margin: 0, position: "sticky", top: 0, background: "white", zIndex: 1, borderBottom: "1px solid var(--slate-100)" }}>
            Timeline Moments
          </h3>
          {allMoments.map((m) => {
            const isActive = selectedMoment?.id === m.id;
            const isNearPlayhead = Math.abs(m.timestamp - currentTime) < 3;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => handleMomentClick(m)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  width: "100%",
                  padding: "8px 12px",
                  border: "none",
                  borderBottom: "1px solid var(--slate-100)",
                  background: isActive ? "#f3f8ff" : isNearPlayhead ? "#fefce8" : "none",
                  borderLeft: isActive ? "3px solid #006ce5" : "none",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "background 0.1s"
                }}
              >
                <span style={{ fontSize: 12, fontWeight: 700, color: "var(--slate-500)", fontVariantNumeric: "tabular-nums", minWidth: 38, flexShrink: 0 }}>
                  {formatTime(m.timestamp)}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--slate-700)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {m.label}
                  </span>
                  {m.transcriptQuote && (
                    <span style={{ display: "block", fontSize: 11, color: "var(--slate-400)", fontStyle: "italic", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      &ldquo;{m.transcriptQuote.slice(0, 100)}{m.transcriptQuote.length > 100 ? "..." : ""}&rdquo;
                    </span>
                  )}
                </div>
                {m.screenshot && (
                  <img src={m.screenshot.imageUrl} alt="" style={{ width: 48, height: 32, objectFit: "cover", borderRadius: 4, flexShrink: 0 }} />
                )}
                {m.sectionScore != null && (
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 9999, flexShrink: 0,
                    background: m.sectionScore >= 75 ? "var(--green-100)" : m.sectionScore >= 50 ? "var(--amber-100)" : "var(--red-100)",
                    color: m.sectionScore >= 75 ? "var(--green-700)" : m.sectionScore >= 50 ? "var(--amber-700)" : "var(--red-700)"
                  }}>
                    {Math.round(m.sectionScore / 10)}/10
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function findSectionForTimestamp(
  timestamp: number,
  duration: number,
  sectionScores: AnalysisResult["sectionScores"]
) {
  if (sectionScores.length === 0) return undefined;
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
