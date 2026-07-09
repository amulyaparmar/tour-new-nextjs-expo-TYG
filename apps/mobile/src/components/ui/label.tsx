import { UIColors } from "@/lib/ui-colors";
import * as LabelPrimitive from "@rn-primitives/label";
import { StyleSheet, type ViewStyle } from "react-native";

import { Text } from "./text";

const styles = StyleSheet.create({
  root: { flexDirection: "row", alignItems: "center", gap: 8 },
  rootDisabled: { opacity: 0.5 },
  text: { color: UIColors.foreground, fontSize: 14, fontWeight: "500" },
});

function Label({
  style,
  onPress,
  onLongPress,
  onPressIn,
  onPressOut,
  disabled,
  ...props
}: React.ComponentProps<typeof LabelPrimitive.Text>) {
  return (
    <LabelPrimitive.Root
      style={StyleSheet.flatten([styles.root, disabled && styles.rootDisabled])}
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      disabled={disabled}
    >
      <LabelPrimitive.Text
        {...props}
        style={[styles.text, style]}
      />
    </LabelPrimitive.Root>
  );
}

export { Label };
