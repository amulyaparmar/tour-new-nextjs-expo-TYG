import { TextStyleContext } from "@/components/ui/text";
import { UIColors } from "@/lib/ui-colors";
import * as React from "react";
import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from "react-native";

type ButtonVariant = "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
type ButtonSize = "default" | "sm" | "lg" | "icon";

type ButtonProps = React.ComponentProps<typeof Pressable> &
  React.RefAttributes<typeof Pressable> & {
    variant?: ButtonVariant;
    size?: ButtonSize;
  };

const buttonStyles = StyleSheet.create({
  base: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 8,
  },
  default: { backgroundColor: UIColors.primary },
  destructive: { backgroundColor: UIColors.destructive },
  outline: { backgroundColor: UIColors.background, borderWidth: 1, borderColor: UIColors.border },
  secondary: { backgroundColor: UIColors.secondary },
  ghost: { backgroundColor: "transparent" },
  link: { backgroundColor: "transparent" },
  sizeDefault: { minHeight: 40, paddingHorizontal: 16, paddingVertical: 8 },
  sizeSm: { minHeight: 36, paddingHorizontal: 12, paddingVertical: 6 },
  sizeLg: { minHeight: 44, paddingHorizontal: 24, paddingVertical: 10 },
  sizeIcon: { width: 40, height: 40, paddingHorizontal: 0, paddingVertical: 0 },
  disabled: { opacity: 0.5 },
});

const buttonTextStyles = StyleSheet.create({
  default: { color: UIColors.primaryForeground, fontSize: 14, fontWeight: "600" },
  destructive: { color: "#fff", fontSize: 14, fontWeight: "600" },
  outline: { color: UIColors.foreground, fontSize: 14, fontWeight: "600" },
  secondary: { color: UIColors.secondaryForeground, fontSize: 14, fontWeight: "600" },
  ghost: { color: UIColors.foreground, fontSize: 14, fontWeight: "600" },
  link: { color: UIColors.primary, fontSize: 14, fontWeight: "600" },
});

function variantStyle(variant: ButtonVariant): StyleProp<ViewStyle> {
  return buttonStyles[variant];
}

function Button({ style, variant = "default", size = "default", disabled, ...props }: ButtonProps) {
  const sizeStyle =
    size === "icon" ? buttonStyles.sizeIcon
    : size === "sm" ? buttonStyles.sizeSm
    : size === "lg" ? buttonStyles.sizeLg
    : buttonStyles.sizeDefault;

  return (
    <TextStyleContext.Provider value={buttonTextStyles[variant]}>
      <Pressable
        style={(state) => {
          const resolved = typeof style === "function" ? style(state) : style;
          return [
            buttonStyles.base,
            variantStyle(variant),
            sizeStyle,
            disabled && buttonStyles.disabled,
            state.pressed && variant !== "link" && { opacity: 0.9 },
            resolved,
          ];
        }}
        role="button"
        disabled={disabled}
        {...props}
      />
    </TextStyleContext.Provider>
  );
}

export { Button };
export type { ButtonProps };
