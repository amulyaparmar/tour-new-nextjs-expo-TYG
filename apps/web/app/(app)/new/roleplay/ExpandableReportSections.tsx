// @ts-nocheck
"use client";

import { Play } from "lucide-react";
import React from "react";
import {
  feedbackItemText,
  feedbackItemTime,
  formatMomentTimestamp,
} from "@/lib/roleplay/feedbackTimestamps";
import { TranscriptView } from "./TranscriptView";

const splitFeedbackItem = (value) => {
  const text = String(value ?? "").trim();
  if (text.length <= 120) return { lead: text, detail: "" };

  const sentenceBoundary = text.search(/[.!?]["']?\s+(?=[A-Z])/);
  if (sentenceBoundary >= 35 && sentenceBoundary <= 160) {
    const punctuationLength = /["']/.test(text[sentenceBoundary + 1] ?? "") ? 2 : 1;
    return {
      lead: text.slice(0, sentenceBoundary + punctuationLength),
      detail: text.slice(sentenceBoundary + punctuationLength).trim(),
    };
  }

  const clauseBoundaries = [text.indexOf(", ", 35), text.indexOf(": ", 35)]
    .filter((index) => index >= 35 && index <= 130)
    .sort((a, b) => a - b);
  if (clauseBoundaries.length > 0) {
    const boundary = clauseBoundaries[0];
    return {
      lead: text.slice(0, boundary),
      detail: text.slice(boundary + 2).trim(),
    };
  }

  const wordBoundary = text.lastIndexOf(" ", 110);
  if (wordBoundary > 35) {
    return {
      lead: `${text.slice(0, wordBoundary)}…`,
      detail: text.slice(wordBoundary + 1).trim(),
    };
  }

  return { lead: text, detail: "" };
};

// Items are plain strings (legacy rows) or FeedbackMoment objects
// ({text, evidenceQuote?, timeSeconds?}) from the timestamped grader schema.
// A resolved time renders a chip: strengths mark WHEN it happened, coaching
// tips mark WHEN they would have mattered; with onSeek it jumps the recording.
const MomentChip = ({ item, tone, onSeek }) => {
  const time = feedbackItemTime(item);
  const timestamp = formatMomentTimestamp(time);
  if (!timestamp) return null;
  const strength = tone === "strength";
  const label = timestamp;
  const quote = typeof item?.evidenceQuote === "string" && item.evidenceQuote ? `“${item.evidenceQuote}”` : undefined;
  if (onSeek) {
    return (
      <button
        type="button"
        onClick={() => onSeek(time)}
        title={quote ? `${quote} — play from here` : "Play the recording from this moment"}
        className={`inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ring-1 ${
          strength
            ? "bg-white/80 text-green-700 ring-green-200 hover:bg-white hover:text-green-900"
            : "bg-white/80 text-amber-700 ring-amber-200 hover:bg-white hover:text-amber-900"
        }`}
      >
        <Play size={9} aria-hidden="true" /> {label}
      </button>
    );
  }
  return (
    <span
      title={quote}
      className="inline-flex shrink-0 items-center rounded-full bg-white/70 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-gray-600"
    >
      {label}
    </span>
  );
};

const FeedbackItem = ({ item, index, tone, onSeek }) => {
  const { lead, detail } = splitFeedbackItem(feedbackItemText(item));
  const strength = tone === "strength";

  return (
    <li
      className={`rounded-lg border p-3 ${
        strength ? "border-green-100 bg-green-50/70" : "border-amber-100 bg-amber-50/70"
      }`}
    >
      <div className="flex items-start gap-2.5">
        <span
          aria-hidden="true"
          className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white ${
            strength ? "bg-green-600" : "bg-amber-600"
          }`}
        >
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className={`text-sm font-semibold leading-snug ${strength ? "text-green-950" : "text-amber-950"}`}>
              {lead}
            </p>
            <MomentChip item={item} tone={tone} onSeek={onSeek} />
          </div>
          {detail && (
            <p className="mt-1.5 text-sm leading-relaxed text-gray-600">{detail}</p>
          )}
        </div>
      </div>
    </li>
  );
};

export const OverallFeedbackDetails = ({ strengths = [], suggestions = [], onSeek }) => {
  if (strengths.length === 0 && suggestions.length === 0) return null;

  return (
    <details open className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <summary className="cursor-pointer px-4 py-3.5 text-sm font-semibold text-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500">
        More overall feedback
        <span className="ml-2 font-normal text-gray-400">
          {strengths.length} strengths · {suggestions.length} tips
        </span>
      </summary>
      <div className="grid grid-cols-1 gap-4 border-t border-gray-100 p-4 md:grid-cols-2">
        <div>
          <h3 className="mb-2.5 font-semibold text-green-700">What you did well</h3>
          <ul className="flex flex-col gap-2.5">
            {strengths.length ? (
              strengths.map((item, index) => (
                <FeedbackItem key={index} item={item} index={index} tone="strength" onSeek={onSeek} />
              ))
            ) : (
              <li className="text-sm text-gray-400">No strengths recorded.</li>
            )}
          </ul>
        </div>
        <div>
          <h3 className="mb-2.5 font-semibold text-amber-700">Coaching tips</h3>
          <ul className="flex flex-col gap-2.5">
            {suggestions.length ? (
              suggestions.map((item, index) => (
                <FeedbackItem key={index} item={item} index={index} tone="coaching" onSeek={onSeek} />
              ))
            ) : (
              <li className="text-sm text-gray-400">No suggestions recorded.</li>
            )}
          </ul>
        </div>
      </div>
    </details>
  );
};

export const TranscriptDetails = ({
  entries = [],
  summary,
  recordingUrl,
  seekControlRef,
  onPlayabilityChange,
}) => (
  <details open className="rounded-xl border border-gray-200 bg-white shadow-sm">
    <summary className="cursor-pointer px-4 py-3.5 text-sm font-semibold text-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500">
      Transcript &amp; call summary
      <span className="ml-2 font-normal text-gray-400">
        {entries.length} turn{entries.length === 1 ? "" : "s"}
        {recordingUrl ? " · recording" : ""}
      </span>
    </summary>
    <div className="border-t border-gray-100 p-4">
      <TranscriptView
        entries={entries}
        summary={summary}
        recordingUrl={recordingUrl}
        seekControlRef={seekControlRef}
        onPlayabilityChange={onPlayabilityChange}
      />
    </div>
  </details>
);
