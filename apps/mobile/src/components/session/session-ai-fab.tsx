import { Sparkles } from "lucide-react-native";
import React from "react";
import { StyleSheet, View } from "react-native";

import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { tourColors } from "@/theme/tour-brand";

import { MotionPressable } from "../ui/motion";

export function SessionAiFab({
  onPress,
  bottomOffset,
}: {
  onPress: () => void;
  bottomOffset: number;
}) {
  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom: bottomOffset }]}>
      <MotionPressable onPress={onPress} haptic="selection" style={styles.button}>
        <Icon as={Sparkles} size={17} color="#fff" />
        <Text style={styles.text}>AI</Text>
      </MotionPressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    right: 18,
    zIndex: 20,
  },
  button: {
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    borderRadius: 999,
    paddingHorizontal: 16,
    backgroundColor: tourColors.brand,
  },
  text: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "900",
  },
});
