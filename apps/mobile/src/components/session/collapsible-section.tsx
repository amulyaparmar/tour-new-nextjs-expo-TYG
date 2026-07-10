import { ChevronDown } from "lucide-react-native";
import React, { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Reanimated, { FadeInDown } from "react-native-reanimated";

import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { UIColors } from "@/lib/ui-colors";

export function CollapsibleSection({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <View style={styles.card}>
      <Pressable onPress={() => setOpen((value) => !value)} style={({ pressed }) => [styles.header, pressed && styles.pressed]}>
        <Text style={styles.title}>{title}</Text>
        <Icon as={ChevronDown} size={18} color={UIColors.mutedForeground} style={{ transform: [{ rotate: open ? "180deg" : "0deg" }] }} />
      </Pressable>
      {open ? (
        <Reanimated.View entering={FadeInDown.duration(180)} style={styles.body}>
          {children}
        </Reanimated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    overflow: "hidden",
    borderWidth: 1,
    borderColor: UIColors.border,
    borderRadius: 16,
    backgroundColor: "#fff",
  },
  header: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  title: {
    flex: 1,
    color: UIColors.foreground,
    fontSize: 14,
    fontWeight: "900",
  },
  body: {
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: UIColors.border,
    padding: 14,
  },
  pressed: {
    opacity: 0.78,
  },
});
