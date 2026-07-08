"use client";

import type { SessionStatus } from "@tour/shared";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { useState, useTransition } from "react";

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
  const [isRefreshing, startTransition] = useTransition();
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
        await waitForSessionProcessing(sessionId, {
          fetchSession: async () => {
            const res = await fetch(`/api/sessions/${sessionId}/status`, { cache: "no-store" });
            if (!res.ok) throw new Error("Failed to check session status.");
            const body = (await res.json()) as {
              session: { status: SessionStatus; overallScore?: number | null };
            };
            return body.session;
          },
        });
      }

      const runsRes = await fetch(`/api/sessions/${sessionId}/analysis/runs`, { cache: "no-store" });
      const runsPayload = runsRes.ok
        ? ((await runsRes.json()) as { runs?: Array<{ version: number; isCurrent?: boolean }> })
        : null;
      const latestVersion =
        runsPayload?.runs?.find((run) => run.isCurrent)?.version
        ?? runsPayload?.runs?.[0]?.version
        ?? null;

      startTransition(() => {
        const href = latestVersion
          ? `/sessions/${encodeURIComponent(sessionId)}?version=${latestVersion}`
          : `/sessions/${encodeURIComponent(sessionId)}`;
        router.replace(href);
        router.refresh();
      });
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
          disabled={loading || isRefreshing || !(selectedRubricId || currentRubricId)}
        >
          {loading || isRefreshing ? (
            <>
              <Loader2 size={13} className="spin" />
              {isRefreshing ? "Refreshing..." : "Re-analyzing..."}
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
