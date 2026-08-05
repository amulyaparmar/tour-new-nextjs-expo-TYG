// @ts-nocheck
"use client";

import React, { useId } from "react";

const PaceMetric = ({ label, value, detail, accent = false, helpText }) => {
  const tooltipId = useId();

  return (
    <div className={`rounded-lg border p-3 ${accent ? "border-violet-100 bg-violet-50/60" : "border-gray-100 bg-gray-50/70"}`}>
      <div className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-gray-500">
        <span>{label}</span>
        {helpText && (
          <span className="group relative inline-flex normal-case tracking-normal">
            <button
              type="button"
              aria-label={`What is ${label.toLowerCase()}?`}
              aria-describedby={tooltipId}
              className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-gray-300 bg-white text-[10px] font-bold text-gray-500 hover:border-violet-400 hover:text-violet-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
            >
              ?
            </button>
            <span
              id={tooltipId}
              role="tooltip"
              className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 hidden w-56 -translate-x-1/2 rounded-lg bg-gray-900 px-3 py-2 text-left text-xs font-normal leading-relaxed text-white shadow-lg group-hover:block group-focus-within:block"
            >
              {helpText}
            </span>
          </span>
        )}
      </div>
      <div className={`mt-1 text-xl font-semibold ${accent ? "text-violet-700" : "text-gray-900"}`}>
        {value}
      </div>
      <div className="mt-0.5 text-xs text-gray-500">{detail}</div>
    </div>
  );
};

export const ConversationPaceGrid = ({ metrics }) => {
  if (!metrics || Number(metrics.metricsVersion) < 1) return null;

  const responseLatency =
    metrics.medianResponseLatencySeconds === null ||
    metrics.medianResponseLatencySeconds === undefined
      ? "—"
      : `${metrics.medianResponseLatencySeconds}s`;

  return (
    <>
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
        <PaceMetric
          accent
          label="Talk / listen"
          value={`${metrics.agentTalkShare}% / ${metrics.prospectTalkShare}%`}
          detail="agent / prospect"
          helpText="Compares the time the agent spoke with the time the prospect spoke. Silence is excluded."
        />
        <PaceMetric
          label="Speaking speed"
          value={`${metrics.agentWordsPerMinute} WPM`}
          detail="agent voiced words"
          helpText="Agent transcript words divided by the amount of time the agent was speaking."
        />
        <PaceMetric
          label="Longest monologue"
          value={`${metrics.longestAgentMonologueSeconds}s`}
          detail="uninterrupted agent speech"
        />
        <PaceMetric
          label="Response latency"
          value={responseLatency}
          detail="median agent response"
          helpText="The median pause between the prospect finishing and the agent beginning a response."
        />
      </div>

      <p className="mt-2.5 text-xs text-gray-400">
        {metrics.agentTalkSeconds}s agent talk · {metrics.prospectTalkSeconds}s prospect talk · {metrics.timedSegmentCount} timed segments
      </p>
    </>
  );
};

// Standalone wrapper retained for compatibility; current roleplay reports use
// ConversationPaceGrid inside the merged Conversation analysis card.
export const ConversationPace = ({ metrics }) => {
  if (!metrics || Number(metrics.metricsVersion) < 1) return null;
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-3">
        <h2 className="font-semibold text-gray-900">Conversation pace</h2>
        <p className="mt-0.5 text-sm text-gray-500">Measured from voice timing</p>
      </div>
      <ConversationPaceGrid metrics={metrics} />
    </section>
  );
};
