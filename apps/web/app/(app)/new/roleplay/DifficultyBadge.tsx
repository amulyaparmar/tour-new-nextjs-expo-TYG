// @ts-nocheck
"use client";

import React from "react";

const DIFFICULTY_STYLES = {
  easy: "bg-green-100 text-green-700",
  medium: "bg-amber-100 text-amber-700",
  hard: "bg-red-100 text-red-700",
};

export const DifficultyBadge = ({ difficulty }) => {
  const normalized = String(difficulty || "").toLowerCase();
  if (!DIFFICULTY_STYLES[normalized]) return null;

  return (
    <span
      className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${DIFFICULTY_STYLES[normalized]}`}
    >
      {normalized} difficulty
    </span>
  );
};
