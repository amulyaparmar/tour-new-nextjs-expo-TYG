import { Text, View, StyleSheet, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import {
  formatSessionCardDescription,
  formatSessionCardMeta,
  formatSessionCardTitle,
  type SessionCardFields,
} from "@tour/shared";

type SessionCardCopyProps = {
  session: SessionCardFields;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
  titleStyle?: StyleProp<TextStyle>;
  metaStyle?: StyleProp<TextStyle>;
  descriptionStyle?: StyleProp<TextStyle>;
  titleLines?: number;
  metaLines?: number;
  descriptionLines?: number;
};

/** Same layout as before: title + meta, optional analysis description. */
export function SessionCardCopy({
  session,
  compact = false,
  style,
  titleStyle,
  metaStyle,
  descriptionStyle,
  titleLines = 1,
  metaLines = 1,
  descriptionLines = 2,
}: SessionCardCopyProps) {
  const title = formatSessionCardTitle(session);
  const meta = formatSessionCardMeta(session);
  const description = formatSessionCardDescription(session);

  return (
    <View style={style}>
      <Text style={[styles.title, titleStyle]} numberOfLines={titleLines}>
        {title}
      </Text>
      <Text style={[styles.meta, metaStyle]} numberOfLines={metaLines}>
        {meta}
      </Text>
      {!compact && description ? (
        <Text style={[styles.description, descriptionStyle]} numberOfLines={descriptionLines}>
          {description}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0f172a",
  },
  meta: {
    marginTop: 2,
    fontSize: 12,
    color: "#64748b",
  },
  description: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 16,
    color: "#667085",
  },
});
