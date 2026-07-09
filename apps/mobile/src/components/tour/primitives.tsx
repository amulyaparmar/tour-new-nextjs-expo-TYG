import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { View, type KeyboardTypeOptions, type TextInputProps } from "react-native";
import Reanimated, { FadeIn, FadeInDown } from "react-native-reanimated";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { selectionHaptic } from "@/lib/haptics";

export function TourBackButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Button
      variant="outline"
      size="sm"
      onPress={() => {
        selectionHaptic();
        onPress();
      }}
      className="self-start rounded-full border-border bg-card px-3"
    >
      <Ionicons name="chevron-back" size={16} color="#64748b" />
      <Text className="text-sm font-extrabold text-muted-foreground">{label}</Text>
    </Button>
  );
}

export function TourPrimaryButton({
  label,
  onPress,
  icon,
  disabled,
  className,
}: {
  label: string;
  onPress: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <Button
      size="lg"
      disabled={disabled}
      onPress={() => {
        selectionHaptic();
        onPress();
      }}
      className={cn("min-h-[52px] rounded-lg", className)}
    >
      {icon ? <Ionicons name={icon} size={18} color="#fff" /> : null}
      <Text className="text-base font-black text-primary-foreground">{label}</Text>
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
      className="min-h-[52px] rounded-lg"
    >
      {icon ? <Ionicons name={icon} size={18} color="#64748b" /> : null}
      <Text className="text-base font-extrabold text-muted-foreground">{label}</Text>
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
  className,
}: {
  placeholder: string;
  value: string;
  onChangeText: (v: string) => void;
  icon?: keyof typeof Ionicons.glyphMap;
  multiline?: boolean;
  secureTextEntry?: boolean;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: TextInputProps["autoCapitalize"];
  className?: string;
}) {
  return (
    <View className={cn("flex-row items-center gap-2.5", multiline && "items-start")}>
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
        className={cn(
          "min-h-[52px] flex-1 rounded-lg border-input bg-muted/40 text-base font-semibold",
          multiline && "min-h-[96px] py-3",
          className
        )}
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
    <View className="gap-2">
      <Label className="text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground">
        {label}
      </Label>
      <ToggleGroup
        type="single"
        value={value}
        onValueChange={(next) => next && onChange(next)}
        variant="outline"
        className="flex-wrap gap-2 bg-transparent"
      >
        {options.map((option, index) => (
          <ToggleGroupItem
            key={option}
            value={option}
            isFirst={index === 0}
            isLast={index === options.length - 1}
            className="rounded-full border-border px-3.5 data-[state=on]:border-primary data-[state=on]:bg-secondary"
          >
            <Text
              className={cn(
                "text-sm font-extrabold text-muted-foreground",
                value === option && "text-secondary-foreground"
              )}
            >
              {option}
            </Text>
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
      <Card className="items-center gap-2 border-border py-8">
        <CardContent className="items-center gap-2 px-6">
          <Ionicons name={icon} size={36} color="#94a3b8" />
          <Text className="text-center text-lg font-black text-foreground">{title}</Text>
          {subtitle ? (
            <Text className="text-center text-sm text-muted-foreground">{subtitle}</Text>
          ) : null}
        </CardContent>
      </Card>
    </Reanimated.View>
  );
}

export function TourLoadingBox({ rows = 3 }: { rows?: number }) {
  return (
    <Reanimated.View entering={FadeIn.duration(220)} className="gap-3 p-4">
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton key={index} className="h-16 w-full rounded-xl" />
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
    <Badge
      variant="outline"
      className="rounded-full border-transparent px-2.5 py-1"
      style={{ backgroundColor: bg }}
    >
      <Text className="text-[10px] font-black uppercase" style={{ color }}>
        {label}
      </Text>
    </Badge>
  );
}

export function TourScreen({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <View className={cn("flex-1 bg-background", className)}>{children}</View>;
}
