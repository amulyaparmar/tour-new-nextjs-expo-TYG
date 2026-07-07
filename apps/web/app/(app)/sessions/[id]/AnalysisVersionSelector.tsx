"use client";

import { useRouter } from "next/navigation";
import { History } from "lucide-react";

import type { AnalysisRunSummary } from "@tour/shared";

import styles from "./session-detail.module.css";

function formatRunLabel(run: AnalysisRunSummary) {
  const date = new Date(run.createdAt).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const rubric = run.rubricName ? ` · ${run.rubricName}` : "";
  const current = run.isCurrent ? " · Current" : "";
  return `v${run.version} · ${run.overallScore}% · ${date}${rubric}${current}`;
}

export function AnalysisVersionSelector({
  sessionId,
  runs,
  selectedVersion,
}: {
  sessionId: string;
  runs: AnalysisRunSummary[];
  selectedVersion: number | null;
}) {
  const router = useRouter();

  if (runs.length <= 1) {
    return null;
  }

  const value = selectedVersion ?? runs.find((run) => run.isCurrent)?.version ?? runs[0]?.version ?? "";

  return (
    <label className={styles.analysisVersionSelector}>
      <History size={14} aria-hidden />
      <span className={styles.analysisVersionLabel}>Analysis</span>
      <select
        className={styles.analysisVersionSelect}
        value={value}
        onChange={(event) => {
          const nextVersion = event.target.value;
          router.push(`/sessions/${encodeURIComponent(sessionId)}?version=${nextVersion}`);
        }}
        aria-label="Analysis version"
      >
        {runs.map((run) => (
          <option key={run.id} value={run.version}>
            {formatRunLabel(run)}
          </option>
        ))}
      </select>
    </label>
  );
}
