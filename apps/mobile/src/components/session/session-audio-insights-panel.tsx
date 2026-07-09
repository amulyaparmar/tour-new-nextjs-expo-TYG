import type { AudioInsights } from "@tour/shared";
import { formatSpeakerAnnotation } from "@tour/shared";
import { Activity, BarChart3, Mic2, Sparkles } from "lucide-react-native";
import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";

import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";

import { SESSION_PAGE_PADDING } from "./session-layout";

const SENTIMENT_LABELS = {
  positive: "Positive",
  neutral: "Neutral",
  negative: "Negative",
  mixed: "Mixed",
} as const;

const SENTIMENT_COLORS = {
  positive: "#16a34a",
  neutral: "#667085",
  negative: "#dc2626",
  mixed: "#d97706",
} as const;

function fmtSec(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

export function SessionAudioInsightsPanel({
  insights,
  onSeek,
}: {
  insights: AudioInsights;
  onSeek: (seconds: number) => void;
}) {
  const participants = insights.participants;
  const labelFor = (speaker: string) =>
    participants ? formatSpeakerAnnotation(speaker, participants) : speaker;

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.content}
    >
      <View style={styles.headerRow}>
        <Text style={styles.heading}>Overview</Text>
        <View
          style={[
            styles.sentimentBadge,
            { backgroundColor: `${SENTIMENT_COLORS[insights.overallSentiment]}18` },
          ]}
        >
          <Text style={[styles.sentimentText, { color: SENTIMENT_COLORS[insights.overallSentiment] }]}>
            {SENTIMENT_LABELS[insights.overallSentiment]}
          </Text>
        </View>
      </View>

      <Text style={styles.summary}>{insights.summary}</Text>

      <View style={styles.metaRow}>
        <MetaPill icon={Sparkles} label={insights.model.replace("gemini-", "Gemini ")} />
        <MetaPill icon={Mic2} label={`${insights.segments.length} segments`} />
      </View>

      {insights.conversationStats ? (
        <Section title="Conversation stats" icon={BarChart3}>
          <View style={styles.statsGrid}>
            <Stat label="Talk ratio" value={`${Math.round(insights.conversationStats.talkRatioPercent)}%`} />
            <Stat label="Patience" value={`${insights.conversationStats.patienceSeconds.toFixed(1)}s`} />
            <Stat
              label="Interactivity"
              value={`${insights.conversationStats.interactivityScore}/${insights.conversationStats.interactivityTotal}`}
            />
            <Stat label="Talk speed" value={`${Math.round(insights.conversationStats.talkSpeedWordsPerMinute)} wpm`} />
          </View>
        </Section>
      ) : null}

      {insights.speakerDynamics.length > 0 ? (
        <Section title="Speaker dynamics" icon={Activity}>
          <View style={styles.speakerList}>
            {insights.speakerDynamics.map((speaker) => {
              const total = insights.speakerDynamics.reduce((sum, item) => sum + item.talkTimeSeconds, 0);
              const share = total > 0 ? Math.round((speaker.talkTimeSeconds / total) * 100) : 0;
              return (
                <View key={speaker.speaker} style={styles.speakerCard}>
                  <View style={styles.speakerHead}>
                    <Text style={styles.speakerName}>{labelFor(speaker.speaker)}</Text>
                    <Text style={styles.speakerTime}>{fmtSec(speaker.talkTimeSeconds)}</Text>
                  </View>
                  <View style={styles.talkTrack}>
                    <View style={[styles.talkFill, { width: `${share}%` }]} />
                  </View>
                  <Text style={styles.speakerNotes}>{speaker.notes}</Text>
                </View>
              );
            })}
          </View>
        </Section>
      ) : null}

      {insights.highlights.length > 0 ? (
        <Section title="Highlights" icon={Sparkles}>
          <View style={styles.highlightList}>
            {insights.highlights.map((highlight) => (
              <Pressable
                key={`${highlight.timestamp}-${highlight.label}`}
                onPress={() => onSeek(highlight.timestamp)}
                style={styles.highlightCard}
              >
                <View style={styles.highlightHead}>
                  <Text style={styles.highlightLabel}>{highlight.label}</Text>
                  <Text style={styles.highlightTime}>{fmtSec(highlight.timestamp)}</Text>
                </View>
                <Text style={styles.highlightBody}>{highlight.explanation}</Text>
              </Pressable>
            ))}
          </View>
        </Section>
      ) : null}
    </ScrollView>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: typeof Activity;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <View style={styles.section}>
      <Pressable onPress={() => setOpen((value) => !value)} style={styles.sectionHead}>
        <Icon as={icon} size={15} color="#667085" />
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.sectionToggle}>{open ? "−" : "+"}</Text>
      </Pressable>
      {open ? children : null}
    </View>
  );
}

function MetaPill({ icon, label }: { icon: typeof Sparkles; label: string }) {
  return (
    <View style={styles.metaPill}>
      <Icon as={icon} size={12} color="#667085" />
      <Text style={styles.metaPillText}>{label}</Text>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 16,
    paddingHorizontal: SESSION_PAGE_PADDING,
    paddingTop: 8,
    paddingBottom: 160,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  heading: {
    fontSize: 16,
    fontWeight: "900",
    color: "#101828",
  },
  sentimentBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  sentimentText: {
    fontSize: 11,
    fontWeight: "900",
  },
  summary: {
    fontSize: 14,
    lineHeight: 21,
    fontWeight: "600",
    color: "#344054",
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  metaPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: "#eef2f7",
  },
  metaPillText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#667085",
  },
  section: {
    gap: 10,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#fff",
  },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sectionTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: "900",
    color: "#101828",
  },
  sectionToggle: {
    fontSize: 18,
    fontWeight: "900",
    color: "#667085",
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  statCard: {
    width: "48%",
    gap: 2,
    padding: 10,
    borderRadius: 12,
    backgroundColor: "#f8fafc",
  },
  statLabel: {
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
    color: "#667085",
  },
  statValue: {
    fontSize: 16,
    fontWeight: "900",
    color: "#101828",
    fontVariant: ["tabular-nums"],
  },
  speakerList: {
    gap: 10,
  },
  speakerCard: {
    gap: 6,
    padding: 10,
    borderRadius: 12,
    backgroundColor: "#f8fafc",
  },
  speakerHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  speakerName: {
    flex: 1,
    fontSize: 13,
    fontWeight: "800",
    color: "#101828",
  },
  speakerTime: {
    fontSize: 12,
    fontWeight: "800",
    color: "#667085",
    fontVariant: ["tabular-nums"],
  },
  talkTrack: {
    height: 6,
    borderRadius: 999,
    backgroundColor: "#e8edf5",
    overflow: "hidden",
  },
  talkFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: "#006ce5",
  },
  speakerNotes: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "600",
    color: "#667085",
  },
  highlightList: {
    gap: 8,
  },
  highlightCard: {
    gap: 4,
    padding: 10,
    borderRadius: 12,
    backgroundColor: "#f8fafc",
  },
  highlightHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  highlightLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: "900",
    color: "#101828",
  },
  highlightTime: {
    fontSize: 11,
    fontWeight: "800",
    color: "#006ce5",
    fontVariant: ["tabular-nums"],
  },
  highlightBody: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "600",
    color: "#667085",
  },
});
