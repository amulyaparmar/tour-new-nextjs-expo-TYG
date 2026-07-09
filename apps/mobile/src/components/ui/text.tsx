import { UIColors } from "@/lib/ui-colors";
import { Slot } from "@rn-primitives/slot";
import * as React from "react";
import { Platform, StyleSheet, Text as RNText, type Role, type TextStyle } from "react-native";

export type TextVariant =
  | "default"
  | "h1"
  | "h2"
  | "h3"
  | "h4"
  | "p"
  | "lead"
  | "large"
  | "small"
  | "muted";

const ROLE: Partial<Record<TextVariant, Role>> = {
  h1: "heading",
  h2: "heading",
  h3: "heading",
  h4: "heading",
};

const ARIA_LEVEL: Partial<Record<TextVariant, string>> = {
  h1: "1",
  h2: "2",
  h3: "3",
  h4: "4",
};

const variantStyles = StyleSheet.create({
  default: { color: UIColors.foreground, fontSize: 16 },
  h1: { color: UIColors.foreground, fontSize: 36, fontWeight: "800", textAlign: "center" },
  h2: { color: UIColors.foreground, fontSize: 30, fontWeight: "600" },
  h3: { color: UIColors.foreground, fontSize: 24, fontWeight: "600" },
  h4: { color: UIColors.foreground, fontSize: 20, fontWeight: "600" },
  p: { color: UIColors.foreground, fontSize: 16, lineHeight: 24, marginTop: 12 },
  lead: { color: UIColors.mutedForeground, fontSize: 20 },
  large: { color: UIColors.foreground, fontSize: 18, fontWeight: "600" },
  small: { color: UIColors.foreground, fontSize: 14, fontWeight: "500" },
  muted: { color: UIColors.mutedForeground, fontSize: 14 },
});

const TextStyleContext = React.createContext<TextStyle | undefined>(undefined);

function Text({
  style,
  asChild = false,
  variant = "default",
  ...props
}: React.ComponentProps<typeof RNText> &
  React.RefAttributes<typeof RNText> & {
    asChild?: boolean;
    variant?: TextVariant;
  }) {
  const contextStyle = React.useContext(TextStyleContext);
  const Component = asChild ? Slot : RNText;
  return (
    <Component
      style={[variantStyles[variant], contextStyle, style]}
      role={variant ? ROLE[variant] : undefined}
      aria-level={variant ? ARIA_LEVEL[variant] : undefined}
      {...props}
    />
  );
}

/** @deprecated Use TextStyleContext */
const TextClassContext = TextStyleContext;

export { Text, TextClassContext, TextStyleContext };
