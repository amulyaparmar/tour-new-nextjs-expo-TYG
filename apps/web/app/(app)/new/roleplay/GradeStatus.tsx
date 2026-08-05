// @ts-nocheck
"use client";

import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import React from "react";
import { gradeExplanation } from "@/lib/roleplay/grading";

export const GradeStatus = ({ grade }) => {
  const config =
    grade.status === "passed"
      ? {
          label: "PASSED",
          Icon: CheckCircle2,
          badge: "bg-green-100 text-green-700",
          note: "border-green-200 bg-green-50 text-green-800",
        }
      : grade.status === "needs-review"
      ? {
          label: "NEEDS REVIEW",
          Icon: AlertTriangle,
          badge: "bg-amber-100 text-amber-800",
          note: "border-amber-200 bg-amber-50 text-amber-800",
        }
      : {
          label: "NOT PASSED",
          Icon: XCircle,
          badge: "bg-red-100 text-red-700",
          note: "border-red-200 bg-red-50 text-red-800",
        };

  return (
    <div className="ml-auto flex flex-col items-end gap-2 max-w-sm">
      <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold ${config.badge}`}>
        <config.Icon size={16} /> {config.label}
      </span>
      <div className={`rounded-lg border px-3 py-2 text-xs leading-snug text-right ${config.note}`}>
        {gradeExplanation(grade)}
      </div>
    </div>
  );
};
