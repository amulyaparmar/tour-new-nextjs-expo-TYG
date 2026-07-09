import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, View, type KeyboardTypeOptions, type TextInputProps, type ViewStyle } from "react-native";
import Reanimated, { FadeIn, FadeInDown } from "react-native-reanimated";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { UIColors } from "@/lib/ui-colors";
import { selectionHaptic } from "@/lib/haptics";

const st = StyleSheet.create({
  backBtn: { alignSelf: "flex-start", borderRadius: 999, paddingHorizontal: 12 },
  primaryBtn: { minHeight: 52, borderRadius: 8 },
  outlineBtn: { minHeight: 52, borderRadius: 8 },
  inputRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  inputRowMultiline: { alignItems: "flex-start" },
  input: { minHeight: 52, flex: 1, borderRadius: 8, backgroundColor: "rgba(241,245,249,0.9)", fontSize: 16, fontWeight: "600" },
  inputMultiline: { minHeight: 96, paddingTop: 12 },
  segWrap: { gap: 8 },
  segLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 0.4, textTransform: "uppercase", color: UIColors.mutedForeground },
  segGroup: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  segItem: { borderRadius: 999, paddingHorizontal: 14, borderColor: UIColors.border },
  segItemSelected: { borderColor: UIColors.primary, backgroundColor: UIColors.secondary },
  segText: { fontSize: 14, fontWeight: "800", color: UIColors.mutedForeground },
  segTextSelected: { color: UIColors.secondaryForeground },
  emptyCard: { alignItems: "center", gap: 8, borderColor: UIColors.border, paddingVertical: 32 },
  emptyContent: { alignItems: "center", gap: 8, paddingHorizontal: 24 },
  emptyTitle: { textAlign: "center", fontSize: 18, fontWeight: "900", color: UIColors.foreground },
  emptySub: { textAlign: "center", fontSize: 14, color: UIColors.mutedForeground },
  loadingWrap: { gap: 12, padding: 16 },
  skeleton: { height: 64, width: "100%", borderRadius: 12 },
  statusBadge: { borderRadius: 999, borderColor: "transparent", paddingHorizontal: 10, paddingVertical: 4 },
  screen: { flex: 1, backgroundColor: UIColors.background },
});

export function TourBackButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Button
      variant="outline"
      size="sm"
      onPress={() => {
        selectionHaptic();
        onPress();
      }}
      style={st.backBtn}
    >
      <Ionicons name="chevron-back" size={16} color="#64748b" />
      <Text style={{ fontSize: 14, fontWeight: "800", color: UIColors.mutedForeground }}>{label}</Text>
    </Button>
  );
}

export function TourPrimaryButton({
  label,
  onPress,
  icon,
  disabled,
  style,
}: {
  label: string;
  onPress: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  disabled?: boolean;
  style?: ViewStyle;
}) {
  return (
    <Button
      size="lg"
      disabled={disabled}
      onPress={() => {
        selectionHaptic();
        onPress();
      }}
      style={[st.primaryBtn, style]}
    >
      {icon ? <Ionicons name={icon} size={18} color="#fff" /> : null}
      <Text style={{ fontSize: 16, fontWeight: "900", color: UIColors.primaryForeground }}>{label}</Text>
    </Button>
  );
}

export function TourOutlineButton({
  label,
  onPress,
  icon,
  disabled,
}: {
  label: string;
  onPress: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  disabled?: boolean;
}) {
  return (
    <Button
      variant="outline"
      size="lg"
      disabled={disabled}
      onPress={() => {
        selectionHaptic();
        onPress();
      }}
      style={st.outlineBtn}
    >
      {icon ? <Ionicons name={icon} size={18} color="#64748b" /> : null}
      <Text style={{ fontSize: 16, fontWeight: "800", color: UIColors.mutedForeground }}>{label}</Text>
    </Button>
  );
}

export function TourInput({
  placeholder,
  value,
  onChangeText,
  icon,
  multiline,
  secureTextEntry,
  keyboardType,
  autoCapitalize,
  style,
}: {
  placeholder: string;
  value: string;
  onChangeText: (v: string) => void;
  icon?: keyof typeof Ionicons.glyphMap;
  multiline?: boolean;
  secureTextEntry?: boolean;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: TextInputProps["autoCapitalize"];
  style?: ViewStyle;
}) {
  return (
    <View style={[st.inputRow, multiline && st.inputRowMultiline, style]}>
      {icon ? (
        <Ionicons
          name={icon}
          size={18}
          color="#94a3b8"
          style={multiline ? { marginTop: 14 } : undefined}
        />
      ) : null}
      <Input
        placeholder={placeholder}
        value={value}
        onChangeText={onChangeText}
        multiline={multiline}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        textAlignVertical={multiline ? "top" : "center"}
        style={[st.input, multiline && st.inputMultiline]}
      />
    </View>
  );
}

export function TourSegPicker({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <View style={st.segWrap}>
      <Label style={st.segLabel}>{label}</Label>
      <ToggleGroup
        type="single"
        value={value}
        onValueChange={(next) => next && onChange(next)}
        variant="outline"
        style={st.segGroup}
      >
        {options.map((option, index) => (
          <ToggleGroupItem
            key={option}
            value={option}
            isFirst={index === 0}
            isLast={index === options.length - 1}
            style={[st.segItem, value === option && st.segItemSelected]}
          >
            <Text style={[st.segText, value === option && st.segTextSelected]}>{option}</Text>
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </View>
  );
}

export function TourEmptyState({
  icon,
  title,
  subtitle,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
}) {
  return (
    <Reanimated.View entering={FadeInDown.duration(260).springify()}>
      <Card style={st.emptyCard}>
        <CardContent style={st.emptyContent}>
          <Ionicons name={icon} size={36} color="#94a3b8" />
          <Text style={st.emptyTitle}>{title}</Text>
          {subtitle ? <Text style={st.emptySub}>{subtitle}</Text> : null}
        </CardContent>
      </Card>
    </Reanimated.View>
  );
}

export function TourLoadingBox({ rows = 3 }: { rows?: number }) {
  return (
    <Reanimated.View entering={FadeIn.duration(220)} style={st.loadingWrap}>
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton key={index} style={st.skeleton} />
      ))}
    </Reanimated.View>
  );
}

export function TourStatusBadge({
  label,
  bg,
  color,
}: {
  label: string;
  bg: string;
  color: string;
}) {
  return (
    <Badge variant="outline" style={[st.statusBadge, { backgroundColor: bg }]}>
      <Text style={{ fontSize: 10, fontWeight: "900", textTransform: "uppercase", color }}>{label}</Text>
    </Badge>
  );
}

export function TourScreen({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
}) {
  return <View style={[st.screen, style]}>{children}</View>;
}
