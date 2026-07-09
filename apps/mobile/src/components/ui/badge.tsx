import { TextStyleContext } from "@/components/ui/text";
import { UIColors } from "@/lib/ui-colors";
import { Slot } from "@rn-primitives/slot";
import { StyleSheet, View, type ViewProps } from "react-native";

type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

const badgeStyles = StyleSheet.create({
  base: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: UIColors.border,
    paddingHorizontal: 8,
    paddingVertical: 2,
    alignSelf: "flex-start",
  },
  default: { backgroundColor: UIColors.primary, borderColor: "transparent" },
  secondary: { backgroundColor: UIColors.secondary, borderColor: "transparent" },
  destructive: { backgroundColor: UIColors.destructive, borderColor: "transparent" },
  outline: { backgroundColor: "transparent" },
});

const badgeTextStyles = StyleSheet.create({
  default: { color: UIColors.primaryForeground, fontSize: 12, fontWeight: "600" },
  secondary: { color: UIColors.secondaryForeground, fontSize: 12, fontWeight: "600" },
  destructive: { color: "#fff", fontSize: 12, fontWeight: "600" },
  outline: { color: UIColors.foreground, fontSize: 12, fontWeight: "600" },
});

type BadgeProps = ViewProps & {
  asChild?: boolean;
  variant?: BadgeVariant;
};

function Badge({ style, variant = "default", asChild, ...props }: BadgeProps) {
  const Component = asChild ? Slot : View;
  return (
    <TextStyleContext.Provider value={badgeTextStyles[variant]}>
      <Component style={[badgeStyles.base, badgeStyles[variant], style]} {...props} />
    </TextStyleContext.Provider>
  );
}

export { Badge };
export type { BadgeProps };
