import type { LucideIcon } from "lucide-react-native";
import { ArrowLeft } from "lucide-react-native";
import React from "react";
import { StyleSheet, View } from "react-native";
import Reanimated, { FadeInDown } from "react-native-reanimated";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";

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
        <Button variant="outline" size="icon" onPress={onBack} className="h-10 w-10 rounded-lg">
          <Icon as={ArrowLeft} size={20} className="text-foreground" />
        </Button>
        <View style={styles.brandRow}>
          <TourMark size={18} />
          <Text className="text-[15px] font-black tracking-tight text-foreground">Tour</Text>
        </View>
        <View style={styles.navSpacer} />
      </View>

      {title ? (
        <View style={styles.titleBlock}>
          <View style={styles.titleCopy}>
            <Text selectable className="text-2xl font-black tracking-tight text-foreground" numberOfLines={2}>
              {title}
            </Text>
            {subtitle ? (
              <Text selectable className="text-[13px] font-bold text-muted-foreground" numberOfLines={1}>
                {subtitle}
              </Text>
            ) : null}
          </View>
          {meta && meta.length > 0 ? (
            <View style={styles.metaRow}>
              {meta.map((chip) => (
                <Badge key={chip.label} variant="secondary" className="flex-row items-center gap-1 rounded-md px-2 py-0.5">
                  <Icon as={chip.icon} size={12} className="text-muted-foreground" />
                  <Text className="text-[11px] font-bold text-secondary-foreground">{chip.label}</Text>
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
  root: {
    gap: 8,
    paddingHorizontal: SESSION_PAGE_PADDING,
    paddingBottom: 4,
  },
  navRow: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
  },
  brandRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  navSpacer: {
    width: 40,
    height: 40,
  },
  titleBlock: {
    gap: 10,
  },
  titleCopy: {
    gap: 4,
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
});
