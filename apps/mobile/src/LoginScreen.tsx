import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import type { VideoPlayer } from "expo-video";
import { VideoView } from "expo-video";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

import {
  type BusinessOption,
  type MobileAuthSession,
  listBusinesses,
  signIn,
} from "./auth";
import { TourLogo } from "./components/TourLogo";

const TOUR_BRAND = "#006ce5";

export function LoginScreen({
  player,
  onAuthenticated,
}: {
  player: VideoPlayer;
  onAuthenticated: (session: MobileAuthSession) => void;
}) {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<"community" | "credentials">("community");
  const [businesses, setBusinesses] = useState<BusinessOption[]>([]);
  const [selected, setSelected] = useState<BusinessOption | null>(null);
  const [query, setQuery] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    listBusinesses()
      .then((items) => active && setBusinesses(items))
      .catch((caught) => active && setError(caught instanceof Error ? caught.message : "Could not load communities."))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const value = query.trim().toLowerCase();
    return value
      ? businesses.filter((item) => `${item.name} ${item.companyName}`.toLowerCase().includes(value))
      : businesses;
  }, [businesses, query]);

  async function submit() {
    if (!selected || !email.trim() || !password) return;
    setSubmitting(true);
    setError(null);
    try {
      onAuthenticated(await signIn(email.trim(), password, selected.id));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Sign in failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View className="flex-1 bg-background">
      <View className="min-h-[245px] overflow-hidden bg-slate-900" style={{ height: "35%" }}>
        <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />
        <LinearGradient colors={["rgba(7,18,34,0.08)", "rgba(7,18,34,0.9)"]} style={StyleSheet.absoluteFill} />
        <View
          className="flex-1 justify-between px-5 pb-6"
          style={{ paddingTop: insets.top + 12 }}
        >
          <TourLogo width={78} color="#fff" />
          <View>
            <Text className="mb-2 text-[11px] font-extrabold tracking-wide text-white/70">
              LEASING OPERATIONS
            </Text>
            <Text className="max-w-[390px] text-[29px] font-black leading-[34px] text-white">
              Tours, coaching, and follow-up in one place.
            </Text>
          </View>
        </View>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1 bg-background px-5 pt-5"
      >
        {step === "community" ? (
          <>
            <View className="mb-4 min-h-14 flex-row items-start gap-3">
              <View className="flex-1">
                <Text className="text-[22px] font-black text-foreground">Choose community</Text>
                <Text className="mt-1 text-sm text-muted-foreground">
                  Select the property you are working from.
                </Text>
              </View>
              <Badge variant="secondary" className="rounded-md">
                <Text className="text-[11px] font-extrabold">1 of 2</Text>
              </Badge>
            </View>

            <View className="mb-3 min-h-12 flex-row items-center gap-2 rounded-lg border border-input bg-muted/40 px-3">
              <Ionicons name="search" size={18} color="#667085" />
              <Input
                value={query}
                onChangeText={setQuery}
                placeholder="Search communities"
                autoCapitalize="none"
                autoCorrect={false}
                className="flex-1 border-0 bg-transparent px-0 shadow-none"
              />
            </View>

            {error ? <LoginError message={error} /> : null}

            {loading ? (
              <View className="items-center gap-2 py-8">
                <ActivityIndicator color={TOUR_BRAND} />
                <Text className="text-sm font-semibold text-muted-foreground">Loading communities</Text>
              </View>
            ) : (
              <FlatList
                data={filtered}
                keyExtractor={(item) => item.id}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingTop: 8, paddingBottom: 28, gap: 8 }}
                renderItem={({ item }) => (
                  <Pressable
                    onPress={() => {
                      setSelected(item);
                      setError(null);
                      setStep("credentials");
                    }}
                  >
                    <Card className="border-border py-0">
                      <CardContent className="min-h-[66px] flex-row items-center gap-3 px-3 py-3">
                        <View className="h-10 w-10 items-center justify-center rounded-lg bg-secondary">
                          <Ionicons name="business-outline" size={19} color={TOUR_BRAND} />
                        </View>
                        <View className="min-w-0 flex-1">
                          <Text className="text-sm font-extrabold text-foreground" numberOfLines={1}>
                            {item.name}
                          </Text>
                          <Text className="mt-0.5 text-xs text-muted-foreground" numberOfLines={1}>
                            {item.companyName}
                          </Text>
                        </View>
                        {item.calendarConnected ? (
                          <Badge variant="outline" className="border-transparent bg-emerald-50">
                            <View className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                            <Text className="text-[10px] font-bold text-emerald-700">Calendar</Text>
                          </Badge>
                        ) : null}
                        <Ionicons name="chevron-forward" size={18} color="#98a2b3" />
                      </CardContent>
                    </Card>
                  </Pressable>
                )}
                ListEmptyComponent={
                  <View className="items-center gap-2 py-8">
                    <Ionicons name="business-outline" size={24} color="#98a2b3" />
                    <Text className="text-sm font-semibold text-muted-foreground">No matching communities</Text>
                  </View>
                }
              />
            )}
          </>
        ) : (
          <>
            <View className="mb-4 min-h-14 flex-row items-start gap-3">
              <Button
                variant="outline"
                size="icon"
                onPress={() => {
                  setStep("community");
                  setError(null);
                }}
                className="h-10 w-10 rounded-lg"
              >
                <Ionicons name="arrow-back" size={20} color="#344054" />
              </Button>
              <View className="flex-1">
                <Text className="text-[22px] font-black text-foreground">Sign in</Text>
                <Text className="mt-1 text-sm text-muted-foreground" numberOfLines={1}>
                  {selected?.name}
                </Text>
              </View>
              <Badge variant="secondary" className="rounded-md">
                <Text className="text-[11px] font-extrabold">2 of 2</Text>
              </Badge>
            </View>

            <LoginField
              label="EMAIL"
              icon="mail-outline"
              value={email}
              onChangeText={setEmail}
              placeholder="you@company.com"
              keyboardType="email-address"
              autoCapitalize="none"
              textContentType="username"
            />
            <LoginField
              label="PASSWORD"
              icon="lock-closed-outline"
              value={password}
              onChangeText={setPassword}
              placeholder="Enter your password"
              secureTextEntry
              textContentType="password"
              onSubmitEditing={() => void submit()}
            />

            {error ? <LoginError message={error} /> : null}

            <Button
              size="lg"
              disabled={submitting || !email.trim() || !password}
              onPress={() => void submit()}
              className="mt-1 min-h-[52px] rounded-lg"
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Text className="text-base font-extrabold text-primary-foreground">Continue</Text>
                  <Ionicons name="arrow-forward" size={18} color="#fff" />
                </>
              )}
            </Button>
          </>
        )}
      </KeyboardAvoidingView>
    </View>
  );
}

function LoginField({
  label,
  icon,
  className,
  ...props
}: React.ComponentProps<typeof Input> & { label: string; icon: keyof typeof Ionicons.glyphMap }) {
  return (
    <View className="mb-3.5 gap-1.5">
      <Label className="text-[11px] font-extrabold text-muted-foreground">{label}</Label>
      <View className="min-h-[50px] flex-row items-center gap-2 rounded-lg border border-input bg-card px-3">
        <Ionicons name={icon} size={18} color="#667085" />
        <Input
          {...props}
          className={cn("flex-1 border-0 bg-transparent px-0 shadow-none", className)}
        />
      </View>
    </View>
  );
}

function LoginError({ message }: { message: string }) {
  return (
    <Card className="mb-3 border-destructive/20 bg-destructive/5 py-2">
      <CardContent className="flex-row items-center gap-2 px-3 py-2">
        <Ionicons name="alert-circle-outline" size={18} color="#b42318" />
        <Text className="flex-1 text-xs font-semibold text-destructive">{message}</Text>
      </CardContent>
    </Card>
  );
}
