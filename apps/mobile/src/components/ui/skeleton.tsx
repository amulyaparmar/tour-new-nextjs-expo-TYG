import { UIColors } from "@/lib/ui-colors";
import { StyleSheet, View, type ViewProps } from "react-native";

const styles = StyleSheet.create({
  skeleton: {
    backgroundColor: UIColors.muted,
    borderRadius: 8,
  },
});

function Skeleton({ style, ...props }: ViewProps) {
  return <View style={[styles.skeleton, style]} {...props} />;
}

export { Skeleton };
