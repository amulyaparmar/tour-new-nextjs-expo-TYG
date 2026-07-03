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
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  type BusinessOption,
  type MobileAuthSession,
  listBusinesses,
  signIn,
} from "./auth";

export function LoginScreen({
  player,
  onAuthenticated,
}: {
  player: VideoPlayer;
  onAuthenticated: (session: MobileAuthSession) => void;
}) {
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
    return () => { active = false; };
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
    <View style={styles.root}>
      <View style={styles.hero}>
        <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />
        <LinearGradient colors={["rgba(7,18,34,0.08)", "rgba(7,18,34,0.9)"]} style={StyleSheet.absoluteFill} />
        <SafeAreaView style={styles.heroSafe}>
          <View style={styles.brand}>
            <View style={styles.mark}><Ionicons name="play" size={16} color="#fff" /></View>
            <Text style={styles.brandText}>Tour</Text>
          </View>
          <View>
            <Text style={styles.eyebrow}>LEASING OPERATIONS</Text>
            <Text style={styles.heroTitle}>Tours, coaching, and follow-up in one place.</Text>
          </View>
        </SafeAreaView>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.panel}>
        {step === "community" ? (
          <>
            <View style={styles.headingRow}>
              <View>
                <Text style={styles.title}>Choose community</Text>
                <Text style={styles.subtitle}>Select the property you are working from.</Text>
              </View>
              <View style={styles.stepBadge}><Text style={styles.stepText}>1 of 2</Text></View>
            </View>
            <View style={styles.search}>
              <Ionicons name="search" size={18} color="#667085" />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search communities"
                placeholderTextColor="#98a2b3"
                style={styles.input}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
            {error && <ErrorMessage message={error} />}
            {loading ? (
              <View style={styles.loading}>
                <ActivityIndicator color="#4f46e5" />
                <Text style={styles.loadingText}>Loading communities</Text>
              </View>
            ) : (
              <FlatList
                data={filtered}
                keyExtractor={(item) => item.id}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.list}
                renderItem={({ item }) => (
                  <Pressable
                    onPress={() => {
                      setSelected(item);
                      setError(null);
                      setStep("credentials");
                    }}
                    style={({ pressed }) => [styles.communityRow, pressed && styles.pressed]}
                  >
                    <View style={styles.communityIcon}><Ionicons name="business-outline" size={19} color="#4f46e5" /></View>
                    <View style={styles.communityCopy}>
                      <Text style={styles.communityName} numberOfLines={1}>{item.name}</Text>
                      <Text style={styles.companyName} numberOfLines={1}>{item.companyName}</Text>
                    </View>
                    {item.calendarConnected && <View style={styles.connected}><View style={styles.connectedDot} /><Text style={styles.connectedText}>Calendar</Text></View>}
                    <Ionicons name="chevron-forward" size={18} color="#98a2b3" />
                  </Pressable>
                )}
                ListEmptyComponent={<View style={styles.empty}><Ionicons name="business-outline" size={24} color="#98a2b3" /><Text style={styles.emptyText}>No matching communities</Text></View>}
              />
            )}
          </>
        ) : (
          <>
            <View style={styles.headingRow}>
              <Pressable
                accessibilityLabel="Back to communities"
                onPress={() => { setStep("community"); setError(null); }}
                style={styles.backButton}
              >
                <Ionicons name="arrow-back" size={20} color="#344054" />
              </Pressable>
              <View style={styles.credentialsHeading}>
                <Text style={styles.title}>Sign in</Text>
                <Text style={styles.subtitle} numberOfLines={1}>{selected?.name}</Text>
              </View>
              <View style={styles.stepBadge}><Text style={styles.stepText}>2 of 2</Text></View>
            </View>
            <Field
              label="EMAIL"
              icon="mail-outline"
              value={email}
              onChangeText={setEmail}
              placeholder="you@company.com"
              keyboardType="email-address"
              autoCapitalize="none"
              textContentType="username"
            />
            <Field
              label="PASSWORD"
              icon="lock-closed-outline"
              value={password}
              onChangeText={setPassword}
              placeholder="Enter your password"
              secureTextEntry
              textContentType="password"
              onSubmitEditing={() => void submit()}
            />
            {error && <ErrorMessage message={error} />}
            <Pressable
              onPress={() => void submit()}
              disabled={submitting || !email.trim() || !password}
              style={({ pressed }) => [styles.signInButton, (!email.trim() || !password) && styles.disabled, pressed && styles.pressed]}
            >
              {submitting ? <ActivityIndicator color="#fff" /> : <><Text style={styles.signInText}>Continue</Text><Ionicons name="arrow-forward" size={18} color="#fff" /></>}
            </Pressable>
          </>
        )}
      </KeyboardAvoidingView>
    </View>
  );
}

function Field({ label, icon, ...props }: React.ComponentProps<typeof TextInput> & { label: string; icon: keyof typeof Ionicons.glyphMap }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.fieldControl}>
        <Ionicons name={icon} size={18} color="#667085" />
        <TextInput {...props} placeholderTextColor="#98a2b3" style={styles.input} />
      </View>
    </View>
  );
}

function ErrorMessage({ message }: { message: string }) {
  return <View style={styles.error}><Ionicons name="alert-circle-outline" size={18} color="#b42318" /><Text style={styles.errorText}>{message}</Text></View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#fff" },
  hero: { height: "35%", minHeight: 245, overflow: "hidden", backgroundColor: "#101828" },
  heroSafe: { flex: 1, justifyContent: "space-between", paddingHorizontal: 22, paddingBottom: 24 },
  brand: { flexDirection: "row", alignItems: "center", gap: 9 },
  mark: { width: 34, height: 34, borderRadius: 9, backgroundColor: "#4f46e5", alignItems: "center", justifyContent: "center" },
  brandText: { color: "#fff", fontSize: 22, fontWeight: "900" },
  eyebrow: { color: "rgba(255,255,255,0.68)", fontSize: 11, fontWeight: "800", marginBottom: 8 },
  heroTitle: { maxWidth: 390, color: "#fff", fontSize: 29, lineHeight: 34, fontWeight: "900" },
  panel: { flex: 1, paddingHorizontal: 20, paddingTop: 22, backgroundColor: "#fff" },
  headingRow: { minHeight: 56, flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 16 },
  credentialsHeading: { flex: 1 },
  title: { color: "#101828", fontSize: 22, fontWeight: "900" },
  subtitle: { color: "#667085", fontSize: 13, lineHeight: 18, marginTop: 3 },
  stepBadge: { marginLeft: "auto", paddingHorizontal: 9, paddingVertical: 5, borderRadius: 7, backgroundColor: "#f2f4f7" },
  stepText: { color: "#667085", fontSize: 11, fontWeight: "800" },
  search: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: 9, paddingHorizontal: 13, borderWidth: 1, borderColor: "#dfe3ea", borderRadius: 10, backgroundColor: "#f8fafc" },
  input: { flex: 1, color: "#101828", fontSize: 15, paddingVertical: 12 },
  list: { paddingTop: 10, paddingBottom: 28, gap: 8 },
  communityRow: { minHeight: 66, flexDirection: "row", alignItems: "center", gap: 11, paddingHorizontal: 12, borderWidth: 1, borderColor: "#e4e7ec", borderRadius: 10, backgroundColor: "#fff" },
  communityIcon: { width: 38, height: 38, alignItems: "center", justifyContent: "center", borderRadius: 8, backgroundColor: "#eef2ff" },
  communityCopy: { flex: 1, minWidth: 0 },
  communityName: { color: "#1d2939", fontSize: 14, fontWeight: "800" },
  companyName: { color: "#667085", fontSize: 12, marginTop: 2 },
  connected: { flexDirection: "row", alignItems: "center", gap: 5 },
  connectedDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#12b76a" },
  connectedText: { color: "#027a48", fontSize: 10, fontWeight: "700" },
  empty: { alignItems: "center", gap: 8, paddingVertical: 34 },
  emptyText: { color: "#667085", fontSize: 13, fontWeight: "600" },
  loading: { alignItems: "center", gap: 9, paddingVertical: 34 },
  loadingText: { color: "#667085", fontSize: 13, fontWeight: "600" },
  backButton: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#e4e7ec", borderRadius: 9 },
  field: { gap: 7, marginBottom: 14 },
  label: { color: "#475467", fontSize: 11, fontWeight: "800" },
  fieldControl: { minHeight: 50, flexDirection: "row", alignItems: "center", gap: 9, paddingHorizontal: 13, borderWidth: 1, borderColor: "#d0d5dd", borderRadius: 10, backgroundColor: "#fff" },
  signInButton: { minHeight: 52, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9, marginTop: 4, borderRadius: 10, backgroundColor: "#4f46e5" },
  signInText: { color: "#fff", fontSize: 15, fontWeight: "800" },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.76 },
  error: { flexDirection: "row", alignItems: "center", gap: 8, padding: 11, marginTop: 10, marginBottom: 12, borderRadius: 9, borderWidth: 1, borderColor: "#fecdca", backgroundColor: "#fef3f2" },
  errorText: { flex: 1, color: "#b42318", fontSize: 12, fontWeight: "600" },
});
