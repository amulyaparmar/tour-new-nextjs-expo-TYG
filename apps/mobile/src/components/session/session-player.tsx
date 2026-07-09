import { Pause, Play } from "lucide-react-native";
import React, { useRef } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { Icon } from "@/components/ui/icon";

import { SESSION_PAGE_PADDING } from "./session-layout";

import { MotionPressable } from "../ui/motion";

export function SessionPlayer({
  position,
  duration,
  playing,
  speed,
  ready,
  progressPercent,
  onToggle,
  onSpeed,
  onSeek,
}: {
  position: number;
  duration: number;
  playing: boolean;
  speed: number;
  ready: boolean;
  progressPercent: number;
  onToggle: () => void;
  onSpeed: () => void;
  onSeek: (ratio: number) => void;
}) {
  const trackWidth = useRef(0);

  return (
    <View style={styles.dock}>
      <Pressable
        onPress={(event) => {
          const width = trackWidth.current;
          if (width <= 0) return;
          onSeek(Math.max(0, Math.min(1, event.nativeEvent.locationX / width)));
        }}
        style={styles.trackHit}
      >
        <View
          style={styles.track}
          onLayout={(event) => {
            trackWidth.current = event.nativeEvent.layout.width;
          }}
        >
          <View style={[styles.fill, { width: `${progressPercent}%` }]} />
        </View>
      </Pressable>

      <View style={styles.row}>
        <Pressable onPress={onSpeed} hitSlop={10} style={styles.speedBtn}>
          <Text style={styles.speedText}>{speed}x</Text>
        </Pressable>

        <Text style={styles.time}>
          {fmt(position)} / {fmt(duration)}
        </Text>

        <MotionPressable
          disabled={!ready}
          onPress={onToggle}
          haptic="medium"
          style={[styles.playBtn, !ready && styles.playBtnDisabled]}
        >
          {!ready ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Icon as={playing ? Pause : Play} size={22} color="#fff" />
          )}
        </MotionPressable>
      </View>
    </View>
  );
}

function fmt(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

const styles = StyleSheet.create({
  dock: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    gap: 12,
    paddingHorizontal: SESSION_PAGE_PADDING,
    paddingTop: 14,
    paddingBottom: 28,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    backgroundColor: "#fff",
    shadowColor: "#101828",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 12,
  },
  trackHit: {
    paddingVertical: 4,
  },
  track: {
    height: 4,
    borderRadius: 999,
    backgroundColor: "#e8edf5",
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: "#006ce5",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  speedBtn: {
    minWidth: 36,
    paddingVertical: 4,
  },
  speedText: {
    fontSize: 13,
    fontWeight: "900",
    color: "#101828",
    fontVariant: ["tabular-nums"],
  },
  time: {
    flex: 1,
    textAlign: "center",
    fontSize: 13,
    fontWeight: "800",
    color: "#667085",
    fontVariant: ["tabular-nums"],
  },
  playBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#006ce5",
  },
  playBtnDisabled: {
    opacity: 0.55,
  },
});
