// @ts-nocheck — ported from usevoice.ai-TYG; noUncheckedIndexedAccess not retrofitted.
"use client";

import {
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Sparkles,
} from "lucide-react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { RoleplayWaypoint } from "@/lib/roleplay/types";

const TYPE_LABELS = {
  objection: "Objection",
  guidance: "Customer guidance",
  value: "Value creation",
};

const TYPE_STYLES = {
  objection: "bg-amber-50 text-amber-700 ring-amber-200",
  guidance: "bg-violet-50 text-violet-700 ring-violet-200",
  value: "bg-emerald-50 text-emerald-700 ring-emerald-200",
};

export const WaypointCarousel = ({
  waypoints,
  completedIds,
  isLive,
}: {
  waypoints: RoleplayWaypoint[];
  completedIds: string[];
  isLive: boolean;
}) => {
  const completed = useMemo(() => new Set(completedIds), [completedIds]);
  const nextIndex = Math.max(
    0,
    waypoints.findIndex((waypoint) => !completed.has(waypoint.id))
  );
  const [activeIndex, setActiveIndex] = useState(nextIndex);
  // The waypoint whose completion pop is currently animating. Driven by NEW
  // completions only (diffed against a ref), so navigating back onto a
  // long-completed card never replays the pop.
  const [justCompletedId, setJustCompletedId] = useState<string | null>(null);
  const seenCompletedRef = useRef<Set<string>>(new Set(completedIds));

  useEffect(() => {
    const advance = () => {
      const firstIncomplete = waypoints.findIndex((waypoint) => !completed.has(waypoint.id));
      setActiveIndex(firstIncomplete >= 0 ? firstIncomplete : Math.max(0, waypoints.length - 1));
    };
    const fresh = completedIds.filter((id) => !seenCompletedRef.current.has(id));
    seenCompletedRef.current = new Set(completedIds);
    const activeId = waypoints[Math.min(activeIndex, Math.max(0, waypoints.length - 1))]?.id;
    // When the card the trainee is looking at just completed, let the check
    // land visibly before the carousel moves on; completions on other cards
    // advance immediately (jumping there first would be more jarring).
    if (activeId && fresh.includes(activeId)) {
      setJustCompletedId(activeId);
      const timer = setTimeout(() => {
        setJustCompletedId(null);
        advance();
      }, 900);
      return () => clearTimeout(timer);
    }
    advance();
  }, [completedIds.join("|"), waypoints]);

  if (!waypoints.length) return null;

  const safeIndex = Math.min(activeIndex, waypoints.length - 1);
  const active = waypoints[safeIndex];
  const activeComplete = completed.has(active.id);
  const completedCount = waypoints.filter((waypoint) => completed.has(waypoint.id)).length;
  const move = (direction: number) =>
    setActiveIndex((current) => (current + direction + waypoints.length) % waypoints.length);

  return (
    <section
      aria-label="Waypoint conversation suggestions"
      className="overflow-hidden rounded-xl border border-blue-200 bg-white shadow-sm"
    >
      <div className="flex items-center justify-between gap-3 border-b border-blue-100 bg-blue-50/70 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white">
            <MapPin size={16} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-gray-900">Waypoint</h3>
              <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-blue-700 ring-1 ring-blue-200">
                {isLive ? "Live" : "Ready"}
              </span>
            </div>
            <p className="truncate text-xs text-gray-500">
              Talk tracks for this scenario's key customer moments
            </p>
          </div>
        </div>
        <span className="shrink-0 text-xs text-gray-400">
          {safeIndex + 1} of {waypoints.length}
        </span>
      </div>

      <div className="px-4 py-4" aria-live="polite">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ring-1 ${
              TYPE_STYLES[active.type] ?? TYPE_STYLES.guidance
            }`}
          >
            {TYPE_LABELS[active.type] ?? "Guidance"}
          </span>
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${
              activeComplete
                ? "bg-emerald-100 text-emerald-700"
                : safeIndex === nextIndex
                  ? "bg-blue-100 text-blue-700"
                  : "bg-gray-100 text-gray-500"
            }`}
          >
            {activeComplete ? (
              <CheckCircle2 size={12} aria-hidden="true" />
            ) : safeIndex === nextIndex ? (
              <Sparkles size={12} aria-hidden="true" />
            ) : null}
            {activeComplete ? "Completed" : safeIndex === nextIndex ? "Suggested now" : "Upcoming"}
          </span>
        </div>

        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h4 className="text-sm font-semibold text-gray-900">{active.title}</h4>
            <p className="mt-1 text-xs leading-relaxed text-gray-500">{active.cue}</p>
          </div>
          <span
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
              activeComplete
                ? "border-emerald-500 bg-emerald-500 text-white"
                : "border-gray-200 bg-white text-transparent"
            } ${active.id === justCompletedId ? "waypoint-check-pop" : ""}`}
            aria-label={activeComplete ? "Waypoint completed" : "Waypoint not completed"}
          >
            <Check size={16} strokeWidth={3} />
          </span>
        </div>

        <div className="mt-3">
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-blue-700">
            Try saying
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {active.suggestedLines.map((line, index) => (
              <blockquote
                key={`${active.id}-${index}`}
                className="rounded-lg border border-blue-100 bg-blue-50/50 px-3 py-2.5 text-sm leading-relaxed text-gray-800"
              >
                “{line}”
              </blockquote>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-gray-100 px-4 py-2.5">
        <p className="text-[11px] text-gray-400">
          {completedCount}/{waypoints.length} completed · coaching progress only · not part of your score
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => move(-1)}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 text-gray-500 transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
            aria-label="Previous waypoint"
          >
            <ChevronLeft size={16} />
          </button>
          <div className="hidden items-center gap-1 sm:flex" aria-hidden="true">
            {waypoints.map((waypoint, index) => (
              <span
                key={waypoint.id}
                className={`h-1.5 rounded-full transition-all ${
                  index === safeIndex
                    ? "w-4 bg-blue-600"
                    : completed.has(waypoint.id)
                      ? "w-1.5 bg-emerald-400"
                      : "w-1.5 bg-gray-200"
                }`}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => move(1)}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 text-gray-500 transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
            aria-label="Next waypoint"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </section>
  );
};
