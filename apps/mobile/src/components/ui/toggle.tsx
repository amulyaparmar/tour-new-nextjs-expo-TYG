import { TextStyleContext } from "@/components/ui/text";
import { UIColors } from "@/lib/ui-colors";
import * as TogglePrimitive from "@rn-primitives/toggle";
import { StyleSheet, type ViewStyle } from "react-native";

type ToggleVariant = "default" | "outline";
type ToggleSize = "default" | "sm" | "lg";

const styles = StyleSheet.create({
  base: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 8,
    backgroundColor: "transparent",
  },
  outline: {
    borderWidth: 1,
    borderColor: UIColors.input,
    backgroundColor: "transparent",
  },
  pressed: { backgroundColor: UIColors.accent },
  selected: { backgroundColor: UIColors.accent },
  sizeDefault: { minHeight: 40, minWidth: 40, paddingHorizontal: 10 },
  sizeSm: { minHeight: 36, minWidth: 36, paddingHorizontal: 8 },
  sizeLg: { minHeight: 44, minWidth: 44, paddingHorizontal: 12 },
  disabled: { opacity: 0.5 },
});

function sizeStyle(size: ToggleSize): ViewStyle {
  if (size === "sm") return styles.sizeSm;
  if (size === "lg") return styles.sizeLg;
  return styles.sizeDefault;
}

type ToggleProps = React.ComponentProps<typeof TogglePrimitive.Root> & {
  variant?: ToggleVariant;
  size?: ToggleSize;
};

function Toggle({ style, variant = "default", size = "default", disabled, pressed, ...props }: ToggleProps) {
  const resolvedStyle = StyleSheet.flatten([
    styles.base,
    sizeStyle(size),
    variant === "outline" && styles.outline,
    pressed && styles.pressed,
    disabled && styles.disabled,
    style,
  ]);

  return (
    <TextStyleContext.Provider
      value={{
        color: pressed ? UIColors.accentForeground : UIColors.foreground,
        fontSize: 14,
        fontWeight: "600",
      }}
    >
      <TogglePrimitive.Root
        style={resolvedStyle}
        disabled={disabled}
        pressed={pressed}
        {...props}
      />
    </TextStyleContext.Provider>
  );
}

export { Toggle };
