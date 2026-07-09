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
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CommunityListRow } from "@/components/community-list-row";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Text } from "@/components/ui/text";
import { UIColors } from "@/lib/ui-colors";

import {
  type BusinessOption,
  type MobileAuthSession,
  listBusinesses,
  signIn,
} from "./auth";
import { TourLogo } from "./components/TourLogo";

const TOUR_BRAND = "#006ce5";

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: UIColors.background },
  hero: { minHeight: 245, overflow: "hidden", backgroundColor: "#0f172a" },
  heroBody: { flex: 1, justifyContent: "space-between", paddingHorizontal: 20, paddingBottom: 24 },
  heroKicker: { marginBottom: 8, fontSize: 11, fontWeight: "800", letterSpacing: 0.6, color: "rgba(255,255,255,0.7)" },
  heroTitle: { maxWidth: 390, fontSize: 29, fontWeight: "900", lineHeight: 34, color: "#fff" },
  form: { flex: 1, backgroundColor: UIColors.background, paddingHorizontal: 20, paddingTop: 20 },
  stepHeader: { marginBottom: 16, minHeight: 56, flexDirection: "row", alignItems: "flex-start", gap: 12 },
  stepHeaderText: { flex: 1 },
  stepTitle: { fontSize: 22, fontWeight: "900", color: UIColors.foreground },
  stepSub: { marginTop: 4, fontSize: 14, color: UIColors.mutedForeground },
  stepBadge: { borderRadius: 8 },
  searchBar: {
    marginBottom: 12,
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: UIColors.input,
    backgroundColor: "rgba(241,245,249,0.7)",
    paddingHorizontal: 12,
  },
  searchInput: { flex: 1, borderWidth: 0, backgroundColor: "transparent", shadowOpacity: 0, minHeight: 44 },
  loadingBox: { alignItems: "center", gap: 8, paddingVertical: 32 },
  loadingText: { fontSize: 14, fontWeight: "600", color: UIColors.mutedForeground },
  communityCard: {
    borderWidth: 1,
    borderColor: UIColors.border,
    borderRadius: 12,
    backgroundColor: UIColors.card,
    overflow: "hidden",
  },
  calendarBadge: { flexDirection: "row", alignItems: "center", gap: 4, borderColor: "transparent", backgroundColor: UIColors.emerald50 },
  calendarDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: UIColors.emerald500 },
  calendarText: { fontSize: 10, fontWeight: "700", color: UIColors.emerald700 },
  emptyList: { alignItems: "center", gap: 8, paddingVertical: 32 },
  backBtn: { width: 40, height: 40, borderRadius: 8 },
  continueBtn: { marginTop: 4, minHeight: 52, borderRadius: 8 },
  fieldWrap: { marginBottom: 14, gap: 6 },
  fieldLabel: { fontSize: 11, fontWeight: "800", color: UIColors.mutedForeground },
  fieldRow: {
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: UIColors.input,
    backgroundColor: UIColors.card,
    paddingHorizontal: 12,
  },
  fieldInput: { flex: 1, borderWidth: 0, backgroundColor: "transparent", minHeight: 44 },
  errorCard: { marginBottom: 12, borderColor: "rgba(239,68,68,0.2)", backgroundColor: "rgba(239,68,68,0.05)", paddingVertical: 8 },
  errorRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 8 },
  errorText: { flex: 1, fontSize: 12, fontWeight: "600", color: UIColors.destructive },
});

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
    <View style={st.root}>
      <View style={[st.hero, { height: "35%" }]}>
        <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />
        <LinearGradient colors={["rgba(7,18,34,0.08)", "rgba(7,18,34,0.9)"]} style={StyleSheet.absoluteFill} />
        <View style={[st.heroBody, { paddingTop: insets.top + 12 }]}>
          <TourLogo width={78} color="#fff" />
          <View>
            <Text style={st.heroKicker}>LEASING OPERATIONS</Text>
            <Text style={st.heroTitle}>Tours, coaching, and follow-up in one place.</Text>
          </View>
        </View>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={st.form}>
        {step === "community" ? (
          <>
            <View style={st.stepHeader}>
              <View style={st.stepHeaderText}>
                <Text style={st.stepTitle}>Choose community</Text>
                <Text style={st.stepSub}>Select the property you are working from.</Text>
              </View>
              <Badge variant="secondary" style={st.stepBadge}>
                <Text style={{ fontSize: 11, fontWeight: "800" }}>1 of 2</Text>
              </Badge>
            </View>

            <View style={st.searchBar}>
              <Ionicons name="search" size={18} color="#667085" />
              <Input
                value={query}
                onChangeText={setQuery}
                placeholder="Search communities"
                autoCapitalize="none"
                autoCorrect={false}
                style={st.searchInput}
              />
            </View>

            {error ? <LoginError message={error} /> : null}

            {loading ? (
              <View style={st.loadingBox}>
                <ActivityIndicator color={TOUR_BRAND} />
                <Text style={st.loadingText}>Loading communities</Text>
              </View>
            ) : (
              <FlatList
                data={filtered}
                keyExtractor={(item) => item.id}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingTop: 8, paddingBottom: 28, gap: 8 }}
                renderItem={({ item }) => (
                  <CommunityListRow
                    name={item.name}
                    subtitle={item.companyName}
                    showBorder={false}
                    style={st.communityCard}
                    accessory={
                      item.calendarConnected ? (
                        <Badge variant="outline" style={st.calendarBadge}>
                          <View style={st.calendarDot} />
                          <Text style={st.calendarText}>Calendar</Text>
                        </Badge>
                      ) : null
                    }
                    onPress={() => {
                      setSelected(item);
                      setError(null);
                      setStep("credentials");
                    }}
                  />
                )}
                ListEmptyComponent={
                  <View style={st.emptyList}>
                    <Ionicons name="business-outline" size={24} color="#98a2b3" />
                    <Text style={st.loadingText}>No matching communities</Text>
                  </View>
                }
              />
            )}
          </>
        ) : (
          <>
            <View style={st.stepHeader}>
              <Button
                variant="outline"
                size="icon"
                onPress={() => {
                  setStep("community");
                  setError(null);
                }}
                style={st.backBtn}
              >
                <Ionicons name="arrow-back" size={20} color="#344054" />
              </Button>
              <View style={st.stepHeaderText}>
                <Text style={st.stepTitle}>Sign in</Text>
                <Text style={st.stepSub} numberOfLines={1}>{selected?.name}</Text>
              </View>
              <Badge variant="secondary" style={st.stepBadge}>
                <Text style={{ fontSize: 11, fontWeight: "800" }}>2 of 2</Text>
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
              style={st.continueBtn}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Text style={{ fontSize: 16, fontWeight: "800", color: UIColors.primaryForeground }}>Continue</Text>
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
  style,
  ...props
}: React.ComponentProps<typeof Input> & { label: string; icon: keyof typeof Ionicons.glyphMap }) {
  return (
    <View style={st.fieldWrap}>
      <Label style={st.fieldLabel}>{label}</Label>
      <View style={st.fieldRow}>
        <Ionicons name={icon} size={18} color="#667085" />
        <Input {...props} style={[st.fieldInput, style]} />
      </View>
    </View>
  );
}

function LoginError({ message }: { message: string }) {
  return (
    <Card style={st.errorCard}>
      <CardContent style={st.errorRow}>
        <Ionicons name="alert-circle-outline" size={18} color="#b42318" />
        <Text style={st.errorText}>{message}</Text>
      </CardContent>
    </Card>
  );
}
