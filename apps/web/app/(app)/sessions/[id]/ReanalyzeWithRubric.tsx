"use client";

import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { useState } from "react";

import { waitForSessionProcessing } from "@/lib/wait-for-session-processing";
import { RubricSelector } from "../../RubricSelector";

import styles from "./session-detail.module.css";

export function ReanalyzeWithRubric({
  sessionId,
  currentRubricId,
}: {
  sessionId: string;
  currentRubricId: string | null;
}) {
  const router = useRouter();
  const [selectedRubricId, setSelectedRubricId] = useState(currentRubricId ?? "");
  const [resegment, setResegment] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rubricChanged = Boolean(selectedRubricId && selectedRubricId !== (currentRubricId ?? ""));

  async function handleReanalyze() {
    const rubricId = selectedRubricId || currentRubricId;
    if (!rubricId) {
      setError("Select a rubric first.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/sessions/${sessionId}/analysis`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rubricId,
          resegment: resegment || rubricChanged,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Failed to re-analyze session.");
      }

      if (response.status === 202) {
        await waitForSessionProcessing(sessionId);
      }

      const runsRes = await fetch(`/api/sessions/${sessionId}/analysis/runs`, { cache: "no-store" });
      if (runsRes.ok) {
        const payload = await runsRes.json() as { runs?: Array<{ version: number; isCurrent?: boolean }> };
        const latest = payload.runs?.find((run) => run.isCurrent) ?? payload.runs?.[0];
        if (latest) {
          router.push(`/sessions/${encodeURIComponent(sessionId)}?version=${latest.version}`);
          router.refresh();
          return;
        }
      }

      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to re-analyze session.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.rubricReanalyze}>
      <p className={styles.rubricReanalyzeHint}>
        Score this recording against a different rubric without re-transcribing.
      </p>
      <RubricSelector
        name="reanalyzeRubricId"
        value={selectedRubricId || currentRubricId}
        onChange={(rubricId) => {
          setSelectedRubricId(rubricId);
          if (rubricId !== (currentRubricId ?? "")) {
            setResegment(true);
          }
        }}
        showManageLink={false}
        compact
      />
      <label className={styles.rubricReanalyzeCheck}>
        <input
          type="checkbox"
          checked={resegment || rubricChanged}
          disabled={rubricChanged}
          onChange={(event) => setResegment(event.target.checked)}
        />
        <span>Re-segment conversation phases for this rubric</span>
      </label>
      <div className={styles.rubricReanalyzeActions}>
        <button
          type="button"
          className="btn btn-outline btn-sm"
          onClick={handleReanalyze}
          disabled={loading || !(selectedRubricId || currentRubricId)}
        >
          {loading ? (
            <>
              <Loader2 size={13} className="spin" />
              Re-analyzing…
            </>
          ) : (
            <>
              <RefreshCw size={13} />
              {rubricChanged ? "Re-analyze with rubric" : "Re-run analysis"}
            </>
          )}
        </button>
      </div>
      {error && <p className={styles.rubricReanalyzeError}>{error}</p>}
    </div>
  );
}
