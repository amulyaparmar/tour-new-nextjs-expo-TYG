import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { parseAiTextSegments } from "../session-ai-timestamps";

const C = {
  brand: "#006CE5",
  text: "#101828",
  textSec: "#667085",
};

type Props = {
  content: string;
  onSeek?: (seconds: number) => void;
};

export function AiChatText({ content, onSeek }: Props) {
  const segments = useMemo(() => parseAiTextSegments(content), [content]);
  if (!content.trim()) return null;

  return (
    <Text style={styles.body}>
      {segments.map((segment, index) => {
        if (segment.type === "text") {
          return <Text key={`t-${index}`}>{segment.value}</Text>;
        }
        if (onSeek) {
          return (
            <Pressable
              key={`s-${index}`}
              onPress={() => onSeek(segment.seconds)}
              hitSlop={4}
            >
              <Text style={styles.timestamp}>{segment.label}</Text>
            </Pressable>
          );
        }
        return (
          <Text key={`s-${index}`} style={styles.timestampStatic}>
            {segment.label}
          </Text>
        );
      })}
    </Text>
  );
}

const styles = StyleSheet.create({
  body: { fontSize: 14, fontWeight: "600", color: C.text, lineHeight: 22 },
  timestamp: {
    fontSize: 14,
    fontWeight: "800",
    color: C.brand,
    textDecorationLine: "underline",
  },
  timestampStatic: { fontSize: 14, fontWeight: "800", color: C.brand },
});
