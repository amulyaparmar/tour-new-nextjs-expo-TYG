// @ts-nocheck
"use client";

// On-demand modal wrapper around the compiled-prompt view. Light, site-themed.

import { X } from "lucide-react";
import React from "react";
import { CompiledPrompt } from "./CompiledPrompt";

export const PromptPreview = ({ scenario, onClose }) => {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto border border-gray-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 sticky top-0 bg-white z-10">
          <div className="min-w-0">
            <span className="text-sm font-semibold text-gray-900">
              {scenario.name || "This scenario"}
            </span>
            <span className="text-sm text-gray-400"> — nothing is saved</span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 p-1 shrink-0">
            <X size={18} />
          </button>
        </div>
        <CompiledPrompt scenario={scenario} />
      </div>
    </div>
  );
};
