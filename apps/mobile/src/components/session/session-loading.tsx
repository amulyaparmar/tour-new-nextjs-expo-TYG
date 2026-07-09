import { ArrowLeft } from "lucide-react-native";
import React from "react";
import { StyleSheet, View } from "react-native";
import Reanimated, { FadeIn } from "react-native-reanimated";

import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";

import { UIColors } from "@/lib/ui-colors";

import { SESSION_PAGE_PADDING, SESSION_SECTION_GAP } from "./session-layout";

export function SessionReviewSkeleton({ onBack }: { onBack?: () => void }) {
  return (
    <Reanimated.View entering={FadeIn.duration(220)} style={styles.root}>
      <View style={styles.chrome}>
        <View style={styles.navRow}>
          {onBack ? (
            <Button variant="outline" size="icon" onPress={onBack} style={styles.backBtn}>
              <Icon as={ArrowLeft} size={20} color={UIColors.foreground} />
            </Button>
          ) : (
            <Skeleton style={styles.iconSkeleton} />
          )}
          <Skeleton style={styles.brandSkeleton} />
          <View style={styles.iconSkeleton} />
        </View>

        <Skeleton style={styles.titleSkeleton} />
        <Skeleton style={styles.subtitleSkeleton} />
        <View style={styles.chipRow}>
          <Skeleton style={styles.chipSkeleton} />
          <Skeleton style={styles.chipSkeleton} />
          <Skeleton style={styles.chipSkeleton} />
        </View>

        <View style={styles.summaryRow}>
          <Skeleton style={styles.scoreSkeleton} />
          <Skeleton style={styles.actionsSkeleton} />
        </View>

        <Skeleton style={styles.insightSkeleton} />
        <Skeleton style={styles.insightSkeleton} />

        <Skeleton style={styles.segmentSkeleton} />
      </View>

      <View style={styles.body}>
        <Skeleton style={styles.cardSkeleton} />
        <Skeleton style={styles.cardSkeletonTall} />
        <Skeleton style={styles.cardSkeleton} />
      </View>
    </Reanimated.View>
  );
}

/** @deprecated Use SessionReviewSkeleton */
export function SessionLoading({ label: _label = "Loading session…" }: { label?: string }) {
  return <SessionReviewSkeleton />;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#f4f7fb",
    paddingTop: 50,
  },
  chrome: {
    gap: SESSION_SECTION_GAP,
    paddingHorizontal: SESSION_PAGE_PADDING,
    paddingBottom: 12,
  },
  navRow: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backBtn: { width: 40, height: 40, borderRadius: 12 },
  iconSkeleton: { width: 40, height: 40, borderRadius: 12 },
  brandSkeleton: {
    width: 72,
    height: 18,
    borderRadius: 8,
  },
  titleSkeleton: {
    width: "72%",
    height: 28,
    borderRadius: 10,
  },
  subtitleSkeleton: {
    width: "42%",
    height: 14,
    borderRadius: 8,
    marginTop: -8,
  },
  chipRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: -4,
  },
  chipSkeleton: {
    width: 88,
    height: 26,
    borderRadius: 999,
  },
  summaryRow: {
    flexDirection: "row",
    gap: 12,
  },
  scoreSkeleton: {
    width: 112,
    height: 84,
    borderRadius: 16,
  },
  actionsSkeleton: {
    flex: 1,
    height: 84,
    borderRadius: 16,
  },
  insightSkeleton: {
    width: "100%",
    height: 108,
    borderRadius: 16,
  },
  segmentSkeleton: {
    width: "100%",
    height: 44,
    borderRadius: 12,
  },
  body: {
    flex: 1,
    gap: SESSION_SECTION_GAP,
    paddingHorizontal: SESSION_PAGE_PADDING,
    paddingTop: 8,
    paddingBottom: 120,
  },
  cardSkeleton: {
    width: "100%",
    height: 96,
    borderRadius: 16,
  },
  cardSkeletonTall: {
    width: "100%",
    height: 168,
    borderRadius: 16,
  },
});
