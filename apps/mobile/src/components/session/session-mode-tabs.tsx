import { ClipboardList, GraduationCap, MessageCircle, MessageSquare } from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";
import React from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { selectionHaptic } from "@/lib/haptics";

import { SESSION_PAGE_PADDING } from "./session-layout";

export type SessionReviewMode = "rubric" | "transcript" | "coaching" | "comments";

const MODES: Array<{
  id: SessionReviewMode;
  label: string;
  icon: LucideIcon;
}> = [
  { id: "rubric", label: "Rubric", icon: ClipboardList },
  { id: "transcript", label: "Transcript", icon: MessageSquare },
  { id: "coaching", label: "Coaching", icon: GraduationCap },
  { id: "comments", label: "Comments", icon: MessageCircle },
];

export function SessionModeTabs({
  value,
  onChange,
}: {
  value: SessionReviewMode;
  onChange: (mode: SessionReviewMode) => void;
}) {
  return (
    <View style={styles.wrap}>
      <View style={styles.bar}>
        {MODES.map((mode) => {
          const active = value === mode.id;
          return (
            <Pressable
              key={mode.id}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              onPress={() => {
                selectionHaptic();
                onChange(mode.id);
              }}
              style={[styles.tab, active && styles.tabActive]}
            >
              <Icon as={mode.icon} size={16} color={active ? "#006ce5" : "#667085"} />
              <Text numberOfLines={1} style={[styles.label, active && styles.labelActive]}>
                {mode.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: SESSION_PAGE_PADDING,
    paddingTop: 4,
    paddingBottom: 0,
    backgroundColor: "#f4f7fb",
  },
  bar: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  tab: {
    flex: 1,
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingHorizontal: 10,
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
    marginBottom: -1,
  },
  tabActive: {
    borderBottomColor: "#006ce5",
  },
  label: {
    fontSize: 13,
    fontWeight: "800",
    color: "#667085",
  },
  labelActive: {
    color: "#006ce5",
  },
});
