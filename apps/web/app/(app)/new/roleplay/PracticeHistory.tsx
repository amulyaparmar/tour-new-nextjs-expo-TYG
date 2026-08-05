// @ts-nocheck
"use client";

// Past roleplay attempts for the CURRENT property, read from
// GET /api/roleplay/attempts (the `roleplay_attempts` table — identity is
// stamped server-side from the workspace).

import { ChevronRight, RefreshCw } from "lucide-react";
import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { gradeFromStoredEvaluations, gradeScoreBand } from "@/lib/roleplay/grading";

const fmtDuration = (d) => {
  const s = Math.max(0, Math.round(Number(d) || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

const fmtWhen = (iso) => {
  try {
    const dt = new Date(iso);
    return (
      dt.toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
      " · " +
      dt.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    );
  } catch {
    return "—";
  }
};

const chipColors = {
  strong: "bg-green-100 text-green-700",
  pass: "bg-emerald-100 text-emerald-700",
  near: "bg-amber-100 text-amber-800",
  fail: "bg-red-100 text-red-700",
};

export const PracticeHistory = ({ onOpen }) => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [scope, setScope] = useState("mine"); // mine | team

  const load = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/roleplay/attempts?scope=${scope}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.message || "Request failed");
      setRows(data.attempts || []);
    } catch (e) {
      console.error(e);
      toast.error(`Could not load practice history: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [scope]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5">
            {[
              ["mine", "Mine"],
              ["team", "Team"],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setScope(id)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  scope === id ? "bg-blue-600 text-white" : "text-gray-600 hover:text-gray-900"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="text-sm text-gray-500">
            {loading ? "Loading…" : `${rows.length} session${rows.length === 1 ? "" : "s"}`}
          </p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh
        </button>
      </div>

      {!loading && rows.length === 0 && (
        <div className="border border-dashed border-gray-300 rounded-xl py-16 text-center">
          <div className="text-gray-600 font-medium">No practice sessions yet</div>
          <div className="text-sm text-gray-400 mt-1">
            Run a scenario and your graded attempts will show up here.
          </div>
        </div>
      )}

      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-200">
                <th className="px-4 py-3 font-medium">Scenario</th>
                <th className="px-4 py-3 font-medium">Score</th>
                <th className="px-4 py-3 font-medium">Trainee</th>
                <th className="px-4 py-3 font-medium">Length</th>
                <th className="px-4 py-3 font-medium">When</th>
                <th className="px-4 py-3 font-medium text-right"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const grade = gradeFromStoredEvaluations(
                  r.score,
                  Array.isArray(r.evaluations) ? r.evaluations : []
                );
                const score = grade.score;
                const hasScore = score !== null;
                const resultLabel =
                  grade.status === "passed"
                    ? "passed"
                    : grade.status === "needs-review"
                    ? "needs review"
                    : "not passed";
                const resultColor = chipColors[gradeScoreBand(grade)];
                return (
                  <tr
                    key={r.id}
                    onClick={() => onOpen?.(r.id)}
                    className="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors cursor-pointer"
                  >
                    <td className="px-4 py-3 align-top">
                      <div className="font-medium text-gray-800">
                        {r.scenario_name || "Roleplay"}
                      </div>
                      {r.summary && (
                        <div className="text-xs text-gray-400 line-clamp-1 max-w-sm">{r.summary}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top whitespace-nowrap">
                      {hasScore || grade.status === "needs-review" ? (
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${resultColor}`}
                        >
                          {hasScore ? `${Math.round(score)}/100 · ` : ""}
                          {resultLabel}
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top text-gray-600">{r.agent_name || "—"}</td>
                    <td className="px-4 py-3 align-top text-gray-600 font-mono text-xs">
                      {fmtDuration(r.duration_seconds)}
                    </td>
                    <td className="px-4 py-3 align-top text-gray-500 whitespace-nowrap">
                      {fmtWhen(r.created_at)}
                    </td>
                    <td className="px-4 py-3 align-top text-right">
                      <span className="inline-flex items-center gap-1 text-blue-600 text-sm">
                        Open <ChevronRight size={15} />
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
