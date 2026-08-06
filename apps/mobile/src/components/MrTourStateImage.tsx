import React from "react";
import {
  Image,
  type ImageStyle,
  type StyleProp,
} from "react-native";

export type MrTourState = "assistant" | "empty" | "search";

const SOURCES = {
  assistant: require("../../assets/images/mr-tour-assistant.png"),
  empty: require("../../assets/images/mr-tour-empty.png"),
  search: require("../../assets/images/mr-tour-search.png"),
} as const;

export function MrTourStateImage({
  state,
  size = 112,
  style,
}: {
  state: MrTourState;
  size?: number;
  style?: StyleProp<ImageStyle>;
}) {
  return (
    <Image
      accessibilityIgnoresInvertColors
      accessible={false}
      resizeMode="contain"
      source={SOURCES[state]}
      style={[{ width: size, height: size }, style]}
    />
  );
}
