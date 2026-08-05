// @ts-nocheck
"use client";

import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  MessageSquareQuote,
} from "lucide-react";
import React, { useState } from "react";
import { resolveCategoryFeedback } from "@/lib/roleplay/categoryFeedback";
import { DEFAULT_ROLEPLAY_PASS_THRESHOLD, scoreBand } from "@/lib/roleplay/grading";

const barColors = {
  strong: "bg-green-500",
  pass: "bg-emerald-500",
  near: "bg-amber-500",
  fail: "bg-red-500",
};

const cleanLegacyReason = (reason) =>
  reason.replace(/^Closest saved coaching tip:\s*/i, "");

export const CategoryBreakdown = ({
  categories,
  feedbackByKey = {},
  suggestions = [],
  passThreshold = DEFAULT_ROLEPLAY_PASS_THRESHOLD,
}) => {
  const [expandedKey, setExpandedKey] = useState(null);

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-gray-900">Skill breakdown</h3>
          <p className="mt-0.5 text-sm text-gray-500">
            Select a skill to see why points were lost and what to say next time.
          </p>
        </div>
        <div className="shrink-0 rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-500">
          {categories.length} skills
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-lg border border-gray-200">
        {categories.map((category, index) => {
          const key = category.key || category.label;
          const panelId = `skill-feedback-${String(key).replace(/[^a-z0-9_-]/gi, "-")}`;
          const expanded = expandedKey === key;
          const numericScore = Number(category.score);
          const hasScore = category.score !== null && Number.isFinite(numericScore);
          const score = hasScore ? Math.max(0, Math.min(20, Math.round(numericScore))) : null;
          const pointsAvailable = score === null ? null : 20 - score;
          const feedback = resolveCategoryFeedback({
            label: category.label,
            description: category.description,
            score: score ?? 0,
            feedback: category.feedback ?? feedbackByKey?.[category.key],
            suggestions,
          });
          const reasons =
            feedback.legacy && feedback.inferredFromSavedTip
              ? feedback.reasons.slice(-1).map(cleanLegacyReason)
              : feedback.reasons;

          return (
            <article
              key={key}
              className={index > 0 ? "border-t border-gray-200" : undefined}
            >
              <button
                type="button"
                aria-expanded={expanded}
                aria-controls={panelId}
                onClick={() => setExpandedKey(expanded ? null : key)}
                className="w-full px-3.5 py-3 text-left transition-colors hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
              >
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <span className="min-w-0 text-sm font-semibold text-gray-900">
                        {category.label}
                      </span>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="w-11 text-right text-sm font-bold text-gray-800">
                          {score === null ? "—" : score}/20
                        </span>
                        <ChevronDown
                          size={17}
                          aria-hidden="true"
                          className={`text-gray-400 transition-transform ${
                            expanded ? "rotate-180" : ""
                          }`}
                        />
                      </div>
                    </div>
                    <div
                      aria-hidden="true"
                      className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-100"
                    >
                      <div
                        className={`h-full rounded-full ${
                          score === null
                            ? "bg-gray-200"
                            : barColors[scoreBand((score / 20) * 100, passThreshold)]
                        }`}
                        style={{ width: `${score === null ? 100 : (score / 20) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
              </button>

              {expanded && (
                <div id={panelId} className="border-t border-gray-100 bg-gray-50/60 px-4 py-4">
                  <p className="text-xs leading-relaxed text-gray-500">{category.description}</p>

                  {category.cappedByCheckpoint && (
                    <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                      Score capped because the required “{category.cappedByCheckpoint}” checkpoint
                      was missed.
                    </div>
                  )}

                  {score === null ? (
                    <div className="mt-3 flex items-center gap-2 text-sm text-amber-700">
                      <AlertCircle aria-hidden="true" size={17} /> No score was returned, so this skill needs review.
                    </div>
                  ) : pointsAvailable === 0 ? (
                    <div className="mt-3 flex items-center gap-2 text-sm text-green-700">
                      <CheckCircle2 aria-hidden="true" size={17} /> Full credit earned—keep this behavior consistent.
                    </div>
                  ) : (
                    <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                      <div>
                        <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-amber-800">
                          <AlertCircle aria-hidden="true" size={14} /> What to improve
                        </div>
                        {feedback.legacy && (
                          <div className="mt-1.5 text-[11px] text-gray-400">
                            Inferred from feedback saved with this earlier session
                          </div>
                        )}
                        <ul className="mt-2 flex flex-col gap-1.5">
                          {reasons.map((reason, reasonIndex) => (
                            <li key={reasonIndex} className="text-sm leading-snug text-gray-700">
                              {reason}
                            </li>
                          ))}
                        </ul>
                        {feedback.evidenceQuote && (
                          <div className="mt-2 text-xs italic text-gray-500">
                            Evidence: “{feedback.evidenceQuote}”
                          </div>
                        )}
                      </div>

                      <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5">
                        <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-blue-800">
                          <MessageSquareQuote aria-hidden="true" size={14} /> Try saying
                        </div>
                        <blockquote className="mt-1.5 text-sm font-medium leading-relaxed text-blue-950">
                          “{feedback.betterResponse}”
                        </blockquote>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
};
