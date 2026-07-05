import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useRef } from "react";
import { Animated, Platform, StyleSheet, Text, View } from "react-native";
import { formatElapsed } from "./formatElapsed";
import { useRecording } from "./RecordingProvider";

const C = { red: "#b91c1c" } as const;

export function LiveActivityBanner() {
  const { isRecording, elapsed } = useRecording();
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!isRecording) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.3, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [isRecording, pulseAnim]);

  if (!isRecording) return null;

  return (
    <View style={laSt.banner}>
      <Animated.View style={[laSt.dot, { opacity: pulseAnim }]} />
      <Ionicons name="mic" size={16} color="#fff" />
      <Text style={laSt.label}>Recording</Text>
      <Text style={laSt.timer}>{formatElapsed(elapsed)}</Text>
      <View style={laSt.spacer} />
      <Text style={laSt.activeLabel}>Continues in background</Text>
    </View>
  );
}

const laSt = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: C.red,
    paddingHorizontal: 16,
    paddingVertical: 10,
    paddingTop: Platform.OS === "ios" ? 54 : 10,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#fff",
  },
  label: {
    fontSize: 13,
    fontWeight: "800",
    color: "#fff",
  },
  timer: {
    fontSize: 15,
    fontWeight: "900",
    color: "#fff",
    fontVariant: ["tabular-nums"],
  },
  spacer: { flex: 1 },
  activeLabel: { fontSize: 11, fontWeight: "700", color: "rgba(255,255,255,0.86)" },
});
