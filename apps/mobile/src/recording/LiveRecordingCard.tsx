import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useRef } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { formatElapsed } from "./formatElapsed";
import { liveSessionHeadline, liveSessionSubline } from "./liveSessionLabel";
import { useRecording } from "./RecordingProvider";

const C = {
  card: "#FFFFFF",
  border: "rgba(16,24,40,0.1)",
  text: "#101828",
  textSec: "#667085",
  textMuted: "#98A2B3",
  brand: "#006CE5",
  brandSoft: "#EAF4FF",
  red: "#D92D20",
  redSoft: "#FEF3F2",
} as const;

type LiveRecordingCardProps = {
  onPress?: () => void;
};

/** Tour-themed live session card for Home / Sessions while recording continues in the background. */
export function LiveRecordingCard({ onPress }: LiveRecordingCardProps) {
  const {
    isRecording,
    isPaused,
    elapsed,
    experienceVisible,
    liveMeta,
    transcriptPreview,
    expandExperience,
  } = useRecording();
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!isRecording || isPaused) {
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.35, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [isPaused, isRecording, pulse]);

  if (!isRecording || experienceVisible || !liveMeta) return null;

  const headline = liveSessionHeadline(liveMeta);
  const subline = liveSessionSubline(liveMeta, formatElapsed(elapsed));
  const preview =
    transcriptPreview.trim() ||
    (isPaused
      ? "Recording paused. Tap to return to the live tour."
      : "When someone starts speaking, live updates will appear here.");
  const initials = headline
    .split(/\s*[×x]\s*|\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <Pressable
      accessibilityLabel="Open live recording"
      onPress={() => {
        onPress?.();
        expandExperience();
      }}
      style={({ pressed }) => [st.card, pressed && st.pressed]}
    >
      <View style={st.avatar}>
        {initials ? (
          <Text style={st.avatarText}>{initials}</Text>
        ) : (
          <Ionicons name="mic" size={22} color={C.brand} />
        )}
      </View>
      <View style={st.body}>
        <Text style={st.title} numberOfLines={1}>
          {headline}
        </Text>
        <Text style={st.meta} numberOfLines={1}>
          {subline}
        </Text>
        <Text style={st.preview} numberOfLines={2}>
          {preview}
        </Text>
        <View style={st.liveBadge}>
          <Animated.View style={[st.liveDot, { opacity: isPaused ? 1 : pulse }]} />
          <Text style={st.liveText}>{isPaused ? "PAUSED" : "LIVE"}</Text>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={18} color={C.textMuted} />
    </Pressable>
  );
}

const st = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.card,
    shadowColor: "#101828",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  pressed: { opacity: 0.92 },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.brandSoft,
  },
  avatarText: { color: C.brand, fontSize: 15, fontWeight: "900", letterSpacing: 0.2 },
  body: { flex: 1, minWidth: 0, gap: 4 },
  title: { color: C.text, fontSize: 16, fontWeight: "900" },
  meta: { color: C.textSec, fontSize: 13, fontWeight: "700" },
  preview: { color: C.textMuted, fontSize: 13, lineHeight: 18, fontWeight: "600", marginTop: 2 },
  liveBadge: {
    alignSelf: "flex-start",
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: C.redSoft,
  },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.red },
  liveText: { color: C.red, fontSize: 11, fontWeight: "900", letterSpacing: 0.4 },
});
