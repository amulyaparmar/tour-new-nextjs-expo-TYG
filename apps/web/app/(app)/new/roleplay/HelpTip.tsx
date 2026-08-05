// @ts-nocheck
"use client";

// Small "?" help tooltip. Pure CSS (hover/focus), no portal/deps — fine for
// form labels. Keyboard accessible via tabIndex + focus-within.

import { HelpCircle } from "lucide-react";
import React from "react";

export const HelpTip = ({ children, width = "w-80" }) => {
  return (
    <span className="relative inline-flex group align-middle" tabIndex={0}>
      <HelpCircle
        size={14}
        className="text-gray-400 hover:text-gray-600 cursor-help ml-1"
        aria-label="More info"
      />
      <span
        className={`invisible opacity-0 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100 transition-opacity duration-150 absolute left-5 top-0 z-50 ${width} rounded-lg border border-gray-200 bg-white p-3 text-xs font-normal normal-case leading-relaxed text-gray-600 shadow-lg`}
        role="tooltip"
      >
        {children}
      </span>
    </span>
  );
};
