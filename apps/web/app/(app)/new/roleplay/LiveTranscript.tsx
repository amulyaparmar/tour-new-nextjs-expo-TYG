// @ts-nocheck
"use client";

// Live caption pane for an in-progress roleplay call.
// Receives final lines + the current partial line from RoleplaySession's
// vapi 'message' handler and renders them as chat bubbles, auto-scrolled.

import React, { useEffect, useRef } from "react";

export type LiveLine = {
  role: string;
  text: string;
  time?: number;
  endTime?: number;
  duration?: number;
  timingSource?: "vapi" | "live";
  live?: boolean; // turn still in progress — end/duration not yet real
};

const formatTimestamp = (value: unknown) => {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
};

const formatDuration = (value: unknown) => {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  const rounded = Math.round(seconds * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}s`;
};

export const LiveTranscript = ({
  lines,
  partial,
}: {
  lines: LiveLine[];
  partial: LiveLine | null;
}) => {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [lines, partial]);

  const Bubble = ({ role, text, time, endTime, duration, live, dim }: LiveLine & { dim?: boolean }) => {
    const isUser = role === "user";
    const startTimestamp = formatTimestamp(time);
    const endTimestamp = formatTimestamp(endTime);
    // A line whose turn is still open (live) or a streaming partial (dim) has
    // placeholder end/duration values — show only the start until it settles.
    const inProgress = !!live || !!dim;
    const totalDuration = formatDuration(
      Number.isFinite(Number(duration))
        ? duration
        : Number.isFinite(Number(time)) && Number.isFinite(Number(endTime))
          ? Number(endTime) - Number(time)
          : null
    );
    return (
      <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
        <div
          className={`max-w-[85%] rounded-lg px-3 py-2 text-sm leading-snug whitespace-pre-wrap ${
            isUser
              ? "bg-blue-500 text-white"
              : "bg-gray-100 text-gray-800 border border-gray-200"
          } ${dim ? "opacity-50 italic" : ""}`}
        >
          <div className={`mb-0.5 flex items-center justify-between gap-3 text-[10px] uppercase tracking-wide ${isUser ? "text-blue-100" : "text-gray-400"}`}>
            <span>{isUser ? "You (agent)" : "Prospect (AI)"}</span>
            {startTimestamp && (
              <span
                className="normal-case tabular-nums tracking-normal"
                title={inProgress ? "Start time (still speaking)" : "Start time – end time · duration"}
              >
                Start <time dateTime={`PT${Math.floor(Number(time))}S`}>{startTimestamp}</time>
                {inProgress ? (
                  <span> · speaking…</span>
                ) : (
                  <>
                    {endTimestamp && (
                      <>
                        <span aria-hidden="true"> · </span>End{" "}
                        <time dateTime={`PT${Math.floor(Number(endTime))}S`}>{endTimestamp}</time>
                      </>
                    )}
                    {totalDuration && <span> · Duration {totalDuration}</span>}
                  </>
                )}
              </span>
            )}
          </div>
          {text}
        </div>
      </div>
    );
  };

  return (
    <div className="overflow-y-auto h-[min(44vh,24rem)] w-full rounded-md border border-gray-200 bg-white p-3">
      <div className="flex flex-col gap-2 pr-2">
        {lines.length === 0 && !partial && (
          <div className="text-sm text-gray-400 text-center py-8">
            Live captions will appear here once the call starts…
          </div>
        )}
        {lines.map((l, i) => (
          <Bubble
            key={i}
            role={l.role}
            text={l.text}
            time={l.time}
            endTime={l.endTime}
            duration={l.duration}
            live={l.live}
          />
        ))}
        {partial && (
          <Bubble
            role={partial.role}
            text={partial.text}
            time={partial.time}
            endTime={partial.endTime}
            duration={partial.duration}
            dim
          />
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
};
