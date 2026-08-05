// @ts-nocheck
"use client";

// Turn-by-turn transcript with an optional recording player. Takes normalized
// entries [{ type: 'bot' | 'user', message }] and an optional summary, with a
// simple Transcript / Summary toggle. When `recordingUrl` is set, a player
// renders above the tabs; bubbles whose timing is real call timing
// (`timingSource`) seek the recording on click and highlight in sync.

import { Pause, Play, RotateCcw } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";

const PLAYBACK_RATES = [1, 1.25, 1.5, 2];
// How long after a manual list scroll the auto-follow stays out of the way.
const FOLLOW_SUPPRESS_MS = 4000;

const formatTimestamp = (value) => {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
};

const formatDuration = (value) => {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  const rounded = Math.round(seconds * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}s`;
};

export const TranscriptView = ({
  entries,
  summary,
  recordingUrl,
  seekControlRef,
  onPlayabilityChange,
}) => {
  const [tab, setTab] = useState("transcript");
  const list = Array.isArray(entries) ? entries.filter((e) => (e?.message ?? "").trim()) : [];

  const rootRef = useRef(null);
  const audioRef = useRef(null);
  const listRef = useRef(null);
  // Seeks requested before the audio metadata has loaded are applied on
  // loadedmetadata — assigning currentTime earlier is ignored by some browsers.
  const pendingSeekRef = useRef(null);
  const programmaticScrollUntilRef = useRef(0);
  const userScrolledAtRef = useRef(0);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [audioFailed, setAudioFailed] = useState(false);
  const [rateIndex, setRateIndex] = useState(0);
  // While the seek bar is being dragged, the seek is only committed on
  // release — every in-flight range request costs a server-side Vapi fetch.
  const [scrubTime, setScrubTime] = useState(null);

  // Legacy history rows stored the turn index in `time`, so seeking/syncing is
  // gated on timingSource just like the timestamp labels below.
  const syncable =
    Boolean(recordingUrl) &&
    !audioFailed &&
    list.some((e) => e.timingSource && Number.isFinite(Number(e.time)));

  // Chronologically-latest started turn, not last in array order — live
  // capture can commit a backdated bubble after a later-starting one.
  let activeIndex = -1;
  let activeStart = -Infinity;
  if (syncable && (playing || currentTime > 0)) {
    list.forEach((e, i) => {
      const start = Number(e.time);
      if (e.timingSource && Number.isFinite(start) && start <= currentTime + 0.05 && start >= activeStart) {
        activeStart = start;
        activeIndex = i;
      }
    });
  }

  // Follow the playhead by scrolling ONLY the transcript list (scrollIntoView
  // would also yank every scrollable ancestor, i.e. the page), and stand down
  // while the user is reading elsewhere in the list.
  useEffect(() => {
    if (!playing || activeIndex < 0 || tab !== "transcript") return;
    if (Date.now() - userScrolledAtRef.current < FOLLOW_SUPPRESS_MS) return;
    const container = listRef.current;
    const child = container?.children?.[activeIndex];
    if (!container || !child) return;
    const childTop = child.offsetTop;
    const childBottom = childTop + child.offsetHeight;
    const viewTop = container.scrollTop;
    const viewBottom = viewTop + container.clientHeight;
    if (childTop < viewTop || childBottom > viewBottom) {
      programmaticScrollUntilRef.current = Date.now() + 800;
      container.scrollTo({
        top: Math.max(0, childTop - container.clientHeight / 2),
        behavior: "smooth",
      });
    }
  }, [activeIndex, playing, tab]);

  // Collapsing the surrounding <details> hides every control — don't leave
  // the audio running with no way to stop it.
  useEffect(() => {
    if (!recordingUrl || audioFailed) return;
    const details = rootRef.current?.closest("details");
    if (!details) return;
    const onToggle = () => {
      if (!details.open) audioRef.current?.pause();
    };
    details.addEventListener("toggle", onToggle);
    return () => details.removeEventListener("toggle", onToggle);
  }, [recordingUrl, audioFailed]);

  const seekTo = (seconds, { autoplay = false } = {}) => {
    const audio = audioRef.current;
    if (!audio) return;
    const target = Math.max(0, Number(seconds) || 0);
    if (audio.readyState > 0) {
      audio.currentTime = target;
    } else {
      pendingSeekRef.current = target;
    }
    setCurrentTime(target);
    if (autoplay) audio.play().catch(() => {});
  };

  // Lets sections OUTSIDE this component (checkpoint chips, feedback moments)
  // drive the player. Reassigned every render so the closure is never stale;
  // opens the surrounding <details> first — a seek into a collapsed transcript
  // would otherwise play audio with every control hidden. When the recording
  // is unavailable (no url, or the audio errored) the handle is null so
  // callers can downgrade their chips instead of showing dead play buttons —
  // the same gate the bubble seeks apply via `syncable`.
  const seekAvailable = Boolean(recordingUrl) && !audioFailed;
  useEffect(() => {
    if (!seekControlRef) return;
    seekControlRef.current = !seekAvailable
      ? null
      : (seconds) => {
          const details = rootRef.current?.closest("details");
          if (details && !details.open) details.open = true;
          seekTo(seconds, { autoplay: true });
        };
    return () => {
      seekControlRef.current = null;
    };
  });

  // Mirrors availability to the parent as STATE so it can re-render chips
  // (a ref change alone can't trigger that). Fires on mount, on audio error,
  // and on retry.
  useEffect(() => {
    onPlayabilityChange?.(seekAvailable);
  }, [seekAvailable]);

  const commitScrub = () => {
    if (scrubTime === null) return;
    seekTo(scrubTime);
    setScrubTime(null);
  };

  const togglePlayback = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) audio.play().catch(() => {});
    else audio.pause();
  };

  const cyclePlaybackRate = () => {
    const next = (rateIndex + 1) % PLAYBACK_RATES.length;
    setRateIndex(next);
    if (audioRef.current) audioRef.current.playbackRate = PLAYBACK_RATES[next];
  };

  const retryAudio = () => {
    pendingSeekRef.current = null;
    setAudioFailed(false);
    setPlaying(false);
    setAudioDuration(0);
    setCurrentTime(0);
  };

  const bubbleSeek = (seconds) => (event) => {
    // Selecting bubble text to copy it must not hijack playback.
    if (typeof window !== "undefined" && window.getSelection?.()?.toString()) return;
    event?.stopPropagation?.();
    seekTo(seconds, { autoplay: true });
  };

  const displayTime = scrubTime ?? currentTime;

  return (
    <div ref={rootRef}>
      {recordingUrl && (
        <div className="mb-3">
          {audioFailed ? (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-gray-300 bg-gray-50 px-3 py-2 text-xs text-gray-500">
              <span>
                The call recording couldn't be loaded — it may have been removed, or the
                connection hiccuped.
              </span>
              <button
                type="button"
                onClick={retryAudio}
                className="flex shrink-0 items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 font-medium text-gray-600 hover:border-gray-300 hover:text-gray-900"
              >
                <RotateCcw size={11} /> Retry
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
              <audio
                ref={audioRef}
                src={recordingUrl}
                preload="metadata"
                onLoadedMetadata={(event) => {
                  setAudioDuration(event.currentTarget.duration || 0);
                  event.currentTarget.playbackRate = PLAYBACK_RATES[rateIndex];
                  if (pendingSeekRef.current != null) {
                    event.currentTarget.currentTime = pendingSeekRef.current;
                    pendingSeekRef.current = null;
                  }
                }}
                onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onEnded={() => setPlaying(false)}
                onError={() => {
                  setPlaying(false);
                  setAudioFailed(true);
                }}
              />
              <button
                type="button"
                onClick={togglePlayback}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white hover:bg-blue-700"
                aria-label={playing ? "Pause recording" : "Play recording"}
              >
                {playing ? <Pause size={14} /> : <Play size={14} className="ml-0.5" />}
              </button>
              <span className="text-xs tabular-nums text-gray-600">
                {formatTimestamp(displayTime) ?? "0:00"}
              </span>
              <input
                type="range"
                min={0}
                max={audioDuration || 0}
                step={0.1}
                value={Math.min(displayTime, audioDuration || displayTime)}
                onChange={(event) => setScrubTime(Number(event.target.value))}
                onPointerUp={commitScrub}
                onMouseUp={commitScrub}
                onTouchEnd={commitScrub}
                onKeyUp={commitScrub}
                disabled={!audioDuration}
                className="h-1.5 min-w-0 flex-1 cursor-pointer accent-blue-600 disabled:cursor-default"
                aria-label="Seek recording"
              />
              <span className="text-xs tabular-nums text-gray-400">
                {formatTimestamp(audioDuration) ?? "0:00"}
              </span>
              <button
                type="button"
                onClick={cyclePlaybackRate}
                className="w-10 shrink-0 rounded-md border border-gray-200 bg-white px-1 py-0.5 text-[11px] font-medium tabular-nums text-gray-600 hover:border-gray-300 hover:text-gray-900"
                title="Playback speed"
              >
                {PLAYBACK_RATES[rateIndex]}×
              </button>
            </div>
          )}
        </div>
      )}

      <div className="flex gap-4 mb-3 text-[11px] uppercase tracking-wide">
        <button
          onClick={() => setTab("transcript")}
          className={tab === "transcript" ? "text-gray-900 font-semibold" : "text-gray-400 hover:text-gray-600"}
        >
          Transcript
        </button>
        {summary && (
          <button
            onClick={() => setTab("summary")}
            className={tab === "summary" ? "text-gray-900 font-semibold" : "text-gray-400 hover:text-gray-600"}
          >
            Summary
          </button>
        )}
      </div>

      {tab === "summary" && summary ? (
        <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{summary}</div>
      ) : (
        <div
          ref={listRef}
          onScroll={() => {
            if (Date.now() > programmaticScrollUntilRef.current) {
              userScrolledAtRef.current = Date.now();
            }
          }}
          className="relative flex flex-col gap-2 max-h-[28rem] overflow-y-auto pr-1"
        >
          {list.length === 0 && <div className="text-sm text-gray-400">No transcript available.</div>}
          {list.map((e, i) => {
            const isUser = e.type === "user";
            // Legacy history rows stored the turn index in `time`; only show a
            // timestamp when the source confirms it is real call timing.
            const startTimestamp = e.timingSource ? formatTimestamp(e.time) : null;
            const endTimestamp = e.timingSource ? formatTimestamp(e.endTime) : null;
            const totalDuration = e.timingSource
              ? formatDuration(
                  Number.isFinite(Number(e.duration))
                    ? e.duration
                    : Number.isFinite(Number(e.time)) && Number.isFinite(Number(e.endTime))
                      ? Number(e.endTime) - Number(e.time)
                      : null
                )
              : null;
            const clickable = syncable && e.timingSource && Number.isFinite(Number(e.time));
            const isActive = i === activeIndex;
            return (
              <div key={i} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                <div
                  onClick={clickable ? bubbleSeek(e.time) : undefined}
                  title={clickable ? `Play recording from ${formatTimestamp(e.time)}` : undefined}
                  className={`max-w-[85%] rounded-lg px-3 py-2 text-sm leading-snug whitespace-pre-wrap ${
                    isUser
                      ? "bg-blue-500 text-white"
                      : "bg-gray-100 text-gray-800 border border-gray-200"
                  } ${clickable ? "cursor-pointer" : ""} ${
                    isActive ? "ring-2 ring-blue-400 ring-offset-1" : ""
                  }`}
                >
                  <div
                    className={`mb-0.5 flex items-center justify-between gap-3 text-[10px] uppercase tracking-wide ${
                      isUser ? "text-blue-100" : "text-gray-400"
                    }`}
                  >
                    <span className="flex items-center gap-1.5">
                      {clickable && (
                        <button
                          type="button"
                          onClick={bubbleSeek(e.time)}
                          aria-label={`Play recording from ${formatTimestamp(e.time)}`}
                          className={`-my-0.5 rounded p-0.5 ${
                            isUser ? "text-blue-100 hover:text-white" : "text-gray-400 hover:text-gray-700"
                          }`}
                        >
                          <Play size={10} />
                        </button>
                      )}
                      {isUser ? "You (agent)" : "Prospect (AI)"}
                    </span>
                    {startTimestamp && (
                      <span className="normal-case tabular-nums tracking-normal" title="Start time – end time · duration">
                        Start <time dateTime={`PT${Math.floor(Number(e.time))}S`}>{startTimestamp}</time>
                        {endTimestamp && (
                          <>
                            <span aria-hidden="true"> · </span>End{" "}
                            <time dateTime={`PT${Math.floor(Number(e.endTime))}S`}>{endTimestamp}</time>
                          </>
                        )}
                        {totalDuration && <span> · Duration {totalDuration}</span>}
                      </span>
                    )}
                  </div>
                  {e.message}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// Normalizes either live lines [{role,text}] or stored transcript_json
// [{type,message}] into TranscriptView's entries, preserving timing when the
// post-call artifact provides it.
export const toTranscriptEntries = (input) =>
  (input || []).map((x) => ({
    type: x.role === "user" || x.role === "customer" || x.type === "user" ? "user" : "bot",
    message: x.text ?? x.message ?? "",
    ...(Number.isFinite(Number(x.time)) ? { time: Number(x.time) } : {}),
    ...(Number.isFinite(Number(x.endTime)) ? { endTime: Number(x.endTime) } : {}),
    ...(Number.isFinite(Number(x.duration)) ? { duration: Number(x.duration) } : {}),
    ...(x.timingSource ? { timingSource: x.timingSource } : {}),
  }));
