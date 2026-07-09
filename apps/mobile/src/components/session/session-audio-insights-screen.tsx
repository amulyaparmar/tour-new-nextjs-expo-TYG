import type { AudioInsights, AudioInsightsStatus } from "@tour/shared";
import { AUDIO_INSIGHTS_STATUS_LABELS } from "@tour/shared";
import { Activity, RefreshCw } from "lucide-react-native";
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";

import { fetchAudioInsights, startAudioInsights } from "@/api";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useSessionPlayback } from "@/hooks/use-session-playback";

import { SessionAudioInsightsPanel } from "./session-audio-insights-panel";
import { SessionPlayer } from "./session-player";
import { TourScreenHeader } from "./tour-screen-header";

const POLLING = new Set<AudioInsightsStatus>(["pending", "processing"]);

export function SessionAudioInsightsScreen({
  sessionId,
  sessionTitle,
  initialStatus = "pending",
  initialInsights = null,
  onBack,
}: {
  sessionId: string;
  sessionTitle?: string;
  initialStatus?: AudioInsightsStatus;
  initialInsights?: AudioInsights | null;
  onBack: () => void;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [insights, setInsights] = useState(initialInsights);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const playback = useSessionPlayback(sessionId);

  const refresh = useCallback(async () => {
    try {
      const body = await fetchAudioInsights(sessionId);
      setStatus(body.status);
      setInsights(body.insights);
      setError(body.error ?? null);
    } catch {
      // Ignore transient errors while polling.
    }
  }, [sessionId]);

  useEffect(() => {
    if (!POLLING.has(status)) return;
    void refresh();
    const interval = setInterval(() => void refresh(), 3000);
    return () => clearInterval(interval);
  }, [refresh, status]);

  async function handleStart() {
    setStarting(true);
    setError(null);
    try {
      const body = await startAudioInsights(sessionId);
      setInsights(null);
      setStatus(body.status ?? "processing");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start audio insights.");
      setStatus("failed");
    } finally {
      setStarting(false);
    }
  }

  return (
    <View style={styles.root}>
      <TourScreenHeader onBack={onBack} title={sessionTitle ?? "Audio insights"} subtitle="Sentiment & speaker dynamics" />

      {status === "ready" && insights ? (
        <>
          <SessionAudioInsightsPanel
            insights={insights}
            onSeek={(seconds) => void playback.seekToSeconds(seconds, true)}
          />
          <SessionPlayer
            position={playback.position}
            duration={playback.duration}
            playing={playback.playing}
            speed={playback.speed}
            ready={playback.ready}
            progressPercent={playback.progressPercent}
            onToggle={() => void playback.togglePlayback()}
            onSpeed={() => void playback.changeSpeed()}
            onSeek={(ratio) => void playback.seekToSeconds(ratio * playback.duration)}
          />
        </>
      ) : (
        <View style={styles.empty}>
          {POLLING.has(status) ? (
            <>
              <ActivityIndicator size="large" color="#006ce5" />
              <Text style={styles.emptyTitle}>{AUDIO_INSIGHTS_STATUS_LABELS[status]}</Text>
              <Text style={styles.emptyHint}>
                Gemini is analyzing sentiment, speaker dynamics, and ambience from the recording.
              </Text>
            </>
          ) : (
            <>
              <Icon as={Activity} size={28} color="#667085" />
              <Text style={styles.emptyTitle}>
                {status === "failed"
                  ? "Audio insights could not be generated"
                  : status === "unavailable"
                    ? "Audio insights are not configured"
                    : "No audio insights yet"}
              </Text>
              <Text style={styles.emptyHint}>
                {error ??
                  (status === "unavailable"
                    ? "Set GEMINI_API_KEY on the server to enable audio analysis."
                    : "Run analysis to extract sentiment and speaker dynamics from the recording.")}
              </Text>
            </>
          )}
          <Pressable disabled={starting} onPress={() => void handleStart()} style={styles.actionBtn}>
            {starting ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Icon as={RefreshCw} size={14} color="#fff" />
                <Text style={styles.actionText}>Run audio insights</Text>
              </>
            )}
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#f4f7fb",
    paddingTop: 50,
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 28,
    paddingBottom: 80,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: "#101828",
    textAlign: "center",
  },
  emptyHint: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "600",
    color: "#667085",
    textAlign: "center",
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "#006ce5",
  },
  actionText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#fff",
  },
});
