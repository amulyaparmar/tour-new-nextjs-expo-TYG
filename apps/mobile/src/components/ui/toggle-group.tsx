import { Icon } from "@/components/ui/icon";
import { TextStyleContext } from "@/components/ui/text";
import { UIColors } from "@/lib/ui-colors";
import * as ToggleGroupPrimitive from "@rn-primitives/toggle-group";
import * as React from "react";
import { StyleSheet, type ViewStyle } from "react-native";

type ToggleVariant = "default" | "outline";
type ToggleSize = "default" | "sm" | "lg";

const ToggleGroupContext = React.createContext<{ variant?: ToggleVariant; size?: ToggleSize } | null>(null);

const styles = StyleSheet.create({
  root: { flexDirection: "row", alignItems: "center", borderRadius: 8 },
  item: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 40,
    minWidth: 40,
    paddingHorizontal: 10,
    backgroundColor: "transparent",
  },
  itemOutline: {
    borderWidth: 1,
    borderColor: UIColors.input,
  },
  itemSelected: { backgroundColor: UIColors.accent },
  itemFirst: { borderTopLeftRadius: 8, borderBottomLeftRadius: 8 },
  itemLast: { borderTopRightRadius: 8, borderBottomRightRadius: 8 },
  itemDisabled: { opacity: 0.5 },
});

function ToggleGroup({
  style,
  variant,
  size,
  children,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Root> & {
  variant?: ToggleVariant;
  size?: ToggleSize;
}) {
  return (
    <ToggleGroupPrimitive.Root style={[styles.root, style]} {...props}>
      <ToggleGroupContext.Provider value={{ variant, size }}>
        {children}
      </ToggleGroupContext.Provider>
    </ToggleGroupPrimitive.Root>
  );
}

function useToggleGroupContext() {
  const context = React.useContext(ToggleGroupContext);
  if (context === null) {
    throw new Error("ToggleGroupItem must be rendered inside ToggleGroup");
  }
  return context;
}

function ToggleGroupItem({
  style,
  children,
  variant,
  size,
  isFirst,
  isLast,
  disabled,
  value,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Item> & {
  variant?: ToggleVariant;
  size?: ToggleSize;
  isFirst?: boolean;
  isLast?: boolean;
}) {
  const context = useToggleGroupContext();
  const { value: groupValue } = ToggleGroupPrimitive.useRootContext();
  const selected = ToggleGroupPrimitive.utils.getIsSelected(groupValue, value);
  const resolvedVariant = context.variant ?? variant ?? "default";

  return (
    <TextStyleContext.Provider
      value={{
        color: selected ? UIColors.accentForeground : UIColors.foreground,
        fontSize: 14,
        fontWeight: "600",
      }}
    >
      <ToggleGroupPrimitive.Item
        value={value}
        disabled={disabled}
        style={StyleSheet.flatten([
          styles.item,
          resolvedVariant === "outline" && styles.itemOutline,
          selected && styles.itemSelected,
          isFirst && styles.itemFirst,
          isLast && styles.itemLast,
          disabled && styles.itemDisabled,
          style,
        ])}
        {...props}
      >
        {children}
      </ToggleGroupPrimitive.Item>
    </TextStyleContext.Provider>
  );
}

function ToggleGroupIcon(props: React.ComponentProps<typeof Icon>) {
  return <Icon size={16} {...props} />;
}

export { ToggleGroup, ToggleGroupIcon, ToggleGroupItem };
