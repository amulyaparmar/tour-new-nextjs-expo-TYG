// @ts-nocheck
"use client";

import React, { useId, useMemo } from "react";
import { computeConversationMetrics } from "@/lib/roleplay/conversationMetrics";
import { ConversationPaceGrid } from "./ConversationPace";

const Metric = ({ label, value, detail, accent = false, helpText }) => {
  const tooltipId = useId();

  return (
    <div className={`rounded-lg border p-3 ${accent ? "border-blue-100 bg-blue-50/60" : "border-gray-100 bg-gray-50/70"}`}>
      <div className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-gray-500">
        <span>{label}</span>
        {helpText && (
          <span className="group relative inline-flex normal-case tracking-normal">
            <button
              type="button"
              aria-label={`What is ${label.toLowerCase()}?`}
              aria-describedby={tooltipId}
              className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-gray-300 bg-white text-[10px] font-bold text-gray-500 hover:border-blue-400 hover:text-blue-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
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
      <div className={`mt-1 text-xl font-semibold ${accent ? "text-blue-700" : "text-gray-900"}`}>
        {value}
      </div>
      <div className="mt-0.5 text-xs text-gray-500">{detail}</div>
    </div>
  );
};

export const ConversationMetrics = ({
  entries = [],
  paceMetrics,
  paceState = "idle",
  onRetryPace,
}) => {
  const metrics = useMemo(() => computeConversationMetrics(entries), [entries]);

  if (metrics.agentWordCount + metrics.prospectWordCount === 0) return null;

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold text-gray-900">Conversation analysis</h2>
          <p className="mt-0.5 text-sm text-gray-500">Text and voice coaching signals</p>
        </div>
        <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-medium text-gray-500">
          Not part of your score
        </span>
      </div>

      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-700">Conversation habits</h3>
        <span className="text-[11px] text-gray-400">From transcript text</span>
      </div>

      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-5">
        <Metric
          accent
          label="Agent word share"
          value={`${metrics.agentWordShare}%`}
          detail={`${100 - metrics.agentWordShare}% prospect`}
        />
        <Metric
          label="Avg. response"
          value={metrics.averageAgentResponseWords}
          detail="words per agent turn"
        />
        <Metric label="Questions" value={metrics.questionCount} detail="asked by agent" />
        <Metric
          label="Filler rate"
          value={metrics.fillersPer100Words}
          detail="per 100 agent words"
          helpText={'Counts fillers such as “um,” “uh,” “you know,” and “I mean,” normalized per 100 words spoken by the agent.'}
        />
        <Metric
          label="Longest response"
          value={metrics.longestAgentResponseWords}
          detail="agent words"
        />
      </div>

      <p className="mt-2.5 text-xs text-gray-400">
        Based on {metrics.agentTurnCount} agent turn{metrics.agentTurnCount === 1 ? "" : "s"}. Word share is not a true talk/listen ratio.
      </p>

      {(paceMetrics || paceState === "loading" || paceState === "failed") && (
        <div className="mt-4 border-t border-gray-100 pt-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-gray-700">Conversation pace</h3>
            <span className="text-[11px] text-gray-400">From voice timing</span>
          </div>

          {paceMetrics && <ConversationPaceGrid metrics={paceMetrics} />}

          {!paceMetrics && paceState === "loading" && (
            <p className="rounded-lg border border-violet-100 bg-violet-50/50 p-3 text-sm text-gray-500">
              Analyzing agent and prospect audio…
            </p>
          )}

          {!paceMetrics && paceState === "failed" && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="text-sm text-gray-600">The audio analysis did not finish successfully.</p>
              {onRetryPace && (
                <button
                  type="button"
                  onClick={onRetryPace}
                  className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-sm font-medium text-amber-800 hover:bg-amber-100"
                >
                  Retry analysis
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
};
