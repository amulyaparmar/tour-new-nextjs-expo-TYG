import { Ionicons } from "@expo/vector-icons";
import React, { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Reanimated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { formatElapsed } from "./formatElapsed";
import { useRecording } from "./RecordingProvider";

const C = {
  red: "#b91c1c",
  redSoft: "rgba(255,255,255,0.18)",
  text: "#fff",
} as const;

type LiveActivityBannerProps = {
  /** Extra top inset when the banner sits under the status bar. */
  topInset?: number;
  /** Keep visible even if provider briefly reports not recording. */
  forceVisible?: boolean;
  onStop?: () => void;
};

/**
 * Compact in-app recording strip used on the AI Chat tab.
 * Lock Screen / Dynamic Island still use Live Activity separately.
 */
export function LiveActivityBanner({ topInset = 0, forceVisible = false, onStop }: LiveActivityBannerProps) {
  const { isRecording, isPaused, elapsed, togglePause } = useRecording();
  const pulse = useSharedValue(1);

  useEffect(() => {
    if ((!isRecording && !forceVisible) || isPaused) {
      pulse.value = 1;
      return;
    }
    pulse.value = withRepeat(
      withSequence(
        withTiming(0.35, { duration: 700, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 700, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );
  }, [forceVisible, isPaused, isRecording, pulse]);

  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  if (!isRecording && !forceVisible) return null;

  const statusLabel = isPaused ? "Paused" : "Recording";

  return (
    <View style={[laSt.banner, topInset > 0 && { paddingTop: Math.max(topInset, 10) }]} accessibilityRole="summary">
      <Reanimated.View style={[laSt.dot, pulseStyle, isPaused && laSt.dotPaused]} />
      <Ionicons name={isPaused ? "pause" : "mic"} size={16} color={C.text} />
      <Text style={laSt.label}>{statusLabel}</Text>
      <Text style={laSt.timer}>{formatElapsed(elapsed)}</Text>
      <View style={laSt.spacer} />
      <Pressable
        accessibilityLabel={isPaused ? "Resume recording" : "Pause recording"}
        hitSlop={8}
        onPress={() => void togglePause()}
        style={laSt.control}
      >
        <Ionicons name={isPaused ? "play" : "pause"} size={16} color={C.text} />
      </Pressable>
      {onStop ? (
        <Pressable accessibilityLabel="Stop recording" hitSlop={8} onPress={onStop} style={laSt.stopControl}>
          <View style={laSt.stopSquare} />
        </Pressable>
      ) : null}
    </View>
  );
}

const laSt = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: C.red,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#fff",
  },
  dotPaused: {
    backgroundColor: "#FDBA74",
  },
  label: {
    fontSize: 13,
    fontWeight: "800",
    color: C.text,
  },
  timer: {
    fontSize: 15,
    fontWeight: "900",
    color: C.text,
    fontVariant: ["tabular-nums"],
  },
  spacer: { flex: 1, minWidth: 8 },
  control: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.redSoft,
  },
  stopControl: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.22)",
  },
  stopSquare: {
    width: 11,
    height: 11,
    borderRadius: 2,
    backgroundColor: C.text,
  },
});
