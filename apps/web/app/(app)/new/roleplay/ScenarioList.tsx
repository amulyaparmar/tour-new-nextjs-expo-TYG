// @ts-nocheck
"use client";

// Scenario picker + management grid: run, edit, delete, create.

import { Mic, Pencil, Trash2 } from "lucide-react";
import React from "react";
import { ROLEPLAY_VOICES } from "./voices";

const DIFF_STYLES = {
  easy: "bg-green-100 text-green-700",
  medium: "bg-amber-100 text-amber-700",
  hard: "bg-red-100 text-red-700",
};

export const ScenarioList = ({ scenarios, loading, onRun, onEdit, onDelete }) => {
  return (
    <div className="flex flex-col gap-4">
      {loading && (
        <div className="text-sm text-gray-400 py-16 text-center">Loading scenarios…</div>
      )}

      {!loading && scenarios.length === 0 && (
        <div className="border border-dashed border-gray-300 rounded-xl py-16 text-center">
          <div className="text-gray-600 font-medium">No scenarios yet</div>
          <div className="text-sm text-gray-400 mt-1">
            Create your first roleplay scenario to get started.
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {scenarios.map((s) => {
          const voice = ROLEPLAY_VOICES.find((v) => v.voiceId === s.voice?.voiceId);
          return (
            <div
              key={s.id}
              className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm hover:shadow-md transition-shadow flex flex-col gap-3"
            >
              <div className="flex items-start gap-3">
                {voice?.src ? (
                  <img
                    src={voice.src}
                    alt={voice.label}
                    className="h-12 w-12 rounded-full object-cover border border-gray-200 shrink-0"
                    onError={(e) => (e.currentTarget.style.display = "none")}
                  />
                ) : (
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gray-100 border border-gray-200 font-semibold text-gray-500">
                    {s.voice?.label?.[0] ?? "?"}
                  </span>
                )}
                <div className="min-w-0">
                  <div className="font-semibold text-gray-900 truncate">{s.name}</div>
                  <div className="text-sm text-gray-500 line-clamp-2 mt-0.5">{s.description}</div>
                </div>
              </div>

              <div className="flex items-center gap-2 text-xs">
                <span
                  className={`px-2 py-0.5 rounded-full font-medium ${
                    DIFF_STYLES[s.difficulty] || DIFF_STYLES.medium
                  }`}
                >
                  {s.difficulty}
                </span>
                <span className="text-gray-400">
                  {s.voice?.label || "?"} · {s.rubric?.length || 0} categories ·{" "}
                  {s.checkpoints?.length || 0} checkpoints
                </span>
              </div>

              <div className="flex items-center gap-2 mt-auto pt-1">
                <button
                  onClick={() => onRun(s)}
                  className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors"
                >
                  <Mic size={15} /> Practice
                </button>
                <button
                  onClick={() => onEdit(s)}
                  className="flex items-center gap-1 border border-gray-300 text-gray-600 hover:bg-gray-50 text-sm py-2 px-3 rounded-lg transition-colors"
                >
                  <Pencil size={14} /> Edit
                </button>
                <button
                  onClick={() => {
                    if (confirm(`Delete scenario "${s.name}"?`)) onDelete(s);
                  }}
                  className="flex items-center gap-1 text-gray-400 hover:text-red-500 text-sm py-2 px-2 rounded-lg transition-colors ml-auto"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
