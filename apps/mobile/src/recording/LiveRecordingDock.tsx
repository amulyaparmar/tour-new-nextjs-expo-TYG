import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useRef } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { formatElapsed } from "./formatElapsed";
import { liveSessionHeadline } from "./liveSessionLabel";
import { useRecording } from "./RecordingProvider";

const C = {
  bar: "#101828",
  text: "#FFFFFF",
  muted: "rgba(255,255,255,0.72)",
  red: "#F97066",
  soft: "rgba(255,255,255,0.12)",
} as const;

/** Compact dock shown while a live recording continues and the full experience is minimized. */
export function LiveRecordingDock() {
  const insets = useSafeAreaInsets();
  const { isRecording, isPaused, elapsed, experienceVisible, liveMeta, expandExperience, togglePause } = useRecording();
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

  return (
    <View pointerEvents="box-none" style={[st.wrap, { bottom: Math.max(insets.bottom, 10) + 62 }]}>
      <Pressable accessibilityLabel="Return to live recording" onPress={expandExperience} style={st.dock}>
        <Animated.View style={[st.dot, { opacity: isPaused ? 1 : pulse }]} />
        <View style={st.copy}>
          <Text style={st.title} numberOfLines={1}>
            {isPaused ? "Paused" : "Live recording"}
          </Text>
          <Text style={st.meta} numberOfLines={1}>
            {liveSessionHeadline(liveMeta)} · {formatElapsed(elapsed)}
          </Text>
        </View>
        <Pressable
          accessibilityLabel={isPaused ? "Resume recording" : "Pause recording"}
          hitSlop={8}
          onPress={(event) => {
            event.stopPropagation?.();
            void togglePause();
          }}
          style={st.control}
        >
          <Ionicons name={isPaused ? "play" : "pause"} size={16} color={C.text} />
        </Pressable>
      </Pressable>
    </View>
  );
}

const st = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 16,
    right: 16,
    zIndex: 40,
  },
  dock: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    borderRadius: 18,
    backgroundColor: C.bar,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 8,
  },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.red },
  copy: { flex: 1, minWidth: 0, gap: 1 },
  title: { color: C.text, fontSize: 13, fontWeight: "900" },
  meta: { color: C.muted, fontSize: 12, fontWeight: "700" },
  control: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.soft,
  },
});
