"use client";

import type { Rubric, SessionStatus } from "@tour/shared";
import {
  ChevronDown,
  ExternalLink,
  Eye,
  Loader2,
  RefreshCw,
  SlidersHorizontal,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";

import { fetchCommunityRubrics } from "@/lib/client-rubrics-cache";
import { waitForSessionProcessing } from "@/lib/wait-for-session-processing";

import styles from "./session-detail.module.css";

export function ReanalyzeWithRubric({
  sessionId,
  currentRubricId,
  currentRubricName,
  score,
  readOnly = false,
}: {
  sessionId: string;
  currentRubricId: string | null;
  currentRubricName: string | null;
  score: number;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const popoverId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [showReanalyze, setShowReanalyze] = useState(false);
  const [rubrics, setRubrics] = useState<Rubric[]>([]);
  const [rubricsLoading, setRubricsLoading] = useState(false);
  const [rubricsLoaded, setRubricsLoaded] = useState(false);
  const [rubricsError, setRubricsError] = useState<string | null>(null);
  const [selectedRubricId, setSelectedRubricId] = useState(currentRubricId ?? "");
  const [resegment, setResegment] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isRefreshing, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const rubricChanged = Boolean(
    selectedRubricId && selectedRubricId !== (currentRubricId ?? "")
  );
  const displayRubricName = currentRubricName?.trim() || "Default rubric";
  const selectedRubricName =
    rubrics.find((rubric) => rubric.id === selectedRubricId)?.name
    || (selectedRubricId === currentRubricId ? displayRubricName : "selected rubric");

  useEffect(() => {
    setSelectedRubricId(currentRubricId ?? "");
    setResegment(false);
  }, [currentRubricId]);

  useEffect(() => {
    if (!open) return;

    function closeOnOutsideClick(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    }

    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  useEffect(() => {
    if (!showReanalyze || readOnly || rubricsLoaded) return;

    let cancelled = false;
    setRubricsLoading(true);
    setRubricsError(null);

    void fetchCommunityRubrics()
      .then((items) => {
        if (cancelled) return;
        setRubrics(items);
        if (items.length > 0) {
          const defaultRubric = items.find((rubric) => rubric.isDefault) ?? items[0]!;
          setSelectedRubricId((current) => current || defaultRubric.id);
        }
      })
      .catch((caught) => {
        if (!cancelled) {
          setRubricsError(caught instanceof Error ? caught.message : "Could not load rubrics.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setRubricsLoading(false);
          setRubricsLoaded(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [readOnly, rubricsLoaded, showReanalyze]);

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

      setOpen(false);
      startTransition(() => {
        const href = latestVersion
          ? `/sessions/${encodeURIComponent(sessionId)}?version=${latestVersion}`
          : `/sessions/${encodeURIComponent(sessionId)}`;
        router.replace(href);
        router.refresh();
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to re-analyze session.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.rubricMenuRoot} ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.rubricSourceTrigger}
        title={`Rubric: ${displayRubricName}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? popoverId : undefined}
        onClick={() => {
          setError(null);
          setOpen((current) => !current);
        }}
      >
        <span className={styles.rubricSourceName}>{displayRubricName}</span>
        <ChevronDown
          size={13}
          className={open ? styles.rubricMenuChevronOpen : styles.rubricMenuChevron}
          aria-hidden
        />
      </button>
      <span className={styles.sidebarScore}>{Math.round(score)}%</span>

      {open && (
        <div
          id={popoverId}
          className={styles.rubricActionsPopover}
          role="dialog"
          aria-label={`${displayRubricName} rubric actions`}
        >
          <div className={styles.rubricActionsPopoverHead}>
            <span>Scored with</span>
            <strong>{displayRubricName}</strong>
          </div>

          {currentRubricId ? (
            <Link
              href={`/rubrics/${encodeURIComponent(currentRubricId)}`}
              className={styles.rubricPopoverOption}
              onClick={() => setOpen(false)}
            >
              <span className={styles.rubricPopoverOptionIcon}><Eye size={16} aria-hidden /></span>
              <span>
                <strong>View rubric</strong>
                <small>Open its questions and scoring setup</small>
              </span>
              <ExternalLink size={13} aria-hidden />
            </Link>
          ) : (
            <div className={`${styles.rubricPopoverOption} ${styles.rubricPopoverOptionMuted}`}>
              <span className={styles.rubricPopoverOptionIcon}><Eye size={16} aria-hidden /></span>
              <span>
                <strong>Default rubric</strong>
                <small>No linked rubric is available to open</small>
              </span>
            </div>
          )}

          {!readOnly && (
            <>
              <button
                type="button"
                className={`${styles.rubricPopoverOption} ${showReanalyze ? styles.rubricPopoverOptionActive : ""}`}
                aria-expanded={showReanalyze}
                onClick={() => {
                  setError(null);
                  setShowReanalyze((current) => !current);
                }}
              >
                <span className={styles.rubricPopoverOptionIcon}>
                  <SlidersHorizontal size={16} aria-hidden />
                </span>
                <span>
                  <strong>Change rubric &amp; re-score</strong>
                  <small>Create a new analysis without re-transcribing</small>
                </span>
                <ChevronDown size={13} aria-hidden />
              </button>

              {showReanalyze && (
                <div className={styles.rubricReanalyze}>
                  <label className={styles.rubricReanalyzeField}>
                    <span>Rubric</span>
                    <select
                      value={selectedRubricId}
                      disabled={rubricsLoading || rubrics.length === 0}
                      onChange={(event) => {
                        const rubricId = event.currentTarget.value;
                        setSelectedRubricId(rubricId);
                        if (rubricId !== (currentRubricId ?? "")) setResegment(true);
                      }}
                    >
                      {currentRubricId && !rubrics.some((rubric) => rubric.id === currentRubricId) && (
                        <option value={currentRubricId}>{displayRubricName}</option>
                      )}
                      {rubrics.map((rubric) => (
                        <option key={rubric.id} value={rubric.id}>
                          {rubric.name}{rubric.isDefault ? " (default)" : ""}
                        </option>
                      ))}
                    </select>
                  </label>

                  {rubricsLoading && (
                    <p className={styles.rubricReanalyzeStatus}>
                      <Loader2 size={12} className="spin" aria-hidden /> Loading rubrics…
                    </p>
                  )}
                  {rubricsError && <p className={styles.rubricReanalyzeError}>{rubricsError}</p>}

                  <label className={styles.rubricReanalyzeCheck}>
                    <input
                      type="checkbox"
                      checked={resegment || rubricChanged}
                      disabled={rubricChanged}
                      onChange={(event) => setResegment(event.target.checked)}
                    />
                    <span>Re-segment conversation phases</span>
                  </label>

                  <p className={styles.rubricReanalyzeHint}>
                    Creates a new analysis version. The transcript stays unchanged.
                  </p>
                  <button
                    type="button"
                    className={styles.rubricReanalyzeSubmit}
                    onClick={() => void handleReanalyze()}
                    disabled={loading || isRefreshing || !(selectedRubricId || currentRubricId)}
                  >
                    {loading || isRefreshing ? (
                      <>
                        <Loader2 size={13} className="spin" aria-hidden />
                        {isRefreshing ? "Refreshing…" : "Re-analyzing…"}
                      </>
                    ) : (
                      <>
                        <RefreshCw size={13} aria-hidden />
                        {rubricChanged ? `Analyze with ${selectedRubricName}` : "Re-run analysis"}
                      </>
                    )}
                  </button>
                  {error && <p className={styles.rubricReanalyzeError}>{error}</p>}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
