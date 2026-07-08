"use client";

import { useEffect, useState } from "react";
import type { AudioInsights, AudioInsightsStatus, SessionParticipants } from "@tour/shared";
import { AUDIO_INSIGHTS_STATUS_LABELS } from "@tour/shared";
import { Activity, Loader2, RefreshCw } from "lucide-react";

import { SessionAudioInsightsPanel } from "./SessionAudioInsightsPanel";
import styles from "./session-detail.module.css";

type AudioInsightsResponse = {
  status: AudioInsightsStatus;
  insights: AudioInsights | null;
  error?: string | null;
};

type StartAudioInsightsResponse = {
  status?: AudioInsightsStatus;
  error?: string | null;
};

const POLLING_STATUSES = new Set<AudioInsightsStatus>(["pending", "processing"]);

export function SessionAudioInsightsSidebarTab({
  sessionId,
  initialStatus,
  initialInsights,
  participants,
  duration,
  currentTime,
  onSeek,
}: {
  sessionId: string;
  initialStatus: AudioInsightsStatus;
  initialInsights: AudioInsights | null;
  participants: SessionParticipants;
  duration: number;
  currentTime: number;
  onSeek: (seconds: number) => void;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [insights, setInsights] = useState(initialInsights);
  const [error, setError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);

  useEffect(() => {
    if (!POLLING_STATUSES.has(status)) return;

    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch(`/api/sessions/${sessionId}/audio-insights`);
        if (!res.ok) return;
        const body = (await res.json()) as AudioInsightsResponse;
        if (cancelled) return;
        setStatus(body.status);
        if (body.insights) setInsights(body.insights);
        setError(body.error ?? null);
      } catch {
        // Ignore transient poll errors.
      }
    }

    void poll();
    const interval = window.setInterval(poll, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [sessionId, status]);

  if (status === "ready" && insights) {
    return (
      <SessionAudioInsightsPanel
        sessionId={sessionId}
        insights={insights}
        participants={participants}
        duration={duration}
        currentTime={currentTime}
        onSeek={onSeek}
      />
    );
  }

  async function rerunAudioInsights() {
    setIsStarting(true);
    setError(null);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/audio-insights`, {
        method: "POST",
      });
      const body = (await res.json()) as StartAudioInsightsResponse;
      if (!res.ok) {
        throw new Error(body.error ?? "Failed to start audio insights.");
      }
      setInsights(null);
      setStatus(body.status ?? "processing");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start audio insights.");
      setStatus("failed");
    } finally {
      setIsStarting(false);
    }
  }

  const rerunButton = (
    <button
      type="button"
      className="btn btn-outline btn-sm"
      disabled={isStarting}
      onClick={rerunAudioInsights}
    >
      {isStarting ? (
        <>
          <Loader2 size={13} className="spin" aria-hidden />
          Starting...
        </>
      ) : (
        <>
          <RefreshCw size={13} aria-hidden />
          Run audio insights
        </>
      )}
    </button>
  );

  return (
    <div className={styles.audioPanel}>
      <header className={styles.audioPanelHeader}>
        <div className={styles.sidebarSectionHead}>
          <h2>Audio insights</h2>
        </div>
      </header>
      <div className={styles.audioPanelEmpty}>
        {POLLING_STATUSES.has(status) ? (
          <>
            <Loader2 size={28} className="animate-spin" aria-hidden />
            <p>{AUDIO_INSIGHTS_STATUS_LABELS[status]}</p>
            <p className={styles.audioPanelEmptyHint}>
              Gemini is analyzing sentiment, speaker dynamics, and ambience from the recording. This runs separately from rubric scoring and may take a few minutes.
            </p>
            {rerunButton}
          </>
        ) : status === "unavailable" ? (
          <>
            <Activity size={28} aria-hidden />
            <p>Audio insights are not configured.</p>
            <p className={styles.audioPanelEmptyHint}>
              Set GEMINI_API_KEY on the server to enable sentiment and ambience analysis for every session.
            </p>
            {rerunButton}
          </>
        ) : status === "failed" ? (
          <>
            <p>Audio insights could not be generated.</p>
            <p className={styles.audioPanelEmptyHint}>
              {error ?? "Re-process the session to try again."}
            </p>
            {rerunButton}
          </>
        ) : (
          <>
            <p>No audio insights yet.</p>
            <p className={styles.audioPanelEmptyHint}>
              Insights will appear here once processing starts.
            </p>
            {rerunButton}
          </>
        )}
      </div>
    </div>
  );
}
