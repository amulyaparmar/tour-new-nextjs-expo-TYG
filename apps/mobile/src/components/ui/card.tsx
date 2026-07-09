import { Text, TextStyleContext } from "@/components/ui/text";
import { UIColors } from "@/lib/ui-colors";
import { StyleSheet, View, type ViewProps } from "react-native";

const styles = StyleSheet.create({
  card: {
    backgroundColor: UIColors.card,
    borderWidth: 1,
    borderColor: UIColors.border,
    borderRadius: 12,
    paddingVertical: 24,
    gap: 24,
  },
  header: { gap: 6, paddingHorizontal: 24 },
  content: { paddingHorizontal: 24 },
  footer: { flexDirection: "row", alignItems: "center", paddingHorizontal: 24 },
  title: { fontWeight: "600", color: UIColors.foreground },
  description: { color: UIColors.mutedForeground, fontSize: 14 },
});

function Card({ style, ...props }: ViewProps) {
  return (
    <TextStyleContext.Provider value={{ color: UIColors.cardForeground }}>
      <View style={[styles.card, style]} {...props} />
    </TextStyleContext.Provider>
  );
}

function CardHeader({ style, ...props }: ViewProps) {
  return <View style={[styles.header, style]} {...props} />;
}

function CardTitle({ style, ...props }: React.ComponentProps<typeof Text>) {
  return <Text style={[styles.title, style]} {...props} />;
}

function CardDescription({ style, ...props }: React.ComponentProps<typeof Text>) {
  return <Text style={[styles.description, style]} {...props} />;
}

function CardContent({ style, ...props }: ViewProps) {
  return <View style={[styles.content, style]} {...props} />;
}

function CardFooter({ style, ...props }: ViewProps) {
  return <View style={[styles.footer, style]} {...props} />;
}

export { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle };
