"use client";

import { useEffect, useState } from "react";
import type { AudioInsights, AudioInsightsStatus, SessionParticipants } from "@tour/shared";
import { AUDIO_INSIGHTS_STATUS_LABELS } from "@tour/shared";
import { Activity, Loader2 } from "lucide-react";

import { SessionAudioInsightsPanel } from "./SessionAudioInsightsPanel";
import styles from "./session-detail.module.css";

type AudioInsightsResponse = {
  status: AudioInsightsStatus;
  insights: AudioInsights | null;
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
          </>
        ) : status === "unavailable" ? (
          <>
            <Activity size={28} aria-hidden />
            <p>Audio insights are not configured.</p>
            <p className={styles.audioPanelEmptyHint}>
              Set GEMINI_API_KEY on the server to enable sentiment and ambience analysis for every session.
            </p>
          </>
        ) : status === "failed" ? (
          <>
            <p>Audio insights could not be generated.</p>
            <p className={styles.audioPanelEmptyHint}>
              {error ?? "Re-process the session to try again."}
            </p>
          </>
        ) : (
          <>
            <p>No audio insights yet.</p>
            <p className={styles.audioPanelEmptyHint}>
              Insights will appear here once processing starts.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
