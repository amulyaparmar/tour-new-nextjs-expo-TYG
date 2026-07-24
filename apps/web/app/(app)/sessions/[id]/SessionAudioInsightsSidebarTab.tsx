"use client";

import { useEffect, useState } from "react";
import type {
  AudioInsights,
  AudioInsightsStatus,
  SessionParticipants,
  TranscriptConversationStats,
} from "@tour/shared";
import { AUDIO_INSIGHTS_STATUS_LABELS } from "@tour/shared";
import { Activity, BarChart3, Loader2, RefreshCw } from "lucide-react";

import {
  AudioAccordion,
  AudioStatsGrid,
  SessionAudioInsightsPanel,
} from "./SessionAudioInsightsPanel";
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
  fallbackConversationStats = null,
  participants,
  duration,
  currentTime,
  onSeek,
}: {
  sessionId: string;
  initialStatus: AudioInsightsStatus;
  initialInsights: AudioInsights | null;
  fallbackConversationStats?: TranscriptConversationStats | null;
  participants: SessionParticipants;
  duration: number;
  currentTime: number;
  onSeek: (seconds: number) => void;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [insights, setInsights] = useState(initialInsights);
  const transcriptConversationStats = fallbackConversationStats;
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
        fallbackConversationStats={transcriptConversationStats}
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
      <div className={styles.audioPanelScroll}>
        <div className={styles.audioAccordionStack}>
          {transcriptConversationStats ? (
            <AudioAccordion
              title="Conversation stats"
              icon={<BarChart3 size={14} aria-hidden />}
              defaultOpen
              preview={transcriptConversationStats.talkRatioPercent == null
                ? "Transcript estimate"
                : `${Math.round(transcriptConversationStats.talkRatioPercent)}% talk ratio`}
            >
              <AudioStatsGrid
                stats={transcriptConversationStats}
                source="transcript"
              />
            </AudioAccordion>
          ) : null}
          <div className={styles.audioPanelEmpty}>
            {POLLING_STATUSES.has(status) ? (
              <>
                <Loader2 size={28} className="animate-spin" aria-hidden />
                <p>{AUDIO_INSIGHTS_STATUS_LABELS[status]}</p>
                <p className={styles.audioPanelEmptyHint}>
                  Gemini is analyzing sentiment, speaker dynamics, ambience, and semantic interactivity. The transcript measurements above are available independently.
                </p>
                {rerunButton}
              </>
            ) : status === "unavailable" ? (
              <>
                <Activity size={28} aria-hidden />
                <p>Gemini enrichment is not configured.</p>
                <p className={styles.audioPanelEmptyHint}>
                  Transcript measurements remain available. Set GEMINI_API_KEY on the server to add sentiment and ambience analysis.
                </p>
                {rerunButton}
              </>
            ) : status === "failed" ? (
              <>
                <p>Gemini enrichment could not be generated.</p>
                <p className={styles.audioPanelEmptyHint}>
                  {error ?? "The transcript measurements remain available. Re-run audio insights to try Gemini again."}
                </p>
                {rerunButton}
              </>
            ) : (
              <>
                <p>{transcriptConversationStats ? "Gemini enrichment has not run yet." : "No audio insights yet."}</p>
                <p className={styles.audioPanelEmptyHint}>
                  Run audio insights to add sentiment, speaker dynamics, ambience, and semantic interactivity.
                </p>
                {rerunButton}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
