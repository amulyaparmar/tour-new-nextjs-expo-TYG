import { CheckCheck, ChevronRight } from "lucide-react-native";
import React from "react";
import { StyleSheet, View } from "react-native";
import Reanimated, { FadeInDown } from "react-native-reanimated";

import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { scoreColor } from "@/theme/tour-brand";

import { MotionPressable } from "../ui/motion";
import { SESSION_PAGE_PADDING } from "./session-layout";

export function SessionSummaryStrip({
  score,
  pointsEarned,
  pointsPossible,
  openActionCount,
  onCoachingPress,
}: {
  score: number;
  pointsEarned?: number;
  pointsPossible?: number;
  openActionCount: number;
  onCoachingPress: () => void;
}) {
  const color = scoreColor(score);
  const ptsLabel =
    pointsEarned != null && pointsPossible != null ? `${pointsEarned}/${pointsPossible} pts` : null;

  return (
    <Reanimated.View entering={FadeInDown.delay(60).duration(360).springify()} style={styles.row}>
      <View style={[styles.scoreCard, { borderColor: `${color}33`, backgroundColor: `${color}10` }]}>
        <Text selectable style={[styles.scoreValue, { color }]}>
          {score}%
        </Text>
        <Text style={styles.scoreLabel}>Tour score</Text>
        {ptsLabel ? <Text style={styles.scorePts}>{ptsLabel}</Text> : null}
      </View>

      <MotionPressable onPress={onCoachingPress} haptic="selection" style={styles.actionsPress}>
        <View style={styles.actionsCard}>
          <View style={styles.actionsIcon}>
            <Icon as={CheckCheck} size={18} color="#006ce5" />
          </View>
          <View style={styles.actionsCopy}>
            <Text style={styles.actionsTitle}>
              {openActionCount} coaching {openActionCount === 1 ? "action" : "actions"}
            </Text>
            <Text style={styles.actionsLink}>View next steps</Text>
          </View>
          <Icon as={ChevronRight} size={17} color="#8a94a6" />
        </View>
      </MotionPressable>
    </Reanimated.View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 10,
    paddingHorizontal: SESSION_PAGE_PADDING,
    paddingBottom: 12,
  },
  scoreCard: {
    width: 112,
    minHeight: 76,
    justifyContent: "center",
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  scoreValue: {
    fontSize: 28,
    fontWeight: "900",
    lineHeight: 32,
    fontVariant: ["tabular-nums"],
  },
  scoreLabel: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: "900",
    textTransform: "uppercase",
    color: "#667085",
  },
  scorePts: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: "700",
    color: "#667085",
    fontVariant: ["tabular-nums"],
  },
  actionsPress: {
    flex: 1,
  },
  actionsCard: {
    flex: 1,
    minHeight: 76,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#dbeafe",
    backgroundColor: "#fff",
  },
  actionsIcon: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: "#eff6ff",
  },
  actionsCopy: {
    flex: 1,
    gap: 2,
  },
  actionsTitle: {
    fontSize: 14,
    fontWeight: "900",
    color: "#101828",
  },
  actionsLink: {
    fontSize: 11,
    fontWeight: "800",
    color: "#006ce5",
  },
});
