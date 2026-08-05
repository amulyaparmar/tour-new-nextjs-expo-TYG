// @ts-nocheck
"use client";

import { AlertTriangle, CheckCircle2, Play, XCircle } from "lucide-react";
import React from "react";
import { formatMomentTimestamp } from "@/lib/roleplay/feedbackTimestamps";

const checkpointStyle = (checkpoint) =>
  checkpoint.hit === true
    ? "border-green-200 bg-green-50 text-green-700"
    : checkpoint.hit === false
    ? "border-red-200 bg-red-50 text-red-700"
    : "border-amber-200 bg-amber-50 text-amber-700";

const CheckpointIcon = ({ checkpoint }) =>
  checkpoint.hit === true ? (
    <CheckCircle2 aria-hidden="true" className="mt-0.5 shrink-0 text-green-600" size={17} />
  ) : checkpoint.hit === false ? (
    <XCircle aria-hidden="true" className="mt-0.5 shrink-0 text-red-500" size={17} />
  ) : (
    <AlertTriangle aria-hidden="true" className="mt-0.5 shrink-0 text-amber-600" size={17} />
  );

const statusLabel = (checkpoint) =>
  checkpoint.hit === true ? "Hit" : checkpoint.hit === false ? "Missed" : "Not graded";

// Timestamp chip: when the grader's evidence quote resolved to call time,
// show WHEN the checkpoint was hit; with onSeek (history view, where the
// recording player exists) it jumps playback to that moment.
const CheckpointMoment = ({ checkpoint, onSeek }) => {
  const timestamp = formatMomentTimestamp(checkpoint.timeSeconds);
  if (!timestamp || checkpoint.hit !== true) return null;
  const tooltip = checkpoint.evidenceQuote
    ? `“${checkpoint.evidenceQuote}”`
    : undefined;
  if (onSeek) {
    return (
      <button
        type="button"
        onClick={() => onSeek(Number(checkpoint.timeSeconds))}
        title={tooltip ? `${tooltip} — play from here` : "Play the recording from this moment"}
        className="flex items-center gap-1 rounded-full bg-white/80 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-green-700 ring-1 ring-green-200 hover:bg-white hover:text-green-900"
      >
        <Play size={9} aria-hidden="true" /> {timestamp}
      </button>
    );
  }
  return (
    <span
      title={tooltip}
      className="rounded-full bg-white/70 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-gray-600"
    >
      {timestamp}
    </span>
  );
};

const CheckpointRow = ({ checkpoint, onSeek }) => (
  <div className={`rounded-lg border px-3 py-2.5 ${checkpointStyle(checkpoint)}`}>
    <div className="flex items-start gap-2">
      <CheckpointIcon checkpoint={checkpoint} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="min-w-0 break-words text-sm font-medium text-gray-800">
            {checkpoint.name}
          </span>
          <div className="flex shrink-0 items-center gap-1.5">
            {!checkpoint.required && (
              <span className="rounded-full bg-white/70 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-gray-500">
                Optional
              </span>
            )}
            <CheckpointMoment checkpoint={checkpoint} onSeek={onSeek} />
            <span className="text-[10px] font-bold uppercase">{statusLabel(checkpoint)}</span>
          </div>
        </div>
        {checkpoint.description && (
          <p className="mt-1 text-xs leading-snug text-gray-500">{checkpoint.description}</p>
        )}
      </div>
    </div>
  </div>
);

export const CheckpointSummary = ({ checkpoints = [], onSeek }) => {
  const required = checkpoints.filter((checkpoint) => checkpoint.required);
  const requiredHit = required.filter((checkpoint) => checkpoint.hit === true).length;
  const allRequiredHit = required.length === 0 || requiredHit === required.length;

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-gray-900">Checkpoint results</h3>
          <p className="mt-0.5 text-sm text-gray-500">
            Required checkpoints are binary and can block a pass despite partial skill credit.
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
            allRequiredHit
              ? "bg-green-100 text-green-700"
              : "bg-red-100 text-red-700"
          }`}
        >
          {required.length > 0
            ? `${requiredHit}/${required.length} required hit`
            : "Score-only pass rule"}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
        {checkpoints.map((checkpoint) => (
          <CheckpointRow key={checkpoint.id} checkpoint={checkpoint} onSeek={onSeek} />
        ))}
      </div>
    </section>
  );
};
