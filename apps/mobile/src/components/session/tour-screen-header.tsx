import type { LucideIcon } from "lucide-react-native";
import { ArrowLeft } from "lucide-react-native";
import React from "react";
import { StyleSheet, View } from "react-native";
import Reanimated, { FadeInDown } from "react-native-reanimated";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { UIColors } from "@/lib/ui-colors";

import { TourMark } from "../TourLogo";
import { SESSION_PAGE_PADDING } from "./session-layout";

export function TourScreenHeader({
  onBack,
  title,
  subtitle,
  meta,
}: {
  onBack: () => void;
  title?: string;
  subtitle?: string;
  meta?: Array<{ icon: LucideIcon; label: string }>;
}) {
  return (
    <Reanimated.View entering={FadeInDown.duration(280).springify()} style={styles.root}>
      <View style={styles.navRow}>
        <Button variant="outline" size="icon" onPress={onBack} style={styles.backBtn}>
          <Icon as={ArrowLeft} size={20} color={UIColors.foreground} />
        </Button>
        <View style={styles.brandRow}>
          <TourMark size={18} />
          <Text style={styles.brandText}>Tour</Text>
        </View>
        <View style={styles.navSpacer} />
      </View>

      {title ? (
        <View style={styles.titleBlock}>
          <View style={styles.titleCopy}>
            <Text selectable style={styles.title} numberOfLines={2}>{title}</Text>
            {subtitle ? (
              <Text selectable style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>
            ) : null}
          </View>
          {meta && meta.length > 0 ? (
            <View style={styles.metaRow}>
              {meta.map((chip) => (
                <Badge key={chip.label} variant="secondary" style={styles.metaBadge}>
                  <Icon as={chip.icon} size={12} color={UIColors.mutedForeground} />
                  <Text style={styles.metaText}>{chip.label}</Text>
                </Badge>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}
    </Reanimated.View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 8, paddingHorizontal: SESSION_PAGE_PADDING, paddingBottom: 4 },
  navRow: { minHeight: 44, flexDirection: "row", alignItems: "center" },
  backBtn: { width: 40, height: 40, borderRadius: 8 },
  brandRow: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  brandText: { fontSize: 15, fontWeight: "900", letterSpacing: -0.2, color: UIColors.foreground },
  navSpacer: { width: 40, height: 40 },
  titleBlock: { gap: 10 },
  titleCopy: { gap: 4 },
  title: { fontSize: 24, fontWeight: "900", letterSpacing: -0.3, color: UIColors.foreground },
  subtitle: { fontSize: 13, fontWeight: "700", color: UIColors.mutedForeground },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  metaBadge: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  metaText: { fontSize: 11, fontWeight: "700", color: UIColors.secondaryForeground },
});
