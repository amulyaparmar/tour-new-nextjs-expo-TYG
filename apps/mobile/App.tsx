import { Ionicons } from "@expo/vector-icons";
import { Audio } from "expo-av";
import * as DocumentPicker from "expo-document-picker";
import * as Haptics from "expo-haptics";
import { StatusBar } from "expo-status-bar";
import { VideoView, useVideoPlayer } from "expo-video";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import {
  ActivityIndicator,
  Alert,
  Animated,
  AppState,
  Dimensions,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { AnalysisResult, FollowUpAction, Rubric, SessionSummary } from "@tour/shared";
import { rubricItemCount, rubricTotalPoints } from "@tour/shared";
import {
  type Material,
  type PaginatedSessions,
  applyRubricToSession,
  createSession,
  type CalendarEvent,
  type SessionComment,
  deleteComment,
  fetchActions,
  fetchAnalysis,
  fetchComments,
  fetchCalendarEvents,
  fetchMaterials,
  fetchRubrics,
  fetchSession,
  fetchSessions,
  fetchTranscript,
  postComment,
  processSession,
  syncCalendar,
  updateActionStatus,
  uploadRecording,
  uploadMaterial,
  uploadRubric,
} from "./src/api";
import { getApiBaseUrl } from "./src/config";
import { computeDashboardMetrics } from "./src/dashboard";
import { type MobileAuthSession, authenticatedFetch, clearSession, restoreSession, switchCommunity } from "./src/auth";
import { LoginScreen } from "./src/LoginScreen";

const onboardingBackground = require("./assets/videos/login-bg.mp4");

// ── Design Tokens ──
const C = {
  brand: "#006ce5",
  bg: "#f4f7fb",
  card: "#ffffff",
  text: "#101828",
  textSec: "#667085",
  textMuted: "#8a94a6",
  border: "rgba(16, 24, 40, 0.08)",
  green: "#16a34a",
  greenBg: "#eefaf3",
  amber: "#d97706",
  amberBg: "#fffbeb",
  red: "#b91c1c",
  redBg: "#fef2f2",
  purple: "#7c3aed",
  purpleBg: "#f3e8ff",
} as const;

type ObData = { name: string; email: string; phone: string; property: string; teamInvites: string; password: string; verificationCode: string };
type ProspectData = { name: string; email: string; phone: string; moveIn: string; bedrooms: string; budget: string };
type MainTab = "home" | "sessions" | "calendar" | "materials" | "settings";
type Screen =
  | { type: "onboarding" }
  | { type: "main"; tab: MainTab }
  | { type: "session-detail"; sessionId: string }
  | { type: "create-session" }
  | { type: "rubrics" }
  | { type: "profile" }
  | { type: "tour" };

type OnboardingStep = "rep" | "property" | "security";
type TourStep = "contact" | "preferences" | "ready";

const AGENT = {
  name: "Alex Johnson",
  title: "Leasing Consultant",
  property: "Downtown Lofts",
  email: "alex@downtownlofts.com",
  phone: "(512) 555-0189",
  profileUrl: "tour.video/alex-downtown",
};

const onboardingSteps: Array<{ id: OnboardingStep; label: string }> = [
  { id: "rep", label: "You" },
  { id: "property", label: "Property" },
  { id: "security", label: "Verify" },
];

const tourSteps: Array<{ id: TourStep; label: string }> = [
  { id: "contact", label: "Contact" },
  { id: "preferences", label: "Needs" },
  { id: "ready", label: "Tour" },
];

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  scheduled: { bg: "#eaf4ff", text: C.brand },
  in_progress: { bg: C.redBg, text: C.red },
  uploaded: { bg: C.amberBg, text: C.amber },
  transcribing: { bg: C.amberBg, text: C.amber },
  analyzing: { bg: C.amberBg, text: C.amber },
  extracting_screenshots: { bg: C.amberBg, text: C.amber },
  analysis_ready: { bg: C.greenBg, text: C.green },
  reviewed: { bg: C.greenBg, text: C.green },
  failed: { bg: C.redBg, text: C.red },
};

const STATUS_LABELS: Record<string, string> = {
  scheduled: "Scheduled",
  in_progress: "In progress",
  uploaded: "Uploaded",
  transcribing: "Processing",
  analyzing: "Analyzing",
  extracting_screenshots: "Processing",
  analysis_ready: "Analyzed",
  reviewed: "Reviewed",
  failed: "Failed",
};

const PROCESSING_STATUSES = new Set(["transcribing", "analyzing", "extracting_screenshots"]);

function scoreColor(score: number) {
  if (score >= 75) return C.green;
  if (score >= 50) return C.amber;
  return C.red;
}

function fmtDate(d: string | null) {
  if (!d) return "Unscheduled";
  return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function fmtTime(d: string | null) {
  if (!d) return "";
  return new Date(d).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function fmtSec(sec: number) {
  const m = Math.floor(sec / 60);
  const ss = Math.floor(sec % 60);
  return `${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

function materialUrl(material: Material) {
  return material.media?.videoUrl ?? material.media?.iframeUrl ?? material.fileUrl ?? null;
}

// ═══════════════════════════════════════
// Toast system
// ═══════════════════════════════════════

let _showToast: ((msg: string, type?: "error" | "success" | "info") => void) | null = null;

function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<{ msg: string; type: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  _showToast = useCallback((msg: string, type?: "error" | "success" | "info") => {
    const t = type ?? "info";
    setToast({ msg, type: t });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 3000);
  }, []);

  const bg = toast?.type === "error" ? C.red : toast?.type === "success" ? C.green : C.brand;
  const iconName: keyof typeof Ionicons.glyphMap = toast?.type === "error" ? "alert-circle" : toast?.type === "success" ? "checkmark-circle" : "information-circle";

  return (
    <View style={{ flex: 1 }}>
      {children}
      {toast && (
        <Pressable onPress={() => setToast(null)} style={[st.toast, { backgroundColor: bg }]}>
          <Ionicons name={iconName} size={18} color="#fff" />
          <Text style={st.toastText}>{toast.msg}</Text>
        </Pressable>
      )}
    </View>
  );
}

function showToast(msg: string, type?: "error" | "success" | "info") {
  _showToast?.(msg, type);
}

// ═══════════════════════════════════════
// Root App
// ═══════════════════════════════════════

// ═══════════════════════════════════════
// Global recording context (lives above all screens)
// ═══════════════════════════════════════

type RecordingCtx = {
  isRecording: boolean;
  elapsed: number;
  start: () => Promise<boolean>;
  stop: () => Promise<{ uri: string; durationSec: number } | null>;
};

const RecordingContext = React.createContext<RecordingCtx>({
  isRecording: false,
  elapsed: 0,
  start: async () => false,
  stop: async () => null,
});

function RecordingProvider({ children }: { children: React.ReactNode }) {
  const [isRecording, setIsRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const startingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval>>(undefined);

  const start = useCallback(async () => {
    if (recordingRef.current || startingRef.current) return false;
    startingRef.current = true;
    try {
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) {
        showToast("Microphone permission required", "error");
        return false;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
      });

      const preset = Audio.RecordingOptionsPresets.HIGH_QUALITY!;
      const { recording } = await Audio.Recording.createAsync({
        ...preset,
        android: { ...preset.android, numberOfChannels: 1, bitRate: 48000 },
        ios: { ...preset.ios, numberOfChannels: 1, bitRate: 48000 },
        web: { ...preset.web, bitsPerSecond: 48000 },
      });
      recordingRef.current = recording;
      setIsRecording(true);
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
      return true;
    } finally {
      startingRef.current = false;
    }
  }, []);

  const stop = useCallback(async (): Promise<{ uri: string; durationSec: number } | null> => {
    if (!recordingRef.current) return null;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = undefined;
    const recording = recordingRef.current;
    try {
      const status = await recording.getStatusAsync();
      await recording.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      const uri = recording.getURI();
      recordingRef.current = null;
      setIsRecording(false);
      setElapsed(0);
      return uri ? { uri, durationSec: Math.max(1, Math.round(status.durationMillis / 1000)) } : null;
    } catch {
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false }).catch(() => {});
      recordingRef.current = null;
      setIsRecording(false);
      setElapsed(0);
      return null;
    }
  }, []);

  const ctx = useMemo(() => ({ isRecording, elapsed, start, stop }), [isRecording, elapsed, start, stop]);

  return (
    <RecordingContext.Provider value={ctx}>
      {children}
    </RecordingContext.Provider>
  );
}

function useRecording() {
  return React.useContext(RecordingContext);
}

// ═══════════════════════════════════════
// Live Activity Banner
// ═══════════════════════════════════════

function LiveActivityBanner() {
  const { isRecording, elapsed } = useRecording();
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!isRecording) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.3, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [isRecording, pulseAnim]);

  if (!isRecording) return null;

  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");

  return (
    <View style={laSt.banner}>
      <Animated.View style={[laSt.dot, { opacity: pulseAnim }]} />
      <Ionicons name="mic" size={16} color="#fff" />
      <Text style={laSt.label}>Recording</Text>
      <Text style={laSt.timer}>{mm}:{ss}</Text>
      <View style={laSt.spacer} />
      <Text style={laSt.activeLabel}>Finish in session</Text>
    </View>
  );
}

const laSt = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: C.red,
    paddingHorizontal: 16,
    paddingVertical: 10,
    paddingTop: Platform.OS === "ios" ? 54 : 10,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#fff",
  },
  label: {
    fontSize: 13,
    fontWeight: "800",
    color: "#fff",
  },
  timer: {
    fontSize: 15,
    fontWeight: "900",
    color: "#fff",
    fontVariant: ["tabular-nums"],
  },
  spacer: { flex: 1 },
  activeLabel: { fontSize: 11, fontWeight: "700", color: "rgba(255,255,255,0.86)" },
});

// ═══════════════════════════════════════
// Root App
// ═══════════════════════════════════════

export default function App() {
  const player = useVideoPlayer(onboardingBackground, (vp) => {
    vp.loop = true;
    vp.muted = true;
    vp.play();
  });

  const [screen, setScreen] = useState<Screen>({ type: "main", tab: "home" });
  const [authSession, setAuthSession] = useState<MobileAuthSession | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [obStep, setObStep] = useState<OnboardingStep>("rep");
  const [tourStep, setTourStep] = useState<TourStep>("contact");
  const [ob, setOb] = useState<ObData>({ name: AGENT.name, email: AGENT.email, phone: AGENT.phone, property: AGENT.property, teamInvites: "", password: "", verificationCode: "" });
  const [prospect, setProspect] = useState<ProspectData>({ name: "", email: "", phone: "", moveIn: "", bedrooms: "2 bed", budget: "$2,200 - $2,600" });

  useEffect(() => {
    player.play();
    const sub = AppState.addEventListener("change", (s) => { if (s === "active") player.play(); });
    return () => sub.remove();
  }, [player]);

  useEffect(() => {
    restoreSession()
      .then(setAuthSession)
      .finally(() => setAuthLoading(false));
  }, []);

  const obIdx = useMemo(() => onboardingSteps.findIndex((s) => s.id === obStep), [obStep]);
  const tourIdx = useMemo(() => tourSteps.findIndex((s) => s.id === tourStep), [tourStep]);
  const nav = useCallback((s: Screen) => setScreen(s), []);

  if (authLoading) {
    return (
      <SafeAreaProvider>
        <View style={[st.root, st.center]}>
          <StatusBar style="dark" />
          <ActivityIndicator color={C.brand} size="large" />
        </View>
      </SafeAreaProvider>
    );
  }

  if (!authSession) {
    return (
      <SafeAreaProvider>
        <StatusBar style="light" />
        <LoginScreen player={player} onAuthenticated={setAuthSession} />
      </SafeAreaProvider>
    );
  }

  const agentName =
    authSession.workspace.user.fullName ??
    authSession.workspace.user.email.split("@")[0] ??
    "Team member";
  const property = authSession.workspace.community.name;

  return (
    <SafeAreaProvider>
    <View style={st.root}>
      <StatusBar style="dark" />
      <RecordingProvider>
        <ToastProvider>
          <LiveActivityBanner />
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={st.flex1}>
            {screen.type === "main" && (
              <MainTabs
                key={authSession.workspace.community.id}
                tab={screen.tab}
                onTab={(t) => nav({ type: "main", tab: t })}
                onSession={(id) => nav({ type: "session-detail", sessionId: id })}
                onCreate={() => nav({ type: "create-session" })}
                onProfile={() => nav({ type: "profile" })}
                onRubrics={() => nav({ type: "rubrics" })}
                onSignOut={() => {
                  void clearSession().then(() => setAuthSession(null));
                }}
                authSession={authSession}
                onAuthSession={setAuthSession}
                agentName={agentName}
                property={property}
              />
            )}
            {screen.type === "session-detail" && <SessionDetailScreen sessionId={screen.sessionId} onBack={() => nav({ type: "main", tab: "sessions" })} />}
            {screen.type === "create-session" && <CreateSessionScreen onBack={() => nav({ type: "main", tab: "sessions" })} onCreated={(id) => nav({ type: "session-detail", sessionId: id })} />}
            {screen.type === "rubrics" && <RubricsScreen session={authSession} onBack={() => nav({ type: "main", tab: "settings" })} onSession={(id) => nav({ type: "session-detail", sessionId: id })} />}
            {screen.type === "profile" && (
              <ScrollView contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={st.scroll}>
                <ProfileScreen session={authSession} onBack={() => nav({ type: "main", tab: "home" })} onStartTour={() => { setTourStep("contact"); nav({ type: "tour" }); }} />
              </ScrollView>
            )}
            {screen.type === "tour" && (
              <ScrollView contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={st.scroll}>
                <TourStepper session={authSession} idx={tourIdx} prospect={prospect} step={tourStep} onBack={() => nav({ type: "profile" })} onChange={(k, v) => setProspect((c) => ({ ...c, [k]: v }))} onStep={setTourStep} />
              </ScrollView>
            )}
          </KeyboardAvoidingView>
        </ToastProvider>
      </RecordingProvider>
    </View>
    </SafeAreaProvider>
  );
}

// ═══════════════════════════════════════
// Bottom Tab Navigation
// ═══════════════════════════════════════

const TAB_ITEMS: Array<{ id: MainTab; label: string; icon: keyof typeof Ionicons.glyphMap; iconActive: keyof typeof Ionicons.glyphMap }> = [
  { id: "home", label: "Home", icon: "home-outline", iconActive: "home" },
  { id: "sessions", label: "Sessions", icon: "list-outline", iconActive: "list" },
  { id: "calendar", label: "Calendar", icon: "calendar-outline", iconActive: "calendar" },
  { id: "materials", label: "Assets", icon: "folder-outline", iconActive: "folder" },
  { id: "settings", label: "Settings", icon: "settings-outline", iconActive: "settings" },
];

function MainTabs({ tab, onTab, onSession, onCreate, onProfile, onRubrics, onSignOut, authSession, onAuthSession, agentName, property }: {
  tab: MainTab; onTab: (t: MainTab) => void; onSession: (id: string) => void; onCreate: () => void; onProfile: () => void; onRubrics: () => void; onSignOut: () => void; authSession: MobileAuthSession; onAuthSession: (session: MobileAuthSession) => void; agentName: string; property: string;
}) {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [sessData, matData, calendarData] = await Promise.all([
        fetchSessions({ limit: 100 }),
        fetchMaterials().catch(() => ({ materials: [] as Material[] })),
        fetchCalendarEvents().catch(() => ({ events: [] as CalendarEvent[] })),
      ]);
      setSessions(sessData.sessions);
      setMaterials(matData.materials);
      setCalendarEvents(calendarData.events);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(async () => { setRefreshing(true); await load(); setRefreshing(false); }, [load]);

  const showScrollView = tab !== "sessions";

  return (
    <View style={st.flex1}>
      {showScrollView && (
        <ScrollView contentInsetAdjustmentBehavior="automatic" showsVerticalScrollIndicator={false} contentContainerStyle={st.scroll} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.brand} />}>
          {error && <ErrorBanner message={error} onRetry={load} />}
          {tab === "home" && <DashboardScreen sessions={sessions} loading={loading} onSession={onSession} onProfile={onProfile} agentName={agentName} property={property} />}
          {tab === "calendar" && <CalendarScreen sessions={sessions} entrataEvents={calendarEvents} onSession={onSession} onReload={load} />}
          {tab === "materials" && <MaterialsScreen materials={materials} loading={loading} onReload={load} />}
          {tab === "settings" && <SettingsScreen session={authSession} onSessionChange={onAuthSession} onRubrics={onRubrics} onSignOut={onSignOut} />}
        </ScrollView>
      )}

      {tab === "sessions" && (
        <SessionsListScreen onSession={onSession} onCreate={onCreate} />
      )}

      {tab === "sessions" && (
        <Pressable accessibilityLabel="New session" onPress={onCreate} style={({ pressed }) => [st.fab, pressed && st.pressed]}>
          <Ionicons name="add" size={28} color="#fff" />
        </Pressable>
      )}

      <View style={st.tabBar}>
        {TAB_ITEMS.map((t) => (
          <Pressable key={t.id} onPress={() => onTab(t.id)} style={st.tabBarItem}>
            <Ionicons name={tab === t.id ? t.iconActive : t.icon} size={22} color={tab === t.id ? C.brand : C.textMuted} />
            <Text style={[st.tabBarLabel, tab === t.id && st.tabBarLabelActive]}>{t.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

// ═══════════════════════════════════════
// Error Banner
// ═══════════════════════════════════════

function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={st.errorBanner}>
      <Ionicons name="cloud-offline-outline" size={18} color={C.red} />
      <Text style={st.errorBannerText} numberOfLines={2}>{message}</Text>
      {onRetry && (
        <Pressable onPress={onRetry} style={({ pressed }) => [st.errorRetryBtn, pressed && st.pressed]}>
          <Ionicons name="refresh" size={16} color={C.brand} />
        </Pressable>
      )}
    </View>
  );
}

// ═══════════════════════════════════════
// Dashboard
// ═══════════════════════════════════════

function DashboardScreen({ sessions, loading, onSession, onProfile, agentName, property }: {
  sessions: SessionSummary[]; loading: boolean; onSession: (id: string) => void; onProfile: () => void; agentName: string; property: string;
}) {
  const metrics = useMemo(() => computeDashboardMetrics(sessions), [sessions]);
  const recent = useMemo(() => sessions.slice(0, 5), [sessions]);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <View style={st.page}>
      <View style={st.dashGreet}>
        <View style={st.flex1}>
          <Text style={st.dashGreetText}>{greeting}, {agentName.split(" ")[0]}</Text>
          <Text style={st.dashProperty}>{property}</Text>
        </View>
        <Pressable onPress={onProfile} style={({ pressed }) => [st.avatar48, pressed && st.pressed]}>
          <Text style={st.avatar48Text}>{agentName.split(" ").map((n) => n[0]).join("")}</Text>
        </Pressable>
      </View>

      <View style={st.metricsGrid}>
        <MetricCard icon="today-outline" label="Today" value={String(metrics.todaySessions)} color={C.brand} />
        <MetricCard icon="calendar-outline" label="Upcoming" value={String(metrics.upcomingSessions)} color={C.purple} />
        <MetricCard icon="hourglass-outline" label="Processing" value={String(metrics.processingSessions)} color={C.amber} />
        <MetricCard icon="star-outline" label="Avg Score" value={metrics.averageScore !== null ? String(metrics.averageScore) : "--"} color={C.green} />
      </View>

      <CardRow icon="id-card-outline" title="Digital Business Card" sub="Open your QR card for visitors" onPress={onProfile} />

      <Text style={st.sectionTitle}>Recent Sessions</Text>
      {loading ? <LoadingBox /> : recent.length === 0 ? <EmptyState icon="albums-outline" title="No sessions yet" subtitle="Create your first session to get started" /> : (
        <View style={st.card}>
          {recent.map((s, i) => <SessionRow key={s.id} session={s} onPress={() => onSession(s.id)} isLast={i === recent.length - 1} />)}
        </View>
      )}
    </View>
  );
}

function MetricCard({ icon, label, value, color }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string; color: string }) {
  return (
    <View style={st.metricCard}>
      <Ionicons name={icon} size={20} color={color} />
      <Text style={st.metricValue}>{value}</Text>
      <Text style={st.metricLabel}>{label}</Text>
    </View>
  );
}

function CardRow({ icon, title, sub, onPress }: { icon: keyof typeof Ionicons.glyphMap; title: string; sub: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [st.cardRow, pressed && st.pressed]}>
      <View style={st.cardRowIcon}><Ionicons name={icon} size={22} color={C.brand} /></View>
      <View style={st.flex1}>
        <Text style={st.cardRowTitle}>{title}</Text>
        <Text style={st.cardRowSub}>{sub}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={C.textMuted} />
    </Pressable>
  );
}

function SessionRow({ session, onPress, isLast }: { session: SessionSummary; onPress: () => void; isLast: boolean }) {
  const colors = STATUS_COLORS[session.status] ?? { bg: "#eaf4ff", text: C.brand };
  const label = STATUS_LABELS[session.status] ?? session.status;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [st.sessionRow, !isLast && st.rowBorder, pressed && st.pressed]}>
      <View style={st.flex1}>
        <Text style={st.sessionTitle} numberOfLines={1}>{session.title}</Text>
        <Text style={st.sessionMeta} numberOfLines={1}>{session.prospectName ?? "No prospect"}{session.scheduledAt ? ` \u00B7 ${fmtDate(session.scheduledAt)}` : ""}</Text>
      </View>
      <View style={[st.badge, { backgroundColor: colors.bg }]}><Text style={[st.badgeText, { color: colors.text }]}>{label}</Text></View>
      {session.overallScore !== null && <Text style={[st.scoreNum, { color: scoreColor(session.overallScore) }]}>{session.overallScore}%</Text>}
      <Ionicons name="chevron-forward" size={16} color="#cbd5e1" />
    </Pressable>
  );
}

// ═══════════════════════════════════════
// Sessions List (paginated + infinite scroll + filters)
// ═══════════════════════════════════════

type StatusFilter = "all" | "scheduled" | "uploaded" | "analysis_ready" | "reviewed" | "failed";
type SortOption = "newest" | "oldest" | "score_desc" | "score_asc";

const FILTER_CHIPS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "scheduled", label: "Scheduled" },
  { value: "uploaded", label: "Uploaded" },
  { value: "analysis_ready", label: "Analyzed" },
  { value: "reviewed", label: "Reviewed" },
  { value: "failed", label: "Failed" },
];

const SORT_OPTS: { value: SortOption; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: "newest", label: "Newest", icon: "arrow-down-outline" },
  { value: "oldest", label: "Oldest", icon: "arrow-up-outline" },
  { value: "score_desc", label: "Score \u2193", icon: "trending-down-outline" },
  { value: "score_asc", label: "Score \u2191", icon: "trending-up-outline" },
];

const SESSIONS_PAGE_SIZE = 20;

function SessionsListScreen({ onSession, onCreate }: { onSession: (id: string) => void; onCreate: () => void }) {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<SortOption>("newest");
  const [showSort, setShowSort] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const fetchPageData = useCallback(async (p: number, replace: boolean) => {
    if (replace) setLoading(true);
    else setLoadingMore(true);
    try {
      const data = await fetchSessions({
        page: p,
        limit: SESSIONS_PAGE_SIZE,
        sort,
        status: statusFilter === "all" ? undefined : statusFilter,
        search: search.trim() || undefined,
      });
      setSessions((prev) => replace ? data.sessions : [...prev, ...data.sessions]);
      setTotal(data.total);
      setHasMore(data.hasMore);
      setPage(p);
    } catch {
      // keep existing data
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [sort, statusFilter, search]);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchPageData(1, true), search ? 350 : 0);
    return () => clearTimeout(debounceRef.current);
  }, [fetchPageData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchPageData(1, true);
    setRefreshing(false);
  }, [fetchPageData]);

  const onEndReached = useCallback(() => {
    if (hasMore && !loadingMore && !loading) fetchPageData(page + 1, false);
  }, [hasMore, loadingMore, loading, page, fetchPageData]);

  const renderItem = useCallback(({ item }: { item: SessionSummary }) => (
    <SessionRow session={item} onPress={() => onSession(item.id)} isLast={false} />
  ), [onSession]);

  const keyExtractor = useCallback((item: SessionSummary) => item.id, []);

  const ListHeader = useMemo(() => (
    <View style={slst.header}>
      <Text style={st.pageTitle}>Sessions</Text>
      <Text style={st.pageSub}>{loading ? "Loading..." : `${total} session${total !== 1 ? "s" : ""}`}</Text>

      <View style={st.searchBar}>
        <Ionicons name="search-outline" size={18} color={C.textMuted} />
        <TextInput
          placeholder="Search sessions..."
          placeholderTextColor={C.textMuted}
          value={search}
          onChangeText={setSearch}
          style={st.searchInput}
          returnKeyType="search"
        />
        {search.length > 0 && (
          <Pressable onPress={() => setSearch("")}>
            <Ionicons name="close-circle" size={18} color={C.textMuted} />
          </Pressable>
        )}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={slst.chipsRow}>
        {FILTER_CHIPS.map((f) => (
          <Pressable
            key={f.value}
            onPress={() => setStatusFilter(f.value)}
            style={[slst.chip, statusFilter === f.value && slst.chipActive]}
          >
            <Text style={[slst.chipText, statusFilter === f.value && slst.chipTextActive]}>{f.label}</Text>
          </Pressable>
        ))}
        <View style={slst.chipSep} />
        <Pressable onPress={() => setShowSort((v) => !v)} style={[slst.chip, slst.sortChip]}>
          <Ionicons name="swap-vertical-outline" size={14} color={C.textSec} />
          <Text style={slst.chipText}>{SORT_OPTS.find((o) => o.value === sort)?.label}</Text>
        </Pressable>
      </ScrollView>

      {showSort && (
        <View style={slst.sortPanel}>
          {SORT_OPTS.map((o) => (
            <Pressable
              key={o.value}
              onPress={() => { setSort(o.value); setShowSort(false); }}
              style={[slst.sortOpt, sort === o.value && slst.sortOptActive]}
            >
              <Ionicons name={o.icon} size={16} color={sort === o.value ? C.brand : C.textMuted} />
              <Text style={[slst.sortOptText, sort === o.value && { color: C.brand, fontWeight: "700" }]}>{o.label}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  ), [search, statusFilter, sort, showSort, total, loading]);

  const ListFooter = useMemo(() => {
    if (loadingMore) return <ActivityIndicator style={{ paddingVertical: 20 }} color={C.brand} />;
    if (!hasMore && sessions.length > 0) return (
      <Text style={slst.endText}>All sessions loaded</Text>
    );
    return null;
  }, [loadingMore, hasMore, sessions.length]);

  const ListEmpty = useMemo(() => {
    if (loading) return (
      <View style={{ paddingTop: 20 }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <View key={i} style={slst.skeleton}>
            <View style={[slst.skelBar, { width: "55%" }]} />
            <View style={[slst.skelBar, { width: "35%", height: 8 }]} />
          </View>
        ))}
      </View>
    );
    return (
      <EmptyState
        icon={search || statusFilter !== "all" ? "search-outline" : "albums-outline"}
        title={search || statusFilter !== "all" ? "No matching sessions" : "No sessions yet"}
        subtitle="Tap + to create a new session"
      />
    );
  }, [loading, search, statusFilter]);

  return (
    <FlatList
      data={sessions}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      ListHeaderComponent={ListHeader}
      ListFooterComponent={ListFooter}
      ListEmptyComponent={ListEmpty}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.4}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.brand} />}
      contentContainerStyle={slst.list}
      showsVerticalScrollIndicator={false}
      contentInsetAdjustmentBehavior="automatic"
      ItemSeparatorComponent={() => <View style={slst.sep} />}
    />
  );
}

const slst = StyleSheet.create({
  list: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 120 },
  header: { gap: 10, marginBottom: 12 },
  chipsRow: { gap: 6, paddingVertical: 2 },
  chip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16,
    backgroundColor: "#f1f5f9", borderWidth: 1, borderColor: "transparent",
  },
  chipActive: { backgroundColor: "#eef2ff", borderColor: "#c7d2fe" },
  chipText: { fontSize: 12, fontWeight: "600", color: C.textSec },
  chipTextActive: { color: C.brand },
  chipSep: { width: 1, height: 20, backgroundColor: "#e2e8f0", alignSelf: "center", marginHorizontal: 2 },
  sortChip: { flexDirection: "row", alignItems: "center", gap: 4 },
  sortPanel: {
    flexDirection: "row", flexWrap: "wrap", gap: 6,
    backgroundColor: "#f8fafc", borderRadius: 12, padding: 10,
  },
  sortOpt: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10,
    backgroundColor: "white", borderWidth: 1, borderColor: "#e2e8f0",
  },
  sortOptActive: { borderColor: "#c7d2fe", backgroundColor: "#eef2ff" },
  sortOptText: { fontSize: 12, fontWeight: "600", color: C.textSec },
  sep: { height: 1, backgroundColor: "#f1f5f9" },
  endText: { textAlign: "center", paddingVertical: 20, fontSize: 12, fontWeight: "600", color: C.textMuted },
  skeleton: {
    paddingVertical: 14, paddingHorizontal: 16, gap: 6,
    borderBottomWidth: 1, borderBottomColor: "#f1f5f9",
  },
  skelBar: { height: 12, borderRadius: 6, backgroundColor: "#f1f5f9" },
});

// ═══════════════════════════════════════
// Calendar
// ═══════════════════════════════════════

function CalendarScreen({
  sessions,
  entrataEvents,
  onSession,
  onReload,
}: {
  sessions: SessionSummary[];
  entrataEvents: CalendarEvent[];
  onSession: (id: string) => void;
  onReload: () => Promise<void>;
}) {
  const today = new Date();
  const [monthOffset, setMonthOffset] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const viewDate = useMemo(() => new Date(today.getFullYear(), today.getMonth() + monthOffset, 1), [monthOffset]);
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const monthLabel = viewDate.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  const itemsByDay = useMemo(() => {
    const map: Record<number, Array<{ source: "session"; session: SessionSummary } | { source: "entrata"; event: CalendarEvent }>> = {};
    for (const s of sessions) {
      if (!s.scheduledAt) continue;
      const d = new Date(s.scheduledAt);
      if (d.getFullYear() === year && d.getMonth() === month) {
        const day = d.getDate();
        (map[day] ??= []).push({ source: "session", session: s });
      }
    }
    for (const event of entrataEvents) {
      const [eventYear, eventMonth, eventDay] = event.appointment_date.split("-").map(Number);
      if (eventYear === year && eventMonth === month + 1 && eventDay) {
        (map[eventDay] ??= []).push({ source: "entrata", event });
      }
    }
    return map;
  }, [entrataEvents, sessions, year, month]);

  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const weeks: Array<Array<number | null>> = [];
  let week: Array<number | null> = Array(firstDow).fill(null);
  for (let d = 1; d <= daysInMonth; d++) {
    week.push(d);
    if (week.length === 7) { weeks.push(week); week = []; }
  }
  if (week.length) { while (week.length < 7) week.push(null); weeks.push(week); }

  const [selectedDay, setSelectedDay] = useState<number | null>(today.getDate());
  const dayItems = selectedDay ? (itemsByDay[selectedDay] ?? []) : [];

  useEffect(() => {
    setSelectedDay(
      monthOffset === 0 ? today.getDate() : null
    );
  }, [monthOffset]);

  async function runSync() {
    setSyncing(true);
    try {
      const result = await syncCalendar();
      await onReload();
      showToast(`${result?.eventsSynced ?? 0} Entrata tours synced`, "success");
    } catch (caught) {
      showToast(caught instanceof Error ? caught.message : "Entrata sync failed", "error");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <View style={st.page}>
      <View style={st.pageHeadingRow}>
        <View style={st.flex1}>
          <Text style={st.pageTitle}>Calendar</Text>
          <Text style={st.pageHeadingSub}>{entrataEvents.length} Entrata tours · {sessions.length} sessions</Text>
        </View>
        <Pressable onPress={() => void runSync()} disabled={syncing} style={({ pressed }) => [st.iconButton, pressed && st.pressed]}>
          {syncing ? <ActivityIndicator size="small" color={C.brand} /> : <Ionicons name="sync" size={19} color={C.brand} />}
        </Pressable>
      </View>

      <View style={st.integrationStrip}>
        <View style={st.integrationIcon}><Ionicons name="calendar" size={17} color={C.green} /></View>
        <View style={st.flex1}>
          <Text style={st.integrationTitle}>Entrata connected</Text>
          <Text style={st.integrationSub}>Tours and prospect details sync from Entrata.</Text>
        </View>
        <View style={st.connectedBadge}><View style={st.connectedBadgeDot} /><Text style={st.connectedBadgeText}>Live</Text></View>
      </View>

      <View style={st.card}>
        <View style={{ padding: 16 }}>
          <View style={st.calNav}>
            <Pressable onPress={() => setMonthOffset((p) => p - 1)}><Ionicons name="chevron-back" size={22} color={C.text} /></Pressable>
            <Text style={st.calMonth}>{monthLabel}</Text>
            <Pressable onPress={() => setMonthOffset((p) => p + 1)}><Ionicons name="chevron-forward" size={22} color={C.text} /></Pressable>
          </View>
          <View style={st.calDowRow}>
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <Text key={d} style={st.calDow}>{d}</Text>)}
          </View>
          {weeks.map((w, wi) => (
            <View key={wi} style={st.calWeek}>
              {w.map((d, di) => {
                if (d === null) return <View key={di} style={st.calDayCell} />;
                const isToday = d === today.getDate() && month === today.getMonth() && year === today.getFullYear();
                const dayItems = itemsByDay[d] ?? [];
                const hasSessions = dayItems.some((item) => item.source === "session");
                const hasEntrata = dayItems.some((item) => item.source === "entrata");
                const isSelected = d === selectedDay;
                return (
                  <Pressable key={di} onPress={() => setSelectedDay(d === selectedDay ? null : d)} style={[st.calDayCell, isSelected && st.calDaySelected, isToday && !isSelected && st.calDayToday]}>
                    <Text style={[st.calDayText, isToday && st.calDayTextToday, isSelected && st.calDayTextSelected]}>{d}</Text>
                    <View style={st.calDots}>
                      {hasEntrata && <View style={[st.calDot, { backgroundColor: isSelected ? "#fff" : C.purple }]} />}
                      {hasSessions && <View style={[st.calDot, { backgroundColor: isSelected ? "#fff" : C.brand }]} />}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>
      </View>

      {selectedDay !== null && (
        <>
          <Text style={st.sectionTitle}>{monthLabel.split(" ")[0]} {selectedDay}</Text>
          {dayItems.length === 0 ? <EmptyState icon="calendar-outline" title="No calendar items" subtitle={`Nothing scheduled for ${monthLabel.split(" ")[0]} ${selectedDay}`} /> : (
            <View style={st.card}>
              {dayItems.map((item, index) => item.source === "session" ? (
                <SessionRow key={item.session.id} session={item.session} onPress={() => onSession(item.session.id)} isLast={index === dayItems.length - 1} />
              ) : (
                <Pressable
                  key={item.event.id}
                  disabled={!item.event.session_id}
                  onPress={() => item.event.session_id && onSession(item.event.session_id)}
                  style={({ pressed }) => [st.calendarEventRow, index < dayItems.length - 1 && st.rowBorder, pressed && st.pressed]}
                >
                  <View style={st.entrataEventIcon}><Ionicons name={item.event.event_type === "virtual" ? "videocam-outline" : "business-outline"} size={18} color={C.purple} /></View>
                  <View style={st.flex1}>
                    <Text style={st.sessionTitle} numberOfLines={1}>{item.event.prospect_name ?? "Entrata tour"}</Text>
                    <Text style={st.sessionMeta}>
                      {formatEntrataClock(item.event.time_from)} · {item.event.event_type === "virtual" ? "Virtual" : "In person"}
                    </Text>
                    {(item.event.prospect_email || item.event.prospect_phone) && (
                      <Text style={st.calendarContact} numberOfLines={1}>{item.event.prospect_email ?? item.event.prospect_phone}</Text>
                    )}
                  </View>
                  <View style={[st.badge, { backgroundColor: C.purpleBg }]}><Text style={[st.badgeText, { color: C.purple }]}>{item.event.status.replaceAll("_", " ")}</Text></View>
                  {item.event.session_id && <Ionicons name="chevron-forward" size={17} color={C.textMuted} />}
                </Pressable>
              ))}
            </View>
          )}
        </>
      )}
    </View>
  );
}

function formatEntrataClock(value: string | null) {
  if (!value) return "Time TBD";
  const match = value.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return value;
  const date = new Date(2000, 0, 1, Number(match[1]), Number(match[2]));
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

// ═══════════════════════════════════════
// Materials
// ═══════════════════════════════════════

function MaterialsScreen({ materials, loading, onReload }: { materials: Material[]; loading: boolean; onReload: () => Promise<void> }) {
  const typeIcon: Record<string, keyof typeof Ionicons.glyphMap> = { rubric: "clipboard-outline", training: "book-outline", recording: "mic-outline", other: "document-outline" };
  const typeColor: Record<string, string> = { rubric: C.brand, training: C.purple, recording: C.green, other: C.textSec };
  const [uploading, setUploading] = useState(false);

  async function addAsset() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["video/*", "audio/*", "image/*", "application/pdf"],
        copyToCacheDirectory: true,
      });
      const file = result.assets?.[0];
      if (result.canceled || !file) return;
      setUploading(true);
      await uploadMaterial(file.uri, file.mimeType ?? "application/octet-stream", file.name);
      await onReload();
      showToast("Asset added to this community", "success");
    } catch (caught) {
      showToast(caught instanceof Error ? caught.message : "Could not upload asset", "error");
    } finally {
      setUploading(false);
    }
  }

  return (
    <View style={st.page}>
      <View style={st.pageHeadingRow}>
        <View style={st.flex1}>
          <Text style={st.pageTitle}>Assets</Text>
          <Text style={st.pageHeadingSub}>{materials.length} community resources</Text>
        </View>
        <Pressable onPress={() => void addAsset()} disabled={uploading} style={({ pressed }) => [st.iconButton, pressed && st.pressed]}>
          {uploading ? <ActivityIndicator size="small" color={C.brand} /> : <Ionicons name="add" size={22} color={C.brand} />}
        </Pressable>
      </View>
      <View style={st.assetSummary}>
        <View style={st.assetSummaryIcon}><Ionicons name="folder-open-outline" size={19} color={C.brand} /></View>
        <View style={st.flex1}>
          <Text style={st.integrationTitle}>Community library</Text>
          <Text style={st.integrationSub}>Use these during recordings and prospect follow-up.</Text>
        </View>
      </View>
      {loading ? <LoadingBox /> : materials.length === 0 ? <EmptyState icon="folder-open-outline" title="No materials" subtitle="Rubrics, training docs, and recordings appear here" /> : (
        <View style={st.card}>
          {materials.map((m, i) => (
            <Pressable
              key={m.id}
              disabled={!materialUrl(m)}
              onPress={() => { const url = materialUrl(m); if (url) void Linking.openURL(url); }}
              style={({ pressed }) => [st.materialRow, i < materials.length - 1 && st.rowBorder, pressed && st.pressed]}
            >
              <View style={[st.materialIcon, { backgroundColor: (typeColor[m.type] ?? C.textSec) + "12" }]}>
                <Ionicons name={typeIcon[m.type] ?? "document-outline"} size={18} color={typeColor[m.type] ?? C.textSec} />
              </View>
              <View style={st.flex1}>
                <Text style={st.materialName} numberOfLines={1}>{m.name}</Text>
                <Text style={st.materialDesc} numberOfLines={2}>{m.description}</Text>
                <Text style={st.materialMeta}>{m.type} \u00B7 {fmtDate(m.createdAt)}</Text>
              </View>
              {materialUrl(m) && <Ionicons name="open-outline" size={17} color={C.textMuted} />}
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

// ═══════════════════════════════════════
// Create Session
// ═══════════════════════════════════════

function CreateSessionScreen({ onBack, onCreated }: { onBack: () => void; onCreated: (id: string) => void }) {
  const rec = useRecording();

  const [phase, setPhase] = useState<"choose" | "recording" | "uploading" | "details">("choose");
  const [progress, setProgress] = useState(0);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [fileSizeMB, setFileSizeMB] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [title, setTitle] = useState("");
  const [prospect, setProspect] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [rubrics, setRubrics] = useState<Rubric[]>([]);
  const [rubricId, setRubricId] = useState<string | null>(null);
  const [rubricOpen, setRubricOpen] = useState(false);
  const [assets, setAssets] = useState<Material[]>([]);
  const [assetSheetOpen, setAssetSheetOpen] = useState(false);
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);

  useEffect(() => {
    Promise.all([
      fetchRubrics(),
      fetchMaterials().catch(() => ({ materials: [] as Material[] })),
    ])
      .then(([{ rubrics: list }, materialData]) => {
        setRubrics(list);
        setAssets(materialData.materials.filter((material) => materialUrl(material)));
        if (list.length > 0) {
          const defaultRubric = list.find((r) => r.isDefault) ?? list[0];
          if (defaultRubric) setRubricId(defaultRubric.id);
        }
      })
      .catch(() => { /* rubric picker optional */ });
  }, []);

  async function startRecording() {
    try {
      const started = await rec.start();
      if (!started) return;
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setPhase("recording");
    } catch {
      showToast("Could not start recording", "error");
    }
  }

  async function stopRecording() {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const result = await rec.stop();
    if (result?.uri) {
      await uploadFile(result.uri, "audio/m4a", `tour-${Date.now()}.m4a`, undefined, result.durationSec);
    } else {
      showToast("Failed to save recording", "error");
      setPhase("choose");
    }
  }

  async function pickFile() {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ["video/*", "audio/*"], copyToCacheDirectory: true });
      if (result.canceled || !result.assets?.[0]) return;
      const file = result.assets[0];
      await uploadFile(file.uri, file.mimeType ?? "video/mp4", file.name ?? "recording.mp4", file.size);
    } catch {
      showToast("Could not select file", "error");
    }
  }

  async function uploadFile(uri: string, mimeType: string, name: string, size?: number | null, durationSec?: number) {
    setFileName(name);
    setFileSizeMB(size ? (size / 1024 / 1024).toFixed(1) : null);
    setPhase("uploading");
    setProgress(0);

    try {
      const defaultTitle = name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ");
      const sessionData = await createSession({ title: defaultTitle });
      const sid = sessionData.session.id;
      setSessionId(sid);
      setTitle(defaultTitle);

      const interval = setInterval(() => setProgress((p) => Math.min(p + 6, 90)), 300);
      try {
        await uploadRecording(sid, uri, mimeType, name, durationSec);
        setProgress(100);
        showToast("Recording uploaded", "success");
        setPhase("details");
      } finally {
        clearInterval(interval);
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Upload failed", "error");
      setPhase("choose");
    }
  }

  async function submitAndProcess() {
    if (!sessionId) return;
    setSubmitting(true);

    const patchBody: Record<string, string> = {};
    if (title.trim()) patchBody.title = title.trim();
    if (prospect.trim()) patchBody.prospectName = prospect.trim();
    if (location.trim()) patchBody.location = location.trim();
    if (notes.trim()) patchBody.notes = notes.trim();
    if (rubricId) patchBody.rubricId = rubricId;

    if (Object.keys(patchBody).length > 0) {
      try {
        await authenticatedFetch(`/api/sessions/${sessionId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patchBody),
        });
      } catch { /* best effort */ }
    }

    onCreated(sessionId);
  }

  const fmtElapsed = `${String(Math.floor(rec.elapsed / 60)).padStart(2, "0")}:${String(rec.elapsed % 60).padStart(2, "0")}`;

  function addAsset(asset: Material) {
    if (selectedAssetIds.includes(asset.id)) return;
    const url = materialUrl(asset);
    const snippet = [
      `Follow-up asset: ${asset.name}`,
      asset.description || null,
      url ? `Link: ${url}` : null,
    ].filter(Boolean).join("\n");
    setNotes((current) => current.trim() ? `${current.trim()}\n\n${snippet}` : snippet);
    setSelectedAssetIds((current) => [...current, asset.id]);
    void Haptics.selectionAsync();
  }

  // ── Choose: Record or Upload ──
  if (phase === "choose") {
    return (
      <ScrollView contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={st.scroll}>
        <View style={st.page}>
          <BackBtn label="Sessions" onPress={onBack} />
          <Text style={st.pageTitle}>New Session</Text>

          <View style={{ gap: 12 }}>
            <Pressable onPress={startRecording} style={({ pressed }) => [st.card, { padding: 22, flexDirection: "row", alignItems: "center", gap: 16 }, pressed && st.pressed]}>
              <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: C.red + "12", alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="mic" size={26} color={C.red} />
              </View>
              <View style={st.flex1}>
                <Text style={{ fontSize: 17, fontWeight: "900", color: C.text }}>Record Audio</Text>
                <Text style={{ fontSize: 13, fontWeight: "600", color: C.textSec, marginTop: 2 }}>Record your tour conversation in the background</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={C.textMuted} />
            </Pressable>

            <Pressable onPress={pickFile} style={({ pressed }) => [st.card, { padding: 22, flexDirection: "row", alignItems: "center", gap: 16 }, pressed && st.pressed]}>
              <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: C.brand + "12", alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="cloud-upload" size={26} color={C.brand} />
              </View>
              <View style={st.flex1}>
                <Text style={{ fontSize: 17, fontWeight: "900", color: C.text }}>Upload File</Text>
                <Text style={{ fontSize: 13, fontWeight: "600", color: C.textSec, marginTop: 2 }}>Select a video or audio from your device</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={C.textMuted} />
            </Pressable>
          </View>
        </View>
      </ScrollView>
    );
  }

  // ── Audio recording (works in background) ──
  if (phase === "recording") {
    return (
      <View style={st.callRecorder}>
        <View style={st.callTopBar}>
          <Pressable
            accessibilityLabel="Cancel recording"
            onPress={async () => { await rec.stop(); setPhase("choose"); }}
            style={st.callTopButton}
          >
            <Ionicons name="close" size={22} color="#fff" />
          </Pressable>
          <View style={st.callLiveBadge}><View style={st.callLiveDot} /><Text style={st.callLiveText}>LIVE RECORDING</Text></View>
          <View style={st.callTopSpacer} />
        </View>

        <View style={st.callCenter}>
          <View style={st.callMicHalo}>
            <View style={st.callMicCore}><Ionicons name="mic" size={38} color="#fff" /></View>
          </View>
          <Text style={st.callTitle}>Tour conversation</Text>
          <Text style={st.callTimer}>{fmtElapsed}</Text>
          <View style={st.waveform} accessibilityElementsHidden>
            {[18, 30, 42, 24, 50, 34, 44, 22, 38, 28, 46, 20].map((height, index) => (
              <View key={`${height}-${index}`} style={[st.waveBar, { height }]} />
            ))}
          </View>
          <Text style={st.callCaption}>Recording securely in the background</Text>
        </View>

        <View style={st.callControls}>
          <View style={st.callAction}>
            <Pressable onPress={() => setAssetSheetOpen(true)} style={({ pressed }) => [st.callActionButton, pressed && st.pressed]}>
              <Ionicons name="attach" size={25} color="#fff" />
              {selectedAssetIds.length > 0 && <View style={st.callActionCount}><Text style={st.callActionCountText}>{selectedAssetIds.length}</Text></View>}
            </Pressable>
            <Text style={st.callActionLabel}>Assets</Text>
          </View>
          <View style={st.callAction}>
            <Pressable onPress={stopRecording} style={({ pressed }) => [st.callStopButton, pressed && st.pressed]}>
              <View style={st.callStopSquare} />
            </Pressable>
            <Text style={st.callActionLabel}>Finish</Text>
          </View>
          <View style={st.callAction}>
            <Pressable onPress={() => setAssetSheetOpen(true)} style={({ pressed }) => [st.callActionButton, pressed && st.pressed]}>
              <Ionicons name="create-outline" size={24} color="#fff" />
            </Pressable>
            <Text style={st.callActionLabel}>Notes</Text>
          </View>
        </View>

        <Modal visible={assetSheetOpen} transparent animationType="slide" onRequestClose={() => setAssetSheetOpen(false)}>
          <View style={st.sheetBackdrop}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setAssetSheetOpen(false)} />
            <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={st.assetSheet}>
              <View style={st.sheetHandle} />
              <View style={st.sheetHeader}>
                <View style={st.flex1}>
                  <Text style={st.sheetTitle}>Follow-up assets</Text>
                  <Text style={st.sheetSubtitle}>Add links while they are top of mind.</Text>
                </View>
                <Pressable accessibilityLabel="Close assets" onPress={() => setAssetSheetOpen(false)} style={st.iconButton}>
                  <Ionicons name="close" size={20} color={C.text} />
                </Pressable>
              </View>
              <ScrollView style={st.assetSheetList} contentContainerStyle={{ gap: 8 }} showsVerticalScrollIndicator={false}>
                {assets.length ? assets.map((asset) => {
                  const selected = selectedAssetIds.includes(asset.id);
                  return (
                    <Pressable key={asset.id} onPress={() => addAsset(asset)} style={[st.assetPickRow, selected && st.assetPickRowSelected]}>
                      <View style={[st.materialIcon, { backgroundColor: selected ? C.greenBg : C.purpleBg }]}>
                        <Ionicons name={selected ? "checkmark" : "document-attach-outline"} size={18} color={selected ? C.green : C.purple} />
                      </View>
                      <View style={st.flex1}>
                        <Text style={st.assetPickTitle} numberOfLines={1}>{asset.name}</Text>
                        <Text style={st.assetPickMeta} numberOfLines={1}>{asset.description || asset.type}</Text>
                      </View>
                      <Text style={[st.assetPickAction, selected && { color: C.green }]}>{selected ? "Added" : "Add"}</Text>
                    </Pressable>
                  );
                }) : <EmptyState icon="folder-open-outline" title="No assets yet" subtitle="Add files from the Assets tab." />}
              </ScrollView>
              <TextInput
                value={notes}
                onChangeText={setNotes}
                placeholder="Add a quick follow-up note"
                placeholderTextColor={C.textMuted}
                multiline
                style={st.assetNotesInput}
              />
            </KeyboardAvoidingView>
          </View>
        </Modal>
      </View>
    );
  }

  // ── Uploading ──
  if (phase === "uploading") {
    return (
      <ScrollView contentInsetAdjustmentBehavior="automatic" showsVerticalScrollIndicator={false} contentContainerStyle={st.scroll}>
        <View style={st.page}>
          <BackBtn label="Sessions" onPress={onBack} />
          <Text style={st.pageTitle}>New Session</Text>
          <View style={[st.card, { padding: 24, gap: 12, alignItems: "center" }]}>
            <ActivityIndicator size="large" color={C.brand} />
            <Text style={st.formTitle}>Uploading...</Text>
            <Text style={{ fontSize: 13, fontWeight: "600", color: C.textSec }} numberOfLines={1}>{fileName}</Text>
            <View style={[st.progressTrack, { alignSelf: "stretch" }]}><View style={[st.progressFill, { width: `${progress}%` as any }]} /></View>
            <Text style={st.pageSub}>{progress}%</Text>
          </View>
        </View>
      </ScrollView>
    );
  }

  // ── Details form after upload ──
  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={st.scroll}>
      <View style={st.page}>
        <BackBtn label="Sessions" onPress={onBack} />
        <Text style={st.pageTitle}>New Session</Text>

        <View style={[st.card, { overflow: "hidden" }]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 14, backgroundColor: C.greenBg, borderBottomWidth: 1, borderBottomColor: "#e2e8f0" }}>
            <Ionicons name="checkmark-circle" size={20} color={C.green} />
            <View style={st.flex1}>
              <Text style={{ fontSize: 13, fontWeight: "800", color: C.green }}>Recording uploaded</Text>
              <Text style={{ fontSize: 12, fontWeight: "600", color: C.textSec }} numberOfLines={1}>{fileName}{fileSizeMB ? ` (${fileSizeMB} MB)` : ""}</Text>
            </View>
          </View>

          <View style={{ padding: 18, gap: 14 }}>
            <Text style={st.formTitle}>Session Details</Text>
            <Text style={{ fontSize: 13, fontWeight: "600", color: C.textSec, marginTop: -8 }}>Add context to improve your analysis</Text>
            <Input placeholder="Session title" value={title} onChangeText={setTitle} icon="text-outline" />
            <Input placeholder="Prospect name" value={prospect} onChangeText={setProspect} icon="person-outline" />
            <Input placeholder="Location / unit" value={location} onChangeText={setLocation} icon="location-outline" />
            {rubrics.length > 0 && (
              <View>
                <Text style={{ fontSize: 12, fontWeight: "800", color: C.textSec, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>Evaluation rubric</Text>
                <Pressable onPress={() => setRubricOpen((o) => !o)} style={({ pressed }) => [st.inputWrap, pressed && st.pressed]}>
                  <Ionicons name="clipboard-outline" size={18} color={C.textMuted} />
                  <Text style={[st.inputField, { flex: 1, paddingVertical: 0 }]} numberOfLines={1}>
                    {rubrics.find((r) => r.id === rubricId)?.name ?? "Select rubric"}
                  </Text>
                  <Ionicons name={rubricOpen ? "chevron-up" : "chevron-down"} size={18} color={C.textMuted} />
                </Pressable>
                {rubricOpen && (
                  <View style={{ marginTop: 8, borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 12, overflow: "hidden" }}>
                    {rubrics.map((rubric, i) => (
                      <Pressable
                        key={rubric.id}
                        onPress={() => { setRubricId(rubric.id); setRubricOpen(false); }}
                        style={({ pressed }) => [{ padding: 14, backgroundColor: rubricId === rubric.id ? C.brand + "10" : "#fff", borderTopWidth: i > 0 ? 1 : 0, borderTopColor: "#e2e8f0" }, pressed && st.pressed]}
                      >
                        <Text style={{ fontSize: 14, fontWeight: "800", color: C.text }}>{rubric.name}{rubric.isDefault ? " (default)" : ""}</Text>
                        <Text style={{ fontSize: 12, fontWeight: "600", color: C.textSec, marginTop: 2 }}>{rubricTotalPoints(rubric.definition)} pts · {rubricItemCount(rubric.definition)} items</Text>
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>
            )}
            <Input placeholder="Notes or focus areas" value={notes} onChangeText={setNotes} icon="document-text-outline" multiline />
            <PrimaryBtn label={submitting ? "Saving..." : "Save & Analyze"} onPress={submitAndProcess} disabled={submitting} icon="analytics-outline" />
            <Pressable onPress={() => { if (sessionId) onCreated(sessionId); }} style={({ pressed }) => [pressed && st.pressed]}>
              <Text style={{ textAlign: "center", fontSize: 13, fontWeight: "700", color: C.textMuted, paddingVertical: 6 }}>Skip, process now</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

// ═══════════════════════════════════════
// Session Detail
// ═══════════════════════════════════════

type DTab = "overview" | "rubric" | "transcript" | "actions" | "comments";

function SessionDetailScreen({ sessionId, onBack }: { sessionId: string; onBack: () => void }) {
  const [session, setSession] = useState<any>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [actions, setActions] = useState<FollowUpAction[]>([]);
  const [transcript, setTranscript] = useState<any[]>([]);
  const [comments, setComments] = useState<SessionComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<DTab>("overview");
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [sRes, aRes, actRes, tRes, cRes] = await Promise.all([
        fetchSession(sessionId),
        fetchAnalysis(sessionId).catch(() => ({ analysis: null })),
        fetchActions(sessionId).catch(() => ({ actions: [] as FollowUpAction[] })),
        fetchTranscript(sessionId).catch(() => ({ transcript: [] })),
        fetchComments(sessionId).catch(() => ({ comments: [] as SessionComment[] })),
      ]);
      setSession(sRes.session);
      setAnalysis(aRes.analysis);
      setActions(actRes.actions);
      setTranscript(tRes.transcript);
      setComments(cRes.comments);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load session");
    } finally { setLoading(false); }
  }, [sessionId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!session || analysis || !PROCESSING_STATUSES.has(session.status)) return;
    const poll = setInterval(() => {
      if (AppState.currentState === "active") void load();
    }, 4000);
    return () => clearInterval(poll);
  }, [analysis, load, session]);
  const onRefresh = useCallback(async () => { setRefreshing(true); await load(); setRefreshing(false); }, [load]);

  if (loading) return <View style={[st.flex1, st.center]}><ActivityIndicator size="large" color={C.brand} /><Text style={[st.pageSub, { marginTop: 12 }]}>Loading session...</Text></View>;

  if (!session) return (
    <View style={[st.flex1, st.center, { gap: 12 }]}>
      <Ionicons name="alert-circle-outline" size={48} color={C.red} />
      <Text style={st.emptyTitle}>{error ?? "Session not found"}</Text>
      <BackBtn label="Sessions" onPress={onBack} />
    </View>
  );

  const hasAnalysis = !!analysis;
  const sc = STATUS_COLORS[session.status] ?? { bg: "#eaf4ff", text: C.brand };
  const sl = STATUS_LABELS[session.status] ?? session.status;
  const isProcessable = ["uploaded", "failed"].includes(session.status);

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" showsVerticalScrollIndicator={false} contentContainerStyle={st.scroll} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.brand} />}>
      <View style={st.page}>
        {error && <ErrorBanner message={error} onRetry={load} />}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <BackBtn label="Sessions" onPress={onBack} />
          <View style={st.flex1} />
          <View style={[st.badge, { backgroundColor: sc.bg }]}><Text style={[st.badgeText, { color: sc.text }]}>{sl}</Text></View>
        </View>

        <Text style={st.detailTitle}>{session.title}</Text>
        <View style={{ gap: 3 }}>
          {session.scheduledAt && <DetailMeta icon="calendar-outline" text={`${fmtDate(session.scheduledAt)} ${fmtTime(session.scheduledAt)}`} />}
          {session.prospectName && <DetailMeta icon="person-outline" text={session.prospectName} />}
          {session.location && <DetailMeta icon="location-outline" text={session.location} />}
        </View>

        {/* Upload / Process section for non-analyzed sessions */}
        {!hasAnalysis && <UploadProcessCard sessionId={sessionId} status={session.status} rubricId={session.rubricId} onDone={load} />}

        {hasAnalysis && <ScoreHero analysis={analysis} />}

        {hasAnalysis && (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={st.tabsRow} contentContainerStyle={{ gap: 2 }}>
              {([["overview", "Overview", "grid-outline"], ["rubric", "Rubric", "clipboard-outline"], ["transcript", "Transcript", "chatbubble-outline"], ["actions", "Actions", "rocket-outline"], ["comments", "Comments", "chatbubbles-outline"]] as const).map(([id, label, icon]) => (
                <Pressable key={id} onPress={() => setTab(id as DTab)} style={[st.tabPill, tab === id && st.tabPillActive]}>
                  <Ionicons name={icon as any} size={14} color={tab === id ? C.brand : C.textMuted} />
                  <Text style={[st.tabPillText, tab === id && st.tabPillTextActive]}>{label}</Text>
                  {id === "actions" && actions.filter((a) => a.status === "open").length > 0 && (
                    <View style={st.tabBadge}><Text style={st.tabBadgeText}>{actions.filter((a) => a.status === "open").length}</Text></View>
                  )}
                  {id === "comments" && comments.length > 0 && (
                    <View style={[st.tabBadge, { backgroundColor: C.brand }]}><Text style={st.tabBadgeText}>{comments.length}</Text></View>
                  )}
                </Pressable>
              ))}
            </ScrollView>

            {tab === "overview" && <OverviewTab analysis={analysis} transcript={transcript} sessionId={sessionId} hasRecording={session.status !== "scheduled"} />}
            {tab === "rubric" && <RubricTab analysis={analysis} />}
            {tab === "transcript" && <TranscriptTab transcript={transcript} />}
            {tab === "actions" && <ActionsTab actions={actions} sessionId={sessionId} onUpdate={load} />}
            {tab === "comments" && <CommentsTab comments={comments} sessionId={sessionId} onUpdate={load} />}
          </>
        )}
      </View>
    </ScrollView>
  );
}

function DetailMeta({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <Ionicons name={icon} size={14} color={C.textSec} />
      <Text style={{ fontSize: 13, fontWeight: "700", color: C.textSec }}>{text}</Text>
    </View>
  );
}

function RubricPicker({
  rubrics,
  value,
  open,
  onToggle,
  onSelect,
}: {
  rubrics: Rubric[];
  value: string | null;
  open: boolean;
  onToggle: () => void;
  onSelect: (id: string) => void;
}) {
  const selected = rubrics.find((rubric) => rubric.id === value);
  return (
    <View>
      <Text style={st.fieldLabel}>Evaluation rubric</Text>
      <Pressable onPress={onToggle} style={({ pressed }) => [st.inputWrap, pressed && st.pressed]}>
        <Ionicons name="clipboard-outline" size={18} color={C.textMuted} />
        <View style={st.flex1}>
          <Text style={st.pickerValue} numberOfLines={1}>{selected?.name ?? "Select rubric"}</Text>
          {selected && (
            <Text style={st.pickerMeta}>
              {rubricTotalPoints(selected.definition)} pts · {rubricItemCount(selected.definition)} items
            </Text>
          )}
        </View>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={18} color={C.textMuted} />
      </Pressable>
      {open && (
        <View style={st.pickerMenu}>
          {rubrics.map((rubric, index) => (
            <Pressable
              key={rubric.id}
              onPress={() => onSelect(rubric.id)}
              style={({ pressed }) => [
                st.pickerOption,
                index > 0 && st.rowBorder,
                value === rubric.id && st.pickerOptionSelected,
                pressed && st.pressed,
              ]}
            >
              <View style={st.flex1}>
                <Text style={st.pickerOptionTitle}>{rubric.name}</Text>
                <Text style={st.pickerMeta}>
                  {rubric.definition.sections.length} sections · {rubricItemCount(rubric.definition)} items
                </Text>
              </View>
              {rubric.isDefault && <View style={st.defaultBadge}><Text style={st.defaultBadgeText}>Default</Text></View>}
              {value === rubric.id && <Ionicons name="checkmark-circle" size={19} color={C.brand} />}
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

// ═══════════════════════════════════════
// Upload & Process Card
// ═══════════════════════════════════════

function UploadProcessCard({ sessionId, status, rubricId: initialRubricId, onDone }: { sessionId: string; status: string; rubricId: string | null; onDone: () => void }) {
  const rec = useRecording();
  const [phase, setPhase] = useState<"idle" | "uploading" | "details" | "processing" | "done" | "error">(
    PROCESSING_STATUSES.has(status) ? "processing" : "idle"
  );
  const [progress, setProgress] = useState(0);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [pickedFile, setPickedFile] = useState<{ uri: string; mimeType: string; name: string; size?: number } | null>(null);

  // Details form fields
  const [dTitle, setDTitle] = useState("");
  const [dProspect, setDProspect] = useState("");
  const [dLocation, setDLocation] = useState("");
  const [dNotes, setDNotes] = useState("");
  const [recordingOpen, setRecordingOpen] = useState(false);
  const [rubrics, setRubrics] = useState<Rubric[]>([]);
  const [rubricsLoaded, setRubricsLoaded] = useState(false);
  const [rubricId, setRubricId] = useState<string | null>(initialRubricId);
  const [rubricOpen, setRubricOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    fetchRubrics()
      .then(({ rubrics: list }) => {
        setRubrics(list);
        if (!initialRubricId) {
          const fallbackRubricId = list.find((rubric) => rubric.isDefault)?.id ?? list[0]?.id ?? null;
          setRubricId(fallbackRubricId);
          if (fallbackRubricId) {
            void applyRubricToSession(sessionId, fallbackRubricId).catch(() => {});
          }
        }
      })
      .catch(() => {})
      .finally(() => setRubricsLoaded(true));
  }, [initialRubricId, sessionId]);

  useEffect(() => {
    if (PROCESSING_STATUSES.has(status)) setPhase("processing");
    if (status === "analysis_ready" || status === "reviewed") setPhase("done");
    if (status === "failed") {
      setErrMsg("Analysis did not complete. Retry when you have a stable connection.");
      setPhase("error");
    }
  }, [status]);

  async function selectRubric(nextRubricId: string) {
    const previous = rubricId;
    setRubricId(nextRubricId);
    setRubricOpen(false);
    try {
      await applyRubricToSession(sessionId, nextRubricId);
      showToast("Rubric applied to this session", "success");
    } catch (caught) {
      setRubricId(previous);
      showToast(caught instanceof Error ? caught.message : "Could not apply rubric", "error");
    }
  }

  async function startSessionRecording() {
    try {
      const started = await rec.start();
      if (!started) return;
      try {
        await authenticatedFetch(`/api/sessions/${sessionId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "in_progress" }),
        });
      } catch {
        await rec.stop();
        throw new Error("Could not activate the tour session");
      }
      setRecordingOpen(true);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (caught) {
      showToast(caught instanceof Error ? caught.message : "Could not start recording", "error");
    }
  }

  async function stopSessionRecording() {
    const result = await rec.stop();
    setRecordingOpen(false);
    if (!result?.uri) {
      showToast("Failed to save recording", "error");
      return;
    }
    setPickedFile({ uri: result.uri, mimeType: "audio/m4a", name: `tour-${Date.now()}.m4a` });
    setPhase("uploading");
    setProgress(0);
    const interval = setInterval(() => setProgress((value) => Math.min(value + 8, 90)), 300);
    try {
      await uploadRecording(sessionId, result.uri, "audio/m4a", `tour-${Date.now()}.m4a`, result.durationSec);
      setProgress(100);
      setPhase("details");
      showToast("Recording uploaded", "success");
    } catch (caught) {
      setPhase("error");
      setErrMsg(caught instanceof Error ? caught.message : "Upload failed");
    } finally {
      clearInterval(interval);
    }
  }

  async function cancelSessionRecording() {
    setCancelling(true);
    try {
      if (rec.isRecording) await rec.stop();
      setRecordingOpen(false);
      const response = await authenticatedFetch(`/api/sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "scheduled" }),
      });
      if (!response.ok) throw new Error("Could not reset the session");
      showToast("Recording cancelled. Session returned to scheduled.", "success");
      await onDone();
    } catch (caught) {
      showToast(caught instanceof Error ? caught.message : "Could not cancel the session", "error");
    } finally {
      setCancelling(false);
    }
  }

  function confirmCancelSession() {
    Alert.alert(
      "Cancel this recording?",
      "The current recording will be discarded and the session will return to Scheduled.",
      [
        { text: "Keep recording", style: "cancel" },
        { text: "Cancel recording", style: "destructive", onPress: () => void cancelSessionRecording() },
      ]
    );
  }

  async function pickAndUpload() {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ["video/*", "audio/*"], copyToCacheDirectory: true });
      if (result.canceled || !result.assets?.[0]) return;
      const file = result.assets[0];
      setPickedFile({ uri: file.uri, mimeType: file.mimeType ?? "video/mp4", name: file.name ?? "recording.mp4", size: file.size ?? undefined });

      // Upload immediately
      setPhase("uploading");
      setProgress(0);
      const interval = setInterval(() => setProgress((p) => Math.min(p + 8, 90)), 300);
      try {
        await uploadRecording(sessionId, file.uri, file.mimeType ?? "video/mp4", file.name ?? "recording.mp4");
        setProgress(100);
        showToast("Recording uploaded", "success");
        setPhase("details");
      } finally {
        clearInterval(interval);
      }
    } catch (err) {
      setPhase("error");
      setErrMsg(err instanceof Error ? err.message : "Upload failed");
      showToast(err instanceof Error ? err.message : "Upload failed", "error");
    }
  }

  async function submitDetailsAndProcess() {
    // Save session details if anything was filled in
    const patchBody: Record<string, string> = {};
    if (dTitle.trim()) patchBody.title = dTitle.trim();
    if (dProspect.trim()) patchBody.prospectName = dProspect.trim();
    if (dLocation.trim()) patchBody.location = dLocation.trim();
    if (dNotes.trim()) patchBody.notes = dNotes.trim();

    if (Object.keys(patchBody).length > 0) {
      try {
        await authenticatedFetch(`/api/sessions/${sessionId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patchBody),
        });
      } catch { /* best effort */ }
    }

    // Process the already-uploaded recording
    setPhase("processing");
    setErrMsg(null);
    try {
      await processSession(sessionId);
      setPhase("done");
      showToast("Analysis complete!", "success");
      setTimeout(onDone, 600);
    } catch (err) {
      setPhase("error");
      setErrMsg(err instanceof Error ? err.message : "Processing failed");
      showToast(err instanceof Error ? err.message : "Processing failed", "error");
    }
  }

  async function startProcess() {
    setPhase("processing");
    setErrMsg(null);
    try {
      await processSession(sessionId);
      setPhase("done");
      showToast("Analysis complete!", "success");
      setTimeout(onDone, 600);
    } catch (err) {
      setPhase("error");
      setErrMsg(err instanceof Error ? err.message : "Processing failed");
      showToast(err instanceof Error ? err.message : "Processing failed", "error");
    }
  }

  // Resume an uploaded session only after its evaluation rubric is resolved.
  useEffect(() => {
    if (status !== "uploaded" || phase !== "idle" || !rubricsLoaded) return;
    void (async () => {
      if (rubricId) await applyRubricToSession(sessionId, rubricId);
      await startProcess();
    })().catch((caught) => {
      setPhase("error");
      setErrMsg(caught instanceof Error ? caught.message : "Processing failed");
    });
  }, [phase, rubricId, rubricsLoaded, sessionId, status]);

  // ── Idle: pick a file ──
  if (phase === "idle" && (status === "scheduled" || status === "in_progress")) {
    return (
      <View style={[st.card, { padding: 20, gap: 14 }]}>
        <View style={{ alignItems: "center", gap: 8 }}>
        <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: C.brand + "10", alignItems: "center", justifyContent: "center" }}>
          <Ionicons name="mic-outline" size={28} color={C.brand} />
        </View>
        <Text style={st.formTitle}>{status === "in_progress" ? "Resume this tour" : "Start this tour"}</Text>
        <Text style={[st.pageSub, { textAlign: "center" }]}>Record live audio or upload an existing recording.</Text>
        </View>
        {rubrics.length > 0 && (
          <RubricPicker
            rubrics={rubrics}
            value={rubricId}
            open={rubricOpen}
            onToggle={() => setRubricOpen((current) => !current)}
            onSelect={(id) => void selectRubric(id)}
          />
        )}
        <PrimaryBtn label="Record Audio" onPress={startSessionRecording} icon="mic-outline" />
        <Pressable onPress={pickAndUpload} style={({ pressed }) => [st.outlineBtn, pressed && st.pressed]}>
          <Ionicons name="document-attach-outline" size={18} color={C.textSec} />
          <Text style={st.outlineBtnText}>Upload File</Text>
        </Pressable>
        {status === "in_progress" && (
          <Pressable disabled={cancelling} onPress={confirmCancelSession} style={({ pressed }) => [st.cancelSessionBtn, pressed && st.pressed]}>
            {cancelling ? <ActivityIndicator size="small" color={C.red} /> : <Ionicons name="close-circle-outline" size={18} color={C.red} />}
            <Text style={st.cancelSessionText}>{cancelling ? "Cancelling..." : "Cancel active session"}</Text>
          </Pressable>
        )}
        <Modal visible={recordingOpen} animationType="fade" onRequestClose={() => {}}>
          <View style={st.callRecorder}>
            <View style={st.callTopBar}>
              <Pressable accessibilityLabel="Cancel recording" disabled={cancelling} onPress={confirmCancelSession} style={st.callTopButton}>
                <Ionicons name="close" size={22} color="#fff" />
              </Pressable>
              <View style={st.callLiveBadge}><View style={st.callLiveDot} /><Text style={st.callLiveText}>LIVE RECORDING</Text></View>
              <View style={st.callTopSpacer} />
            </View>
            <View style={st.callCenter}>
              <View style={st.callMicHalo}><View style={st.callMicCore}><Ionicons name="mic" size={38} color="#fff" /></View></View>
              <Text style={st.callTitle}>Tour conversation</Text>
              <Text style={st.callTimer}>{fmtSec(rec.elapsed)}</Text>
              <View style={st.waveform} accessibilityElementsHidden>
                {[18, 30, 42, 24, 50, 34, 44, 22, 38, 28, 46, 20].map((height, index) => <View key={`${height}-${index}`} style={[st.waveBar, { height }]} />)}
              </View>
              <Text style={st.callCaption}>Recording to this Entrata session</Text>
            </View>
            <View style={st.callControls}>
              <View style={st.callAction}>
                <Pressable onPress={() => void stopSessionRecording()} style={({ pressed }) => [st.callStopButton, pressed && st.pressed]}>
                  <View style={st.callStopSquare} />
                </Pressable>
                <Text style={st.callActionLabel}>Finish</Text>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    );
  }

  // ── Details form after upload ──
  if (phase === "details") {
    const fileSizeMB = pickedFile?.size ? (pickedFile.size / 1024 / 1024).toFixed(1) : null;
    return (
      <View style={[st.card, { overflow: "hidden" }]}>
        {/* Upload success header */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 14, backgroundColor: C.greenBg, borderBottomWidth: 1, borderBottomColor: "#e2e8f0" }}>
          <Ionicons name="checkmark-circle" size={20} color={C.green} />
          <View style={st.flex1}>
            <Text style={{ fontSize: 13, fontWeight: "800", color: C.green }}>Recording uploaded</Text>
            <Text style={{ fontSize: 12, fontWeight: "600", color: C.textSec }} numberOfLines={1}>{pickedFile?.name}{fileSizeMB ? ` (${fileSizeMB} MB)` : ""}</Text>
          </View>
        </View>

        {/* Session details form */}
        <View style={{ padding: 18, gap: 14 }}>
          <Text style={st.formTitle}>Session Details</Text>
          <Text style={{ fontSize: 13, fontWeight: "600", color: C.textSec, marginTop: -8 }}>Add context before processing (optional)</Text>
          <Input placeholder="Session title" value={dTitle} onChangeText={setDTitle} icon="text-outline" />
          <Input placeholder="Prospect name" value={dProspect} onChangeText={setDProspect} icon="person-outline" />
          <Input placeholder="Location / unit" value={dLocation} onChangeText={setDLocation} icon="location-outline" />
          {rubrics.length > 0 && (
            <RubricPicker
              rubrics={rubrics}
              value={rubricId}
              open={rubricOpen}
              onToggle={() => setRubricOpen((current) => !current)}
              onSelect={(id) => void selectRubric(id)}
            />
          )}
          <Input placeholder="Notes or focus areas" value={dNotes} onChangeText={setDNotes} icon="document-text-outline" multiline />
          <PrimaryBtn label="Start Processing" onPress={submitDetailsAndProcess} icon="analytics-outline" />
          <Pressable onPress={() => submitDetailsAndProcess()} style={({ pressed }) => [pressed && st.pressed]}>
            <Text style={{ textAlign: "center", fontSize: 13, fontWeight: "700", color: C.textMuted, paddingVertical: 6 }}>Skip, process now</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // ── Uploading ──
  if (phase === "uploading") {
    return (
      <View style={[st.card, { padding: 20, gap: 12, alignItems: "center" }]}>
        <ActivityIndicator size="large" color={C.brand} />
        <Text style={st.formTitle}>Uploading...</Text>
        <View style={st.progressTrack}><View style={[st.progressFill, { width: `${progress}%` as any }]} /></View>
        <Text style={st.pageSub}>{progress}% uploaded</Text>
      </View>
    );
  }

  // ── Processing ──
  if (phase === "processing") {
    return (
      <View style={[st.card, { padding: 20, gap: 14, alignItems: "center" }]}>
        <ActivityIndicator size="large" color={C.brand} />
        <Text style={st.formTitle}>Analyzing Your Tour</Text>
        <Text style={[st.pageSub, { textAlign: "center" }]}>Transcribing, scoring, and generating insights...</Text>
        <View style={{ flexDirection: "row", gap: 16, marginTop: 4 }}>
          {([["mic-outline", "Transcribe"], ["analytics-outline", "Analyze"], ["sparkles-outline", "Actions"]] as const).map(([icon, label], i) => (
            <View key={i} style={{ alignItems: "center", gap: 4 }}>
              <Ionicons name={icon} size={20} color={C.brand} />
              <Text style={{ fontSize: 10, fontWeight: "700", color: C.textSec }}>{label}</Text>
            </View>
          ))}
        </View>
      </View>
    );
  }

  // ── Done ──
  if (phase === "done") {
    return (
      <View style={[st.card, { padding: 20, gap: 10, alignItems: "center" }]}>
        <Ionicons name="checkmark-circle" size={44} color={C.green} />
        <Text style={st.formTitle}>Analysis Complete</Text>
        <Text style={st.pageSub}>Loading results...</Text>
      </View>
    );
  }

  // ── Error ──
  if (phase === "error") {
    return (
      <View style={[st.card, { padding: 20, gap: 12 }]}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Ionicons name="alert-circle" size={24} color={C.red} />
          <Text style={[st.formTitle, { color: C.red }]}>Processing Failed</Text>
        </View>
        {errMsg && <Text style={{ fontSize: 13, fontWeight: "600", color: C.textSec }}>{errMsg}</Text>}
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Pressable onPress={startProcess} style={({ pressed }) => [st.primaryBtn, { flex: 1 }, pressed && st.pressed]}><Text style={st.primaryBtnText}>Retry</Text></Pressable>
          <Pressable onPress={pickAndUpload} style={({ pressed }) => [st.outlineBtn, { flex: 1 }, pressed && st.pressed]}><Text style={st.outlineBtnText}>Upload Different</Text></Pressable>
        </View>
      </View>
    );
  }

  // Fallback: uploaded but not yet processing
  return (
    <View style={[st.card, { padding: 20, gap: 12 }]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Ionicons name="checkmark-circle" size={20} color={C.green} />
        <Text style={{ fontSize: 14, fontWeight: "700", color: C.green }}>Recording uploaded</Text>
      </View>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <PrimaryBtn label="Process Now" onPress={startProcess} icon="analytics-outline" />
        <Pressable onPress={pickAndUpload} style={({ pressed }) => [st.outlineBtn, pressed && st.pressed]}><Text style={st.outlineBtnText}>Re-upload</Text></Pressable>
      </View>
    </View>
  );
}

// ═══════════════════════════════════════
// Score Hero
// ═══════════════════════════════════════

function ScoreHero({ analysis }: { analysis: AnalysisResult }) {
  const color = scoreColor(analysis.overallScore);
  const pts = analysis.totalPointsEarned ?? Math.round((analysis.overallScore / 100) * (analysis.totalPointsPossible ?? 200));
  const max = analysis.totalPointsPossible ?? 200;

  return (
    <View style={st.scoreHero}>
      <View style={{ alignItems: "center", gap: 6 }}>
        <View style={[st.scoreRing, { borderColor: color + "18" }]}>
          <View style={[st.scoreRingFill, { borderColor: color, borderLeftColor: analysis.overallScore >= 75 ? color : "transparent", borderBottomColor: analysis.overallScore >= 50 ? color : "transparent", borderRightColor: analysis.overallScore >= 25 ? color : "transparent", borderTopColor: "transparent" }]} />
          <Text style={[st.scoreNum, { color }]}>{analysis.overallScore}<Text style={{ fontSize: 18, fontWeight: "700" }}>%</Text></Text>
        </View>
        <Text style={{ fontSize: 13, fontWeight: "800", color: C.textSec }}>{pts}/{max} pts</Text>
      </View>
      <View style={{ gap: 10 }}>
        {analysis.sectionScores.map((sec) => {
          const c = scoreColor(sec.score);
          return (
            <View key={sec.section} style={{ gap: 5 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ fontSize: 13, fontWeight: "700", color: C.text, flex: 1 }} numberOfLines={1}>{sec.section}</Text>
                <Text style={{ fontSize: 13, fontWeight: "800", color: c }}>{sec.pointsPossible > 0 ? `${sec.pointsEarned}/${sec.pointsPossible}` : `${sec.score}%`}  {sec.score}%</Text>
              </View>
              <View style={st.trackBg}><View style={[st.trackFill, { width: `${sec.score}%` as any, backgroundColor: c }]} /></View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

// ═══════════════════════════════════════
// Overview Tab + Audio Player
// ═══════════════════════════════════════

function OverviewTab({ analysis, transcript, sessionId, hasRecording }: { analysis: AnalysisResult; transcript: any[]; sessionId: string; hasRecording: boolean }) {
  return (
    <View style={{ gap: 12 }}>
      {hasRecording && <AudioPlayer sessionId={sessionId} transcript={transcript} />}

      <InfoCard title="Executive Summary" icon="document-text-outline">{analysis.summary}</InfoCard>

      <View style={[st.card, { borderLeftWidth: 3, borderLeftColor: C.green }]}>
        <View style={{ padding: 16, gap: 8 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Ionicons name="thumbs-up-outline" size={16} color={C.green} />
            <Text style={[st.cardTitle, { color: C.green }]}>Strengths</Text>
          </View>
          {analysis.strengths.map((s, i) => <BulletItem key={i} text={s} color={C.green} />)}
        </View>
      </View>

      <View style={[st.card, { borderLeftWidth: 3, borderLeftColor: C.amber }]}>
        <View style={{ padding: 16, gap: 8 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Ionicons name="trending-up-outline" size={16} color={C.amber} />
            <Text style={[st.cardTitle, { color: C.amber }]}>Opportunities</Text>
          </View>
          {analysis.opportunities.map((o, i) => <BulletItem key={i} text={o} color={C.amber} />)}
        </View>
      </View>

      {analysis.suggestedRewrite && (
        <View style={[st.card, { borderLeftWidth: 3, borderLeftColor: C.brand }]}>
          <View style={{ padding: 16, gap: 8 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Ionicons name="chatbubble-ellipses-outline" size={16} color={C.brand} />
              <Text style={[st.cardTitle, { color: C.brand }]}>Coaching Script</Text>
            </View>
            <Text style={{ fontSize: 14, fontWeight: "600", color: C.textSec, lineHeight: 21, fontStyle: "italic" }}>"{analysis.suggestedRewrite}"</Text>
          </View>
        </View>
      )}

      {analysis.fairHousingFlags && analysis.fairHousingFlags.length > 0 && (
        <View style={[st.card, { backgroundColor: C.redBg, borderColor: C.red + "30" }]}>
          <View style={{ padding: 16, gap: 8 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Ionicons name="shield-outline" size={16} color={C.red} />
              <Text style={[st.cardTitle, { color: C.red }]}>Fair Housing Flags</Text>
            </View>
            {analysis.fairHousingFlags.map((f, i) => <Text key={i} style={{ fontSize: 13, fontWeight: "600", color: C.red }}>• {f}</Text>)}
          </View>
        </View>
      )}
    </View>
  );
}

function getRecordingPlaybackUrl(sessionId: string): string {
  return `${getApiBaseUrl()}/api/sessions/${sessionId}/recording`;
}

function AudioPlayer({ sessionId, transcript }: { sessionId: string; transcript: any[] }) {
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(0);
  const [loadError, setLoadError] = useState(false);

  const playbackUrl = getRecordingPlaybackUrl(sessionId);

  useEffect(() => {
    let mounted = true;
    let s: Audio.Sound | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const resolvedUrl = playbackUrl;

    (async () => {
      try {
        await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });

        const loadPromise = Audio.Sound.createAsync({ uri: resolvedUrl }, { shouldPlay: false });
        timer = setTimeout(() => { if (mounted) setLoadError(true); }, 15_000);

        const { sound: loaded } = await loadPromise;
        clearTimeout(timer);
        if (!mounted) { loaded.unloadAsync(); return; }
        s = loaded;
        setSound(loaded);
        const status = await loaded.getStatusAsync();
        if (status.isLoaded && status.durationMillis) setDur(status.durationMillis / 1000);
        loaded.setOnPlaybackStatusUpdate((st) => {
          if (!mounted) return;
          if (st.isLoaded) {
            setPos(st.positionMillis / 1000);
            if (st.durationMillis) setDur(st.durationMillis / 1000);
            if (st.didJustFinish) { setPlaying(false); setPos(0); }
          }
        });
      } catch {
        clearTimeout(timer);
        if (mounted) setLoadError(true);
      }
    })();
    return () => { mounted = false; clearTimeout(timer); s?.unloadAsync(); };
  }, [playbackUrl]);

  async function togglePlay() {
    if (!sound) return;
    if (playing) {
      await sound.pauseAsync();
      setPlaying(false);
    } else {
      await sound.playAsync();
      setPlaying(true);
    }
  }

  async function seekTo(frac: number) {
    if (!sound || dur === 0) return;
    const ms = frac * dur * 1000;
    await sound.setPositionAsync(ms);
    setPos(frac * dur);
  }

  const pct = dur > 0 ? (pos / dur) * 100 : 0;
  const activeSeg = transcript.find((s) => pos >= s.startTime && pos < s.endTime);

  if (loadError) {
    return (
      <View style={[st.card, { padding: 16, flexDirection: "row", alignItems: "center", gap: 10 }]}>
        <Ionicons name="alert-circle-outline" size={20} color={C.textMuted} />
        <Text style={{ fontSize: 13, fontWeight: "600", color: C.textSec, flex: 1 }}>Audio unavailable</Text>
      </View>
    );
  }

  if (!sound) {
    return (
      <View style={[st.card, { padding: 16, flexDirection: "row", alignItems: "center", gap: 10 }]}>
        <ActivityIndicator size="small" color={C.brand} />
        <Text style={{ fontSize: 13, fontWeight: "600", color: C.textSec }}>Loading audio...</Text>
      </View>
    );
  }

  return (
    <View style={[st.card, { overflow: "hidden" }]}>
      <View style={{ padding: 16, gap: 10 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Pressable onPress={togglePlay} style={({ pressed }) => [st.playBtn, pressed && st.pressed]}>
            <Ionicons name={playing ? "pause" : "play"} size={22} color="#fff" />
          </Pressable>
          <View style={st.flex1}>
            <Pressable onPress={(e) => { const w = Dimensions.get("window").width - 120; seekTo(Math.max(0, Math.min(1, (e.nativeEvent as any).locationX / w))); }}>
              <View style={st.timelineTrack}>
                <View style={[st.timelineFill, { width: `${pct}%` as any }]} />
                <View style={[st.timelineThumb, { left: `${pct}%` as any }]} />
              </View>
            </Pressable>
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 4 }}>
              <Text style={st.timeText}>{fmtSec(pos)}</Text>
              <Text style={st.timeText}>{fmtSec(dur)}</Text>
            </View>
          </View>
        </View>
        {activeSeg && (
          <View style={{ backgroundColor: C.brand + "08", borderRadius: 10, padding: 10 }}>
            <Text style={{ fontSize: 11, fontWeight: "800", color: C.brand, marginBottom: 2 }}>{activeSeg.speaker}</Text>
            <Text style={{ fontSize: 13, fontWeight: "600", color: C.text, lineHeight: 19 }}>{activeSeg.text}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

function InfoCard({ title, icon, children }: { title: string; icon: keyof typeof Ionicons.glyphMap; children: string }) {
  return (
    <View style={st.card}>
      <View style={{ padding: 16, gap: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Ionicons name={icon} size={16} color={C.text} />
          <Text style={st.cardTitle}>{title}</Text>
        </View>
        <Text style={{ fontSize: 14, fontWeight: "600", color: C.textSec, lineHeight: 21 }}>{children}</Text>
      </View>
    </View>
  );
}

function BulletItem({ text, color }: { text: string; color: string }) {
  return (
    <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-start" }}>
      <Ionicons name="ellipse" size={6} color={color} style={{ marginTop: 7 }} />
      <Text style={{ flex: 1, fontSize: 14, fontWeight: "600", color: C.textSec, lineHeight: 21 }}>{text}</Text>
    </View>
  );
}

// ═══════════════════════════════════════
// Rubric Tab
// ═══════════════════════════════════════

function RubricTab({ analysis }: { analysis: AnalysisResult }) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    analysis.sectionScores.forEach((s) => { init[s.section] = true; });
    return init;
  });

  return (
    <View style={{ gap: 12 }}>
      {analysis.sectionScores.map((sec) => {
        const c = scoreColor(sec.score);
        const hasQ = sec.questions?.length > 0;
        const exp = expanded[sec.section] ?? true;
        const passCount = hasQ ? sec.questions.filter((q) => q.passed).length : 0;

        return (
          <View key={sec.section} style={st.card}>
            <Pressable onPress={() => setExpanded((p) => ({ ...p, [sec.section]: !p[sec.section] }))} style={{ padding: 14, flexDirection: "row", alignItems: "center", gap: 8 }}>
              <View style={st.flex1}>
                <Text style={{ fontSize: 14, fontWeight: "800", color: C.text }}>{sec.section}</Text>
                {hasQ && <Text style={{ fontSize: 11, fontWeight: "700", color: C.textSec, marginTop: 1 }}>{passCount}/{sec.questions.length} passed</Text>}
              </View>
              {sec.pointsPossible > 0 && <Text style={{ fontSize: 12, fontWeight: "700", color: C.textSec }}>{sec.pointsEarned}/{sec.pointsPossible}</Text>}
              <View style={[st.rubricPctBadge, { backgroundColor: c + "15" }]}><Text style={{ fontSize: 12, fontWeight: "800", color: c }}>{sec.score}%</Text></View>
              <Ionicons name={exp ? "chevron-down" : "chevron-forward"} size={16} color={C.textMuted} />
            </Pressable>
            {exp && hasQ && (
              <View style={{ borderTopWidth: 1, borderTopColor: "#f1f5f9" }}>
                {sec.questions.map((q) => (
                  <View key={q.id} style={[st.questionRow, { borderLeftColor: q.passed ? C.green : C.red }]}>
                    <View style={[st.qIcon, { backgroundColor: q.passed ? C.greenBg : C.redBg }]}>
                      <Ionicons name={q.passed ? "checkmark" : "close"} size={14} color={q.passed ? C.green : C.red} />
                    </View>
                    <View style={st.flex1}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <Text style={{ fontSize: 11, fontWeight: "800", color: C.textMuted }}>{q.id}</Text>
                        <Text style={{ flex: 1, fontSize: 13, fontWeight: "700", color: C.text }} numberOfLines={2}>{q.question}</Text>
                        <View style={[st.qPtsBadge, { backgroundColor: q.passed ? C.greenBg : C.redBg }]}>
                          <Text style={{ fontSize: 11, fontWeight: "800", color: q.passed ? C.green : C.red }}>{q.earnedPoints}/{q.maxPoints}</Text>
                        </View>
                      </View>
                      {q.evidence ? <Text style={{ fontSize: 12, fontWeight: "600", color: C.textSec, marginTop: 4, lineHeight: 18 }}>{q.evidence}</Text> : null}
                    </View>
                  </View>
                ))}
              </View>
            )}
            {exp && !hasQ && <View style={{ padding: 14, borderTopWidth: 1, borderTopColor: "#f1f5f9" }}><Text style={{ fontSize: 13, fontWeight: "600", color: C.textSec }}>Re-process on web for per-question detail.</Text></View>}
          </View>
        );
      })}
    </View>
  );
}

// ═══════════════════════════════════════
// Transcript Tab
// ═══════════════════════════════════════

function TranscriptTab({ transcript }: { transcript: any[] }) {
  if (!transcript.length) return <EmptyState icon="chatbubble-outline" title="No transcript" subtitle="Process a recording to generate the transcript" />;
  return (
    <View style={st.card}>
      <View style={{ padding: 16 }}>
        {transcript.map((seg, i) => {
          const isAgent = seg.speaker?.toLowerCase().includes("agent");
          return (
            <View key={seg.id || i} style={[{ paddingVertical: 10 }, i > 0 && { borderTopWidth: 1, borderTopColor: "#f1f5f9" }]}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <View style={[st.speakerBadge, { backgroundColor: isAgent ? C.brand + "15" : C.purpleBg }]}>
                  <Text style={{ fontSize: 11, fontWeight: "800", color: isAgent ? C.brand : C.purple }}>{seg.speaker}</Text>
                </View>
                <Text style={st.timeText}>{fmtSec(seg.startTime)}</Text>
              </View>
              <Text style={{ fontSize: 14, fontWeight: "600", color: C.text, lineHeight: 21 }}>{seg.text}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

// ═══════════════════════════════════════
// Actions Tab
// ═══════════════════════════════════════

function ActionsTab({ actions, sessionId, onUpdate }: { actions: FollowUpAction[]; sessionId: string; onUpdate: () => void }) {
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const open = actions.filter((a) => a.status === "open");
  const done = actions.filter((a) => a.status !== "open");

  async function handleStatus(id: string, status: "completed" | "dismissed") {
    setUpdatingId(id);
    try { await updateActionStatus(sessionId, id, status); showToast(status === "completed" ? "Marked as done" : "Dismissed", "success"); onUpdate(); } catch { showToast("Failed to update", "error"); } finally { setUpdatingId(null); }
  }

  if (!actions.length) return <EmptyState icon="rocket-outline" title="No actions" subtitle="Follow-up actions will appear after analysis" />;

  const defaultPi = { icon: "remove-circle" as keyof typeof Ionicons.glyphMap, color: C.amber };
  const priorityIcon: Record<string, { icon: keyof typeof Ionicons.glyphMap; color: string }> = {
    high: { icon: "arrow-up-circle", color: C.red },
    medium: defaultPi,
    low: { icon: "arrow-down-circle", color: C.green },
  };

  return (
    <View style={{ gap: 12 }}>
      {open.length > 0 && open.map((a) => {
        const pi = priorityIcon[a.priority] ?? defaultPi;
        return (
          <View key={a.id} style={st.card}>
            <View style={{ padding: 16, gap: 10 }}>
              <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
                <Ionicons name={pi.icon} size={20} color={pi.color} style={{ marginTop: 1 }} />
                <View style={st.flex1}>
                  <Text style={{ fontSize: 15, fontWeight: "800", color: C.text }} numberOfLines={2}>{a.title}</Text>
                  <Text style={{ fontSize: 13, fontWeight: "600", color: C.textSec, lineHeight: 20, marginTop: 2 }}>{a.description}</Text>
                </View>
              </View>
              {a.suggestedMessage && (
                <View style={{ backgroundColor: "#f8fafc", borderRadius: 12, padding: 12 }}>
                  <Text style={{ fontSize: 11, fontWeight: "800", color: C.textMuted, textTransform: "uppercase", marginBottom: 4 }}>Suggested message</Text>
                  <Text style={{ fontSize: 13, fontWeight: "600", color: C.text, lineHeight: 20, fontStyle: "italic" }}>{a.suggestedMessage}</Text>
                </View>
              )}
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Pressable onPress={() => handleStatus(a.id, "completed")} disabled={updatingId === a.id} style={({ pressed }) => [{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: C.green, borderRadius: 12, paddingVertical: 10 }, pressed && st.pressed]}>
                  {updatingId === a.id ? <ActivityIndicator size="small" color="#fff" /> : <><Ionicons name="checkmark-circle-outline" size={16} color="#fff" /><Text style={{ color: "#fff", fontSize: 14, fontWeight: "800" }}>Complete</Text></>}
                </Pressable>
                <Pressable onPress={() => handleStatus(a.id, "dismissed")} disabled={updatingId === a.id} style={({ pressed }) => [{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "#f1f5f9", borderRadius: 12, paddingVertical: 10 }, pressed && st.pressed]}>
                  <Ionicons name="close-circle-outline" size={16} color={C.textSec} /><Text style={{ color: C.textSec, fontSize: 14, fontWeight: "800" }}>Dismiss</Text>
                </Pressable>
              </View>
            </View>
          </View>
        );
      })}
      {done.length > 0 && <Text style={st.sectionTitle}>Completed</Text>}
      {done.map((a) => (
        <View key={a.id} style={[st.card, { opacity: 0.55 }]}>
          <View style={{ padding: 14, flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Ionicons name={a.status === "completed" ? "checkmark-circle" : "close-circle"} size={18} color={a.status === "completed" ? C.green : C.textMuted} />
            <Text style={{ flex: 1, fontSize: 14, fontWeight: "700", color: C.text }} numberOfLines={1}>{a.title}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

// ═══════════════════════════════════════
// Comments Tab
// ═══════════════════════════════════════

function CommentsTab({ comments, sessionId, onUpdate }: { comments: SessionComment[]; sessionId: string; onUpdate: () => void }) {
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [replyToId, setReplyToId] = useState<string | null>(null);

  async function handlePost() {
    if (!body.trim()) return;
    setSubmitting(true);
    try {
      await postComment(sessionId, { body: body.trim(), parentId: replyToId });
      setBody("");
      setReplyToId(null);
      showToast("Comment posted", "success");
      onUpdate();
    } catch {
      showToast("Failed to post comment", "error");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(commentId: string) {
    try {
      await deleteComment(sessionId, commentId);
      showToast("Comment deleted", "success");
      onUpdate();
    } catch {
      showToast("Failed to delete", "error");
    }
  }

  const topLevel = comments.filter((c) => !c.parentId);
  const getReplies = (parentId: string) => comments.filter((c) => c.parentId === parentId);

  function relativeTime(iso: string) {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }

  return (
    <View style={{ gap: 12 }}>
      {/* Compose */}
      <View style={st.card}>
        <View style={{ padding: 14, gap: 10 }}>
          {replyToId && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: C.brand + "10", borderRadius: 8, padding: 8 }}>
              <Ionicons name="return-down-forward-outline" size={14} color={C.brand} />
              <Text style={{ flex: 1, fontSize: 12, fontWeight: "700", color: C.brand }}>Replying to comment</Text>
              <Pressable onPress={() => setReplyToId(null)}><Ionicons name="close-circle" size={18} color={C.textMuted} /></Pressable>
            </View>
          )}
          <TextInput
            placeholder="Add a comment..."
            placeholderTextColor={C.textMuted}
            value={body}
            onChangeText={setBody}
            multiline
            style={{ fontSize: 14, fontWeight: "600", color: C.text, minHeight: 60, textAlignVertical: "top" }}
          />
          <Pressable
            onPress={handlePost}
            disabled={!body.trim() || submitting}
            style={({ pressed }) => [st.primaryBtn, { minHeight: 42 }, pressed && st.pressed, (!body.trim() || submitting) && { opacity: 0.5 }]}
          >
            <Ionicons name="send-outline" size={16} color="#fff" />
            <Text style={[st.primaryBtnText, { fontSize: 14 }]}>{submitting ? "Posting..." : "Post Comment"}</Text>
          </Pressable>
        </View>
      </View>

      {/* Comments list */}
      {topLevel.length === 0 ? (
        <EmptyState icon="chatbubbles-outline" title="No comments yet" subtitle="Be the first to add feedback on this session" />
      ) : (
        topLevel.map((c) => (
          <View key={c.id} style={st.card}>
            <View style={{ padding: 14, gap: 8 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: C.brand + "15", alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ fontSize: 12, fontWeight: "900", color: C.brand }}>{c.authorName[0]?.toUpperCase()}</Text>
                </View>
                <Text style={{ fontSize: 13, fontWeight: "800", color: C.text }}>{c.authorName}</Text>
                <Text style={{ fontSize: 11, fontWeight: "600", color: C.textMuted }}>{relativeTime(c.createdAt)}</Text>
                {c.timestampSec !== null && (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: C.brand + "10", borderRadius: 99, paddingHorizontal: 6, paddingVertical: 2 }}>
                    <Ionicons name="time-outline" size={10} color={C.brand} />
                    <Text style={{ fontSize: 10, fontWeight: "800", color: C.brand }}>{fmtSec(c.timestampSec)}</Text>
                  </View>
                )}
                <View style={{ flex: 1 }} />
                <Pressable onPress={() => setReplyToId(c.id)} style={{ padding: 4 }}>
                  <Ionicons name="return-down-forward-outline" size={16} color={C.textMuted} />
                </Pressable>
                <Pressable onPress={() => handleDelete(c.id)} style={{ padding: 4 }}>
                  <Ionicons name="trash-outline" size={16} color={C.textMuted} />
                </Pressable>
              </View>
              <Text style={{ fontSize: 14, fontWeight: "600", color: C.textSec, lineHeight: 21 }}>{c.body}</Text>

              {/* Replies */}
              {getReplies(c.id).map((r) => (
                <View key={r.id} style={{ marginLeft: 28, marginTop: 8, paddingLeft: 10, borderLeftWidth: 2, borderLeftColor: C.brand + "20", gap: 6 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: C.brand + "10", alignItems: "center", justifyContent: "center" }}>
                      <Text style={{ fontSize: 9, fontWeight: "900", color: C.brand }}>{r.authorName[0]?.toUpperCase()}</Text>
                    </View>
                    <Text style={{ fontSize: 12, fontWeight: "800", color: C.text }}>{r.authorName}</Text>
                    <Text style={{ fontSize: 10, fontWeight: "600", color: C.textMuted }}>{relativeTime(r.createdAt)}</Text>
                    <View style={{ flex: 1 }} />
                    <Pressable onPress={() => handleDelete(r.id)} style={{ padding: 4 }}>
                      <Ionicons name="trash-outline" size={14} color={C.textMuted} />
                    </Pressable>
                  </View>
                  <Text style={{ fontSize: 13, fontWeight: "600", color: C.textSec, lineHeight: 20 }}>{r.body}</Text>
                </View>
              ))}
            </View>
          </View>
        ))
      )}
    </View>
  );
}

// ═══════════════════════════════════════
// Rubrics
// ═══════════════════════════════════════

function RubricsScreen({
  session,
  onBack,
  onSession,
}: {
  session: MobileAuthSession;
  onBack: () => void;
  onSession: (id: string) => void;
}) {
  const [rubrics, setRubrics] = useState<Rubric[]>([]);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [selected, setSelected] = useState<Rubric | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canManage = session.workspace.membership.role !== "member";

  const load = useCallback(async () => {
    setError(null);
    try {
      const [rubricData, sessionData] = await Promise.all([
        fetchRubrics(),
        fetchSessions({ limit: 100 }),
      ]);
      setRubrics(rubricData.rubrics);
      setSessions(sessionData.sessions);
      setSelected((current) => current
        ? rubricData.rubrics.find((rubric) => rubric.id === current.id) ?? null
        : null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load rubrics");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function pickRubricFile() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf", "text/*", "application/json", "text/csv"],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const file = result.assets[0];
      setUploading(true);
      const rubric = await uploadRubric(
        file.uri,
        file.mimeType ?? "application/octet-stream",
        file.name ?? "rubric-template.pdf"
      );
      await load();
      setSelected(rubric);
      showToast("Rubric extracted and added", "success");
    } catch (caught) {
      showToast(caught instanceof Error ? caught.message : "Rubric upload failed", "error");
    } finally {
      setUploading(false);
    }
  }

  function applicationsFor(rubricId: string) {
    return sessions.filter((item) => item.rubricId === rubricId);
  }

  return (
    <View style={st.flex1}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={st.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={C.brand} />}
      >
        <View style={st.page}>
          <View style={st.pageHeadingRow}>
            <BackBtn label="Settings" onPress={onBack} />
            <View style={st.flex1} />
            {canManage && (
              <Pressable
                accessibilityLabel="Upload rubric"
                disabled={uploading}
                onPress={() => void pickRubricFile()}
                style={({ pressed }) => [st.iconButton, pressed && st.pressed]}
              >
                {uploading ? <ActivityIndicator size="small" color={C.brand} /> : <Ionicons name="cloud-upload-outline" size={20} color={C.brand} />}
              </Pressable>
            )}
          </View>
          <View>
            <Text style={st.pageTitle}>Rubrics</Text>
            <Text style={st.pageHeadingSub}>{session.workspace.community.name}</Text>
          </View>
          {error && <ErrorBanner message={error} onRetry={load} />}
          {canManage && (
            <Pressable onPress={() => void pickRubricFile()} disabled={uploading} style={({ pressed }) => [st.rubricUploadCard, pressed && st.pressed]}>
              <View style={st.rubricUploadIcon}>
                {uploading ? <ActivityIndicator color={C.brand} /> : <Ionicons name="document-attach-outline" size={22} color={C.brand} />}
              </View>
              <View style={st.flex1}>
                <Text style={st.cardRowTitle}>{uploading ? "Extracting rubric..." : "Upload rubric template"}</Text>
                <Text style={st.cardRowSub}>PDF, TXT, Markdown, CSV, or JSON</Text>
              </View>
              {!uploading && <Ionicons name="chevron-forward" size={18} color={C.textMuted} />}
            </Pressable>
          )}
          {loading ? <LoadingBox /> : rubrics.length === 0 ? (
            <EmptyState icon="clipboard-outline" title="No rubrics" subtitle="Upload the first evaluation template for this community" />
          ) : (
            <View style={st.card}>
              {rubrics.map((rubric, index) => {
                const applications = applicationsFor(rubric.id);
                return (
                  <Pressable
                    key={rubric.id}
                    onPress={() => setSelected(rubric)}
                    style={({ pressed }) => [st.rubricRow, index < rubrics.length - 1 && st.rowBorder, pressed && st.pressed]}
                  >
                    <View style={st.rubricListIcon}><Ionicons name="clipboard-outline" size={19} color={C.purple} /></View>
                    <View style={st.flex1}>
                      <View style={st.rubricTitleRow}>
                        <Text style={st.materialName} numberOfLines={1}>{rubric.name}</Text>
                        {rubric.isDefault && <View style={st.defaultBadge}><Text style={st.defaultBadgeText}>Default</Text></View>}
                      </View>
                      <Text style={st.materialMeta}>
                        {rubric.definition.sections.length} sections · {rubricItemCount(rubric.definition)} items · {rubricTotalPoints(rubric.definition)} pts
                      </Text>
                      <Text style={st.rubricAppliedText}>{applications.length} session{applications.length === 1 ? "" : "s"}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={C.textMuted} />
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>

      <Modal visible={Boolean(selected)} animationType="slide" onRequestClose={() => setSelected(null)}>
        {selected && (
          <ScrollView contentInsetAdjustmentBehavior="automatic" showsVerticalScrollIndicator={false} contentContainerStyle={st.scroll}>
            <View style={st.page}>
              <View style={st.pageHeadingRow}>
                <BackBtn label="Rubrics" onPress={() => setSelected(null)} />
                <View style={st.flex1} />
                {selected.isDefault && <View style={st.defaultBadge}><Text style={st.defaultBadgeText}>Default</Text></View>}
              </View>
              <Text style={st.detailTitle}>{selected.name}</Text>
              <Text style={st.pageHeadingSub}>
                {rubricItemCount(selected.definition)} criteria · {rubricTotalPoints(selected.definition)} points
              </Text>
              {selected.definition.sections.map((section) => (
                <View key={section.name} style={st.card}>
                  <View style={st.rubricSectionHeader}>
                    <View style={st.flex1}>
                      <Text style={st.cardTitle}>{section.name}</Text>
                      <Text style={st.materialMeta}>{section.items.length} items</Text>
                    </View>
                    <Text style={st.rubricPoints}>{section.items.reduce((sum, item) => sum + item.points, 0)} pts</Text>
                  </View>
                  {section.items.map((item, index) => (
                    <View key={item.id} style={[st.rubricItem, index > 0 && st.rowBorder]}>
                      <View style={st.rubricItemNumber}><Text style={st.rubricItemNumberText}>{index + 1}</Text></View>
                      <View style={st.flex1}>
                        <Text style={st.rubricItemText}>{item.text}</Text>
                        {item.note && <Text style={st.rubricItemNote}>{item.note}</Text>}
                      </View>
                      <Text style={st.rubricPoints}>{item.points}</Text>
                    </View>
                  ))}
                </View>
              ))}
              {selected.definition.compliance && selected.definition.compliance.length > 0 && (
                <View style={st.card}>
                  <View style={st.rubricSectionHeader}><Text style={st.cardTitle}>Compliance</Text></View>
                  {selected.definition.compliance.map((item, index) => (
                    <View key={item.id} style={[st.rubricItem, index > 0 && st.rowBorder]}>
                      <Ionicons name="shield-checkmark-outline" size={18} color={C.green} />
                      <View style={st.flex1}>
                        <Text style={st.rubricItemText}>{item.text}</Text>
                        {item.note && <Text style={st.rubricItemNote}>{item.note}</Text>}
                      </View>
                    </View>
                  ))}
                </View>
              )}
              <Text style={st.sectionTitle}>Applied sessions</Text>
              {applicationsFor(selected.id).length === 0 ? (
                <EmptyState icon="albums-outline" title="No applications yet" subtitle="Choose this rubric when starting or opening a scheduled session" />
              ) : (
                <View style={st.card}>
                  {applicationsFor(selected.id).map((item, index, list) => (
                    <SessionRow
                      key={item.id}
                      session={item}
                      isLast={index === list.length - 1}
                      onPress={() => {
                        setSelected(null);
                        onSession(item.id);
                      }}
                    />
                  ))}
                </View>
              )}
            </View>
          </ScrollView>
        )}
      </Modal>
    </View>
  );
}

// ═══════════════════════════════════════
// Settings
// ═══════════════════════════════════════

function SettingsScreen({ session, onSessionChange, onRubrics, onSignOut }: { session: MobileAuthSession; onSessionChange: (session: MobileAuthSession) => void; onRubrics: () => void; onSignOut: () => void }) {
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [communityPickerOpen, setCommunityPickerOpen] = useState(false);
  const [communityQuery, setCommunityQuery] = useState("");
  const filteredCommunities = useMemo(() => {
    const value = communityQuery.trim().toLowerCase();
    return value
      ? session.workspace.communities.filter((community) => community.name.toLowerCase().includes(value))
      : session.workspace.communities;
  }, [communityQuery, session.workspace.communities]);

  async function chooseCommunity(communityId: string) {
    if (communityId === session.workspace.community.id) {
      setCommunityPickerOpen(false);
      return;
    }
    setSwitchingId(communityId);
    try {
      onSessionChange(await switchCommunity(communityId));
      setCommunityPickerOpen(false);
      setCommunityQuery("");
      showToast("Community switched", "success");
    } catch (caught) {
      showToast(caught instanceof Error ? caught.message : "Could not switch community", "error");
    } finally {
      setSwitchingId(null);
    }
  }

  return (
    <View style={st.page}>
      <Text style={st.pageTitle}>Settings</Text>
      <View style={st.settingsIdentity}>
        <View style={st.avatar48}><Text style={st.avatar48Text}>{(session.workspace.user.fullName ?? session.workspace.user.email)[0]?.toUpperCase()}</Text></View>
        <View style={st.flex1}>
          <Text style={st.cardRowTitle}>{session.workspace.user.fullName ?? "Team member"}</Text>
          <Text style={st.cardRowSub}>{session.workspace.user.email} · {session.workspace.membership.role}</Text>
        </View>
      </View>

      <Text style={st.settingsSectionLabel}>ACTIVE COMMUNITY</Text>
      <Pressable onPress={() => setCommunityPickerOpen(true)} style={({ pressed }) => [st.settingsIdentity, pressed && st.pressed]}>
        <View style={[st.communitySettingIcon, { backgroundColor: C.greenBg }]}>
          <Ionicons name="business-outline" size={18} color={C.green} />
        </View>
        <View style={st.flex1}>
          <Text style={st.communitySettingName}>{session.workspace.community.name}</Text>
          <Text style={st.cardRowSub}>{session.workspace.communities.length} available communities</Text>
        </View>
        <Text style={st.settingsChangeText}>Change</Text>
      </Pressable>
      <Text style={st.settingsSectionLabel}>EVALUATION</Text>
      <CardRow icon="clipboard-outline" title="Rubrics" sub="Templates, criteria, and session applications" onPress={onRubrics} />
      <CardRow icon="log-out-outline" title="Sign out" sub="Remove this account from the device" onPress={onSignOut} />
      <Text style={st.settingsVersion}>Tour mobile 0.1.0 · {session.workspace.membership.companyName}</Text>

      <Modal visible={communityPickerOpen} transparent animationType="slide" onRequestClose={() => setCommunityPickerOpen(false)}>
        <View style={st.sheetBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setCommunityPickerOpen(false)} />
          <View style={[st.assetSheet, { minHeight: "70%" }]}>
            <View style={st.sheetHandle} />
            <View style={st.sheetHeader}>
              <View style={st.flex1}>
                <Text style={st.sheetTitle}>Switch community</Text>
                <Text style={st.sheetSubtitle}>Your dashboard and integrations will update.</Text>
              </View>
              <Pressable accessibilityLabel="Close communities" onPress={() => setCommunityPickerOpen(false)} style={st.iconButton}>
                <Ionicons name="close" size={20} color={C.text} />
              </Pressable>
            </View>
            <View style={st.searchBar}>
              <Ionicons name="search" size={18} color={C.textMuted} />
              <TextInput
                value={communityQuery}
                onChangeText={setCommunityQuery}
                placeholder="Search communities"
                placeholderTextColor={C.textMuted}
                style={st.searchInput}
              />
            </View>
            <FlatList
              data={filteredCommunities}
              keyExtractor={(community) => community.id}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingTop: 10, paddingBottom: 20 }}
              renderItem={({ item }) => {
                const active = item.id === session.workspace.community.id;
                return (
                  <Pressable onPress={() => void chooseCommunity(item.id)} style={({ pressed }) => [st.communitySettingRow, st.rowBorder, pressed && st.pressed]}>
                    <View style={[st.communitySettingIcon, active && { backgroundColor: C.greenBg }]}>
                      <Ionicons name="business-outline" size={18} color={active ? C.green : C.brand} />
                    </View>
                    <Text style={st.communitySettingName} numberOfLines={1}>{item.name}</Text>
                    {switchingId === item.id ? <ActivityIndicator size="small" color={C.brand} /> : active ? <Ionicons name="checkmark-circle" size={20} color={C.green} /> : <Ionicons name="chevron-forward" size={17} color={C.textMuted} />}
                  </Pressable>
                );
              }}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ═══════════════════════════════════════
// Onboarding (preserved)
// ═══════════════════════════════════════

function OnboardingScreen({ idx, ob, player, step, onChange, onFinish, onStep }: {
  idx: number; ob: ObData; player: ReturnType<typeof useVideoPlayer>; step: OnboardingStep;
  onChange: (k: keyof ObData, v: string) => void; onFinish: () => void; onStep: (s: OnboardingStep) => void;
}) {
  return (
    <View style={st.obShell}>
      <VideoView allowsFullscreen={false} allowsPictureInPicture={false} contentFit="cover" nativeControls={false} player={player} playsInline style={StyleSheet.absoluteFillObject} />
      <View style={st.obScrim} />
      <View style={st.obContent}>
        <View style={{ gap: 10, paddingTop: 40 }}>
          <Text style={st.obEye}>Tour.video onboarding</Text>
          <Text style={st.obTitle}>Set up your leasing profile.</Text>
          <Text style={st.obSub}>Create the card visitors scan before a tour, attach it to your property, and verify your phone.</Text>
        </View>
        <View style={st.obStepper}>
          {onboardingSteps.map((s, i) => (
            <View key={s.id} style={st.obStepItem}>
              <View style={[st.obStepDot, i === idx && st.obStepDotActive, i < idx && st.obStepDotDone]}><Text style={[st.obStepDotText, (i === idx || i < idx) && { color: i < idx ? "#fff" : C.text }]}>{i + 1}</Text></View>
              <Text style={[st.obStepLabel, i === idx && { color: "#fff" }]}>{s.label}</Text>
            </View>
          ))}
        </View>
        <View style={st.obCard}>
          {step === "rep" && (
            <View style={{ gap: 14 }}>
              <Text style={st.formTitle}>Your leasing rep details</Text>
              <Input placeholder="Name" value={ob.name} onChangeText={(v) => onChange("name", v)} icon="person-outline" />
              <Input placeholder="Email" value={ob.email} onChangeText={(v) => onChange("email", v)} icon="mail-outline" keyboardType="email-address" autoCapitalize="none" />
              <Input placeholder="Phone" value={ob.phone} onChangeText={(v) => onChange("phone", v)} icon="call-outline" keyboardType="phone-pad" />
              <PrimaryBtn label="Continue to property" onPress={() => onStep("property")} icon="arrow-forward" />
            </View>
          )}
          {step === "property" && (
            <View style={{ gap: 14 }}>
              <Text style={st.formTitle}>Property and team</Text>
              <Input placeholder="Property name" value={ob.property} onChangeText={(v) => onChange("property", v)} icon="business-outline" />
              <Input placeholder="Invite team members by email" value={ob.teamInvites} onChangeText={(v) => onChange("teamInvites", v)} icon="people-outline" multiline />
              <PrimaryBtn label="Continue to verification" onPress={() => onStep("security")} icon="arrow-forward" />
            </View>
          )}
          {step === "security" && (
            <View style={{ gap: 14 }}>
              <Text style={st.formTitle}>Password and phone verification</Text>
              <Input placeholder="Create password" value={ob.password} onChangeText={(v) => onChange("password", v)} icon="lock-closed-outline" secureTextEntry />
              <Input placeholder="6-digit code" value={ob.verificationCode} onChangeText={(v) => onChange("verificationCode", v)} icon="keypad-outline" keyboardType="number-pad" />
              <View style={{ backgroundColor: "#eaf4ff", borderRadius: 16, padding: 12, flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Ionicons name="information-circle-outline" size={16} color={C.brand} />
                <Text style={{ color: C.brand, fontSize: 13, fontWeight: "800" }}>Code sent to {ob.phone || AGENT.phone}</Text>
              </View>
              <PrimaryBtn label="Finish setup" onPress={onFinish} icon="checkmark-circle-outline" />
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

// ═══════════════════════════════════════
// Profile & Tour (preserved)
// ═══════════════════════════════════════

function ProfileScreen({ session, onBack, onStartTour }: { session: MobileAuthSession; onBack: () => void; onStartTour: () => void }) {
  const name = session.workspace.user.fullName ?? "Team member";
  const initials = name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  return (
    <View style={st.page}>
      <BackBtn label="Home" onPress={onBack} />
      <View style={[st.card, { alignItems: "center", padding: 22, gap: 14 }]}>
        <View style={st.avatarLg}><Text style={st.avatarLgText}>{initials}</Text></View>
        <Text style={{ fontSize: 28, fontWeight: "900", color: C.text }}>{name}</Text>
        <Text style={{ fontSize: 15, fontWeight: "700", color: C.textSec, textAlign: "center" }}>{session.workspace.membership.role} at {session.workspace.community.name}</Text>
        <View style={{ alignSelf: "stretch", backgroundColor: "#f8fafc", borderRadius: 20, padding: 16, gap: 12 }}>
          <View style={{ gap: 4 }}><Text style={st.labelSmall}>Email</Text><Text style={{ fontSize: 14, fontWeight: "700", color: C.text }}>{session.workspace.user.email}</Text></View>
          <View style={{ gap: 4 }}><Text style={st.labelSmall}>Company</Text><Text style={{ fontSize: 14, fontWeight: "700", color: C.text }}>{session.workspace.membership.companyName}</Text></View>
        </View>
        <PrimaryBtn label="Exchange contact and start tour" onPress={onStartTour} icon="swap-horizontal-outline" />
      </View>
    </View>
  );
}

function TourStepper({ session, idx, prospect, step, onBack, onChange, onStep }: {
  session: MobileAuthSession; idx: number; prospect: ProspectData; step: TourStep; onBack: () => void; onChange: (k: keyof ProspectData, v: string) => void; onStep: (s: TourStep) => void;
}) {
  const name = session.workspace.user.fullName ?? "Team member";
  return (
    <View style={st.page}>
      <BackBtn label="Profile" onPress={onBack} />
      <View style={[st.card, { flexDirection: "row", alignItems: "center", gap: 12, padding: 14 }]}>
        <View style={st.avatar36}><Text style={{ color: C.brand, fontSize: 13, fontWeight: "900" }}>{name[0]?.toUpperCase()}</Text></View>
        <View style={st.flex1}>
          <Text style={{ fontSize: 17, fontWeight: "900", color: C.text }}>{name}</Text>
          <Text style={{ fontSize: 12, fontWeight: "700", color: C.textSec }}>{session.workspace.user.email}</Text>
        </View>
      </View>
      <View style={[st.card, { flexDirection: "row", padding: 14, gap: 10 }]}>
        {tourSteps.map((s, i) => (
          <View key={s.id} style={{ flex: 1, alignItems: "center", gap: 8 }}>
            <View style={[st.stepDot, i === idx && st.stepDotActive, i < idx && st.stepDotDone]}><Text style={[st.stepDotText, (i === idx || i < idx) && { color: "#fff" }]}>{i + 1}</Text></View>
            <Text style={[st.stepLabel, i === idx && { color: C.text }]}>{s.label}</Text>
          </View>
        ))}
      </View>
      <View style={[st.card, { padding: 18 }]}>
        {step === "contact" && (
          <View style={{ gap: 14 }}>
            <Text style={st.formTitle}>Your contact information</Text>
            <Input placeholder="Full name" value={prospect.name} onChangeText={(v) => onChange("name", v)} icon="person-outline" />
            <Input placeholder="Email" value={prospect.email} onChangeText={(v) => onChange("email", v)} icon="mail-outline" keyboardType="email-address" autoCapitalize="none" />
            <Input placeholder="Phone" value={prospect.phone} onChangeText={(v) => onChange("phone", v)} icon="call-outline" keyboardType="phone-pad" />
            <PrimaryBtn label="Continue to preferences" onPress={() => onStep("preferences")} icon="arrow-forward" />
          </View>
        )}
        {step === "preferences" && (
          <View style={{ gap: 14 }}>
            <Text style={st.formTitle}>What should the tour focus on?</Text>
            <Input placeholder="Target move-in date" value={prospect.moveIn} onChangeText={(v) => onChange("moveIn", v)} icon="calendar-outline" />
            <SegPicker label="Bedrooms" options={["Studio", "1 bed", "2 bed", "3 bed"]} value={prospect.bedrooms} onChange={(v) => onChange("bedrooms", v)} />
            <SegPicker label="Budget" options={["<$2,000", "$2,200 - $2,600", "$2,600+"]} value={prospect.budget} onChange={(v) => onChange("budget", v)} />
            <PrimaryBtn label="Review and start tour" onPress={() => onStep("ready")} icon="arrow-forward" />
          </View>
        )}
        {step === "ready" && (
          <View style={{ gap: 14 }}>
            <Text style={st.formTitle}>Ready to start</Text>
            <View style={{ backgroundColor: "#f8fafc", borderRadius: 22, padding: 16, gap: 12 }}>
              <SRow label="Prospect" value={prospect.name || "Guest"} />
              <SRow label="Contact" value={prospect.email || prospect.phone || "—"} />
              <SRow label="Focus" value={`${prospect.bedrooms} \u00B7 ${prospect.budget}`} />
              <SRow label="Move-in" value={prospect.moveIn || "Flexible"} />
            </View>
            <Pressable style={({ pressed }) => [st.darkBtn, pressed && st.pressed]}><Ionicons name="flag-outline" size={18} color="#fff" /><Text style={st.darkBtnText}>Start tour</Text></Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

function SRow({ label, value }: { label: string; value: string }) {
  return <View style={{ flexDirection: "row", justifyContent: "space-between" }}><Text style={{ fontSize: 13, fontWeight: "800", color: C.textSec }}>{label}</Text><Text style={{ fontSize: 13, fontWeight: "900", color: C.text }}>{value}</Text></View>;
}

// ═══════════════════════════════════════
// Shared components
// ═══════════════════════════════════════

function LoadingBox() { return <View style={{ padding: 40, alignItems: "center" }}><ActivityIndicator color={C.brand} /><Text style={[st.pageSub, { marginTop: 8 }]}>Loading...</Text></View>; }

function EmptyState({ icon, title, subtitle }: { icon: keyof typeof Ionicons.glyphMap; title: string; subtitle?: string }) {
  return (
    <View style={[st.card, { padding: 32, alignItems: "center", gap: 8 }]}>
      <Ionicons name={icon} size={36} color={C.textMuted} />
      <Text style={st.emptyTitle}>{title}</Text>
      {subtitle && <Text style={st.pageSub}>{subtitle}</Text>}
    </View>
  );
}

function BackBtn({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [st.backBtn, pressed && st.pressed]}>
      <Ionicons name="chevron-back" size={16} color={C.textSec} />
      <Text style={{ fontSize: 14, fontWeight: "800", color: C.textSec }}>{label}</Text>
    </Pressable>
  );
}

function PrimaryBtn({ label, onPress, icon, disabled }: { label: string; onPress: () => void; icon?: keyof typeof Ionicons.glyphMap; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={({ pressed }) => [st.primaryBtn, pressed && st.pressed, disabled && { opacity: 0.5 }]}>
      {icon && <Ionicons name={icon} size={18} color="#fff" />}
      <Text style={st.primaryBtnText}>{label}</Text>
    </Pressable>
  );
}

function Input({ placeholder, value, onChangeText, icon, multiline, secureTextEntry, keyboardType, autoCapitalize }: {
  placeholder: string; value: string; onChangeText: (v: string) => void; icon?: keyof typeof Ionicons.glyphMap; multiline?: boolean; secureTextEntry?: boolean; keyboardType?: any; autoCapitalize?: any;
}) {
  return (
    <View style={[st.inputWrap, multiline && { minHeight: 96, alignItems: "flex-start", paddingTop: 14 }]}>
      {icon && <Ionicons name={icon} size={18} color={C.textMuted} style={multiline ? { marginTop: 2 } : undefined} />}
      <TextInput placeholder={placeholder} placeholderTextColor={C.textMuted} value={value} onChangeText={onChangeText} style={[st.inputField, multiline && { textAlignVertical: "top", minHeight: 70 }]} multiline={multiline} secureTextEntry={secureTextEntry} keyboardType={keyboardType} autoCapitalize={autoCapitalize} />
    </View>
  );
}

function SegPicker({ label, options, value, onChange }: { label: string; options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={st.labelSmall}>{label}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {options.map((o) => (
          <Pressable key={o} onPress={() => onChange(o)} style={[st.segPill, value === o && st.segPillActive]}>
            <Text style={[st.segText, value === o && st.segTextActive]}>{o}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

// ═══════════════════════════════════════
// Styles
// ═══════════════════════════════════════

const W = Dimensions.get("window").width;

const st = StyleSheet.create({
  root: { backgroundColor: C.bg, flex: 1 },
  flex1: { flex: 1 },
  center: { alignItems: "center", justifyContent: "center" },
  scroll: { gap: 14, paddingHorizontal: 18, paddingTop: 56, paddingBottom: 32 },
  pressed: { opacity: 0.76, transform: [{ scale: 0.99 }] },
  page: { gap: 14 },

  // Toast
  toast: { position: "absolute", bottom: 100, left: 20, right: 20, flexDirection: "row", alignItems: "center", gap: 10, padding: 14, borderRadius: 8, zIndex: 999 },
  toastText: { color: "#fff", fontSize: 14, fontWeight: "700", flex: 1 },

  // Tab Bar
  tabBar: { flexDirection: "row", backgroundColor: C.card, borderTopWidth: 1, borderTopColor: C.border, paddingBottom: Platform.OS === "web" ? 12 : 28, paddingTop: 9 },
  tabBarItem: { flex: 1, alignItems: "center", gap: 2 },
  tabBarLabel: { fontSize: 10, fontWeight: "700", color: C.textMuted },
  tabBarLabelActive: { color: C.brand },

  // FAB
  fab: { position: "absolute", bottom: 96, right: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: C.brand, alignItems: "center", justifyContent: "center", shadowColor: C.brand, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 8 },

  // Error
  errorBanner: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, backgroundColor: C.redBg, borderRadius: 8, borderWidth: 1, borderColor: C.red + "20" },
  errorBannerText: { flex: 1, fontSize: 13, fontWeight: "700", color: C.red },
  errorRetryBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },

  // Dashboard
  dashGreet: { flexDirection: "row", alignItems: "center", gap: 14 },
  dashGreetText: { fontSize: 24, fontWeight: "900", color: C.text },
  dashProperty: { fontSize: 14, fontWeight: "700", color: C.textSec, marginTop: 2 },
  avatar48: { width: 48, height: 48, borderRadius: 8, backgroundColor: "#e9f2ff", alignItems: "center", justifyContent: "center" },
  avatar48Text: { color: C.brand, fontSize: 16, fontWeight: "900" },
  metricsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  metricCard: { width: "48.5%", backgroundColor: C.card, borderRadius: 8, borderWidth: 1, borderColor: C.border, padding: 15, gap: 6 },
  metricValue: { fontSize: 28, fontWeight: "900", color: C.text },
  metricLabel: { fontSize: 12, fontWeight: "800", color: C.textSec, textTransform: "uppercase" },

  // Card
  card: { backgroundColor: C.card, borderRadius: 8, borderWidth: 1, borderColor: C.border, overflow: "hidden" },
  cardTitle: { fontSize: 15, fontWeight: "800", color: C.text },
  cardRow: { backgroundColor: C.card, borderRadius: 8, borderWidth: 1, borderColor: C.border, flexDirection: "row", alignItems: "center", gap: 14, padding: 15 },
  cardRowIcon: { width: 40, height: 40, borderRadius: 8, backgroundColor: C.brand + "10", alignItems: "center", justifyContent: "center" },
  cardRowTitle: { fontSize: 15, fontWeight: "800", color: C.text },
  cardRowSub: { fontSize: 12, fontWeight: "600", color: C.textSec, marginTop: 1 },

  // Session Row
  sessionRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: "#f1f5f9" },
  sessionTitle: { fontSize: 15, fontWeight: "800", color: C.text },
  sessionMeta: { fontSize: 12, fontWeight: "600", color: C.textSec, marginTop: 2 },
  badge: { borderRadius: 99, paddingHorizontal: 10, paddingVertical: 5 },
  badgeText: { fontSize: 11, fontWeight: "800" },
  scoreNum: { fontSize: 15, fontWeight: "900", marginLeft: 4 },

  // Section title
  sectionTitle: { fontSize: 17, fontWeight: "900", color: C.text, marginTop: 4 },

  // Page
  pageTitle: { fontSize: 27, fontWeight: "900", color: C.text },
  pageSub: { fontSize: 14, fontWeight: "700", color: C.textSec, marginTop: -8 },
  emptyTitle: { fontSize: 15, fontWeight: "800", color: C.text },

  // Search
  searchBar: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: C.card, borderRadius: 8, borderWidth: 1, borderColor: C.border, paddingHorizontal: 14, minHeight: 48 },
  searchInput: { flex: 1, fontSize: 15, fontWeight: "600", color: C.text },

  // Detail
  detailTitle: { fontSize: 28, fontWeight: "900", color: C.text },

  // Score Hero
  scoreHero: { backgroundColor: C.card, borderRadius: 8, borderWidth: 1, borderColor: C.border, padding: 18, gap: 18 },
  scoreRing: { width: 120, height: 120, borderRadius: 60, borderWidth: 8, alignItems: "center", justifyContent: "center" },
  scoreRingFill: { position: "absolute", width: 120, height: 120, borderRadius: 60, borderWidth: 8, transform: [{ rotate: "-90deg" }] },
  scoreRingNum: { fontSize: 36, fontWeight: "900" } as any,
  trackBg: { height: 6, borderRadius: 99, backgroundColor: "#f1f5f9", overflow: "hidden" },
  trackFill: { height: "100%", borderRadius: 99 },

  // Progress
  progressTrack: { height: 6, borderRadius: 99, backgroundColor: "#f1f5f9", overflow: "hidden", alignSelf: "stretch" },
  progressFill: { height: "100%", borderRadius: 99, backgroundColor: C.brand },

  // Tabs
  tabsRow: { backgroundColor: C.card, borderRadius: 8, borderWidth: 1, borderColor: C.border, padding: 4, flexGrow: 0 },
  tabPill: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 6 },
  tabPillActive: { backgroundColor: C.brand + "10" },
  tabPillText: { fontSize: 11, fontWeight: "800", color: C.textSec },
  tabPillTextActive: { color: C.brand },
  tabBadge: { backgroundColor: C.red, borderRadius: 10, minWidth: 18, height: 18, alignItems: "center", justifyContent: "center", paddingHorizontal: 5 },
  tabBadgeText: { color: "#fff", fontSize: 10, fontWeight: "800" },

  // Rubric
  rubricPctBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  questionRow: { flexDirection: "row", gap: 10, padding: 12, borderBottomWidth: 1, borderBottomColor: "#f8fafc", borderLeftWidth: 3 },
  qIcon: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  qPtsBadge: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },

  // Speaker badge
  speakerBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  timeText: { fontSize: 11, fontWeight: "700", color: C.textMuted },

  // Audio player
  playBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.brand, alignItems: "center", justifyContent: "center" },
  timelineTrack: { height: 6, borderRadius: 99, backgroundColor: "#f1f5f9", overflow: "visible" },
  timelineFill: { height: "100%", borderRadius: 99, backgroundColor: C.brand },
  timelineThumb: { position: "absolute", top: -5, width: 16, height: 16, borderRadius: 8, backgroundColor: C.brand, borderWidth: 3, borderColor: "#fff", marginLeft: -8, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.15, shadowRadius: 3 },

  // Materials
  materialRow: { flexDirection: "row", gap: 12, padding: 14 },
  materialIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  materialName: { fontSize: 14, fontWeight: "800", color: C.text },
  materialDesc: { fontSize: 12, fontWeight: "600", color: C.textSec, marginTop: 2, lineHeight: 17 },
  materialMeta: { fontSize: 11, fontWeight: "700", color: C.textMuted, marginTop: 4, textTransform: "capitalize" },
  assetSummary: { flexDirection: "row", alignItems: "center", gap: 11, padding: 12, borderWidth: 1, borderColor: "#dbeafe", borderRadius: 8, backgroundColor: "#f5f9ff" },
  assetSummaryIcon: { width: 36, height: 36, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: "#eaf2ff" },

  // Rubric library and picker
  fieldLabel: { color: C.textSec, fontSize: 11, fontWeight: "900", marginBottom: 7, textTransform: "uppercase" },
  pickerValue: { color: C.text, fontSize: 14, fontWeight: "800" },
  pickerMeta: { color: C.textMuted, fontSize: 10, fontWeight: "700", marginTop: 2 },
  pickerMenu: { marginTop: 7, overflow: "hidden", borderWidth: 1, borderColor: C.border, borderRadius: 8, backgroundColor: C.card },
  pickerOption: { minHeight: 58, flexDirection: "row", alignItems: "center", gap: 9, paddingHorizontal: 12 },
  pickerOptionSelected: { backgroundColor: "#f3f7ff" },
  pickerOptionTitle: { color: C.text, fontSize: 13, fontWeight: "800" },
  defaultBadge: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, backgroundColor: C.greenBg },
  defaultBadgeText: { color: C.green, fontSize: 9, fontWeight: "900", textTransform: "uppercase" },
  rubricUploadCard: { minHeight: 72, flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderWidth: 1, borderColor: "#bfdbfe", borderRadius: 8, backgroundColor: "#f7fbff" },
  rubricUploadIcon: { width: 42, height: 42, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: "#eaf2ff" },
  rubricRow: { minHeight: 82, flexDirection: "row", alignItems: "center", gap: 11, padding: 13 },
  rubricListIcon: { width: 40, height: 40, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: C.purpleBg },
  rubricTitleRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  rubricAppliedText: { color: C.brand, fontSize: 10, fontWeight: "800", marginTop: 4 },
  rubricSectionHeader: { minHeight: 60, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, backgroundColor: "#f8fafc" },
  rubricPoints: { color: C.brand, fontSize: 12, fontWeight: "900" },
  rubricItem: { flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 13 },
  rubricItemNumber: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "#eef4ff" },
  rubricItemNumberText: { color: C.brand, fontSize: 10, fontWeight: "900" },
  rubricItemText: { color: C.text, fontSize: 13, fontWeight: "700", lineHeight: 19 },
  rubricItemNote: { color: C.textSec, fontSize: 11, fontWeight: "500", lineHeight: 16, marginTop: 4 },

  // Call recorder
  callRecorder: { flex: 1, backgroundColor: "#111318", paddingHorizontal: 22, paddingTop: Platform.OS === "ios" ? 56 : 24, paddingBottom: Platform.OS === "ios" ? 38 : 24 },
  callTopBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  callTopButton: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.1)" },
  callTopSpacer: { width: 42 },
  callLiveBadge: { flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 7, backgroundColor: "rgba(255,255,255,0.08)" },
  callLiveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#f04438" },
  callLiveText: { color: "#f2f4f7", fontSize: 10, fontWeight: "900" },
  callCenter: { flex: 1, alignItems: "center", justifyContent: "center", paddingBottom: 20 },
  callMicHalo: { width: 128, height: 128, borderRadius: 64, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(79,70,229,0.17)", marginBottom: 24 },
  callMicCore: { width: 88, height: 88, borderRadius: 44, alignItems: "center", justifyContent: "center", backgroundColor: "#4f46e5", shadowColor: "#4f46e5", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.38, shadowRadius: 24, elevation: 8 },
  callTitle: { color: "#fff", fontSize: 21, fontWeight: "800" },
  callTimer: { color: "#fff", fontSize: 48, fontWeight: "300", fontVariant: ["tabular-nums"], marginTop: 7 },
  waveform: { height: 54, flexDirection: "row", alignItems: "center", gap: 5, marginTop: 22 },
  waveBar: { width: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.72)" },
  callCaption: { color: "#98a2b3", fontSize: 12, fontWeight: "600", marginTop: 12 },
  callControls: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-around" },
  callAction: { width: 82, alignItems: "center", gap: 8 },
  callActionButton: { width: 58, height: 58, borderRadius: 29, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.12)" },
  callActionCount: { position: "absolute", top: -3, right: -2, minWidth: 20, height: 20, paddingHorizontal: 5, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: "#4f46e5", borderWidth: 2, borderColor: "#111318" },
  callActionCountText: { color: "#fff", fontSize: 10, fontWeight: "900" },
  callStopButton: { width: 66, height: 66, borderRadius: 33, alignItems: "center", justifyContent: "center", backgroundColor: "#f04438", borderWidth: 4, borderColor: "rgba(255,255,255,0.9)" },
  callStopSquare: { width: 23, height: 23, borderRadius: 4, backgroundColor: "#fff" },
  callActionLabel: { color: "#d0d5dd", fontSize: 12, fontWeight: "700" },
  cancelSessionBtn: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, borderRadius: 8, backgroundColor: C.redBg },
  cancelSessionText: { color: C.red, fontSize: 13, fontWeight: "800" },
  sheetBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(16,24,40,0.52)" },
  assetSheet: { maxHeight: "78%", minHeight: "52%", borderTopLeftRadius: 18, borderTopRightRadius: 18, backgroundColor: "#fff", paddingHorizontal: 18, paddingBottom: Platform.OS === "ios" ? 32 : 18 },
  sheetHandle: { width: 40, height: 4, alignSelf: "center", borderRadius: 2, backgroundColor: "#d0d5dd", marginTop: 9, marginBottom: 14 },
  sheetHeader: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 14 },
  sheetTitle: { color: C.text, fontSize: 20, fontWeight: "900" },
  sheetSubtitle: { color: C.textSec, fontSize: 12, marginTop: 2 },
  assetSheetList: { flexGrow: 0, marginBottom: 12 },
  assetPickRow: { minHeight: 62, flexDirection: "row", alignItems: "center", gap: 11, paddingHorizontal: 11, borderWidth: 1, borderColor: "#e4e7ec", borderRadius: 8, backgroundColor: "#fff" },
  assetPickRowSelected: { borderColor: "#abefc6", backgroundColor: "#ecfdf3" },
  assetPickTitle: { color: C.text, fontSize: 13, fontWeight: "800" },
  assetPickMeta: { color: C.textSec, fontSize: 11, marginTop: 2 },
  assetPickAction: { color: C.brand, fontSize: 11, fontWeight: "900" },
  assetNotesInput: { minHeight: 74, maxHeight: 120, borderWidth: 1, borderColor: "#d0d5dd", borderRadius: 8, padding: 11, color: C.text, fontSize: 13, textAlignVertical: "top" },

  // Calendar
  pageHeadingRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  pageHeadingSub: { color: C.textSec, fontSize: 12, fontWeight: "600", marginTop: 2 },
  iconButton: { width: 42, height: 42, borderRadius: 8, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: C.border, backgroundColor: C.card },
  integrationStrip: { flexDirection: "row", alignItems: "center", gap: 11, padding: 12, borderWidth: 1, borderColor: "#d1fadf", borderRadius: 8, backgroundColor: "#f6fef9" },
  integrationIcon: { width: 36, height: 36, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: "#dcfae6" },
  integrationTitle: { color: C.text, fontSize: 13, fontWeight: "800" },
  integrationSub: { color: C.textSec, fontSize: 10, marginTop: 2 },
  connectedBadge: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 7, backgroundColor: "#dcfae6" },
  connectedBadgeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.green },
  connectedBadgeText: { color: C.green, fontSize: 10, fontWeight: "900" },
  calendarEventRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 13 },
  entrataEventIcon: { width: 38, height: 38, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: C.purpleBg },
  calendarContact: { color: C.purple, fontSize: 10, fontWeight: "700", marginTop: 3 },
  calNav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
  calMonth: { fontSize: 17, fontWeight: "800", color: C.text },
  calDowRow: { flexDirection: "row", marginBottom: 6 },
  calDow: { flex: 1, textAlign: "center", fontSize: 11, fontWeight: "800", color: C.textMuted },
  calWeek: { flexDirection: "row" },
  calDayCell: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 8, borderRadius: 12, gap: 3 },
  calDayText: { fontSize: 14, fontWeight: "700", color: C.text },
  calDayToday: { backgroundColor: C.brand + "10" },
  calDayTextToday: { color: C.brand, fontWeight: "900" },
  calDaySelected: { backgroundColor: C.brand },
  calDayTextSelected: { color: "#fff", fontWeight: "900" },
  calDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: C.brand },
  calDots: { height: 5, flexDirection: "row", gap: 3 },

  // Settings
  settingsIdentity: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderWidth: 1, borderColor: C.border, borderRadius: 8, backgroundColor: C.card },
  settingsSectionLabel: { color: C.textMuted, fontSize: 10, fontWeight: "900", marginTop: 4 },
  communitySettingRow: { minHeight: 58, flexDirection: "row", alignItems: "center", gap: 11, paddingHorizontal: 12 },
  communitySettingIcon: { width: 34, height: 34, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: "#eef2ff" },
  communitySettingName: { flex: 1, color: C.text, fontSize: 13, fontWeight: "800" },
  settingsChangeText: { color: C.brand, fontSize: 12, fontWeight: "900" },
  settingsVersion: { color: C.textMuted, fontSize: 11, textAlign: "center", marginTop: 4 },

  // Buttons
  primaryBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: C.brand, borderRadius: 8, minHeight: 52, paddingHorizontal: 16 },
  primaryBtnText: { color: "#fff", fontSize: 16, fontWeight: "900" },
  outlineBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: C.card, borderRadius: 8, minHeight: 52, paddingHorizontal: 16, borderWidth: 1, borderColor: C.border },
  outlineBtnText: { color: C.textSec, fontSize: 15, fontWeight: "800" },
  darkBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: C.text, borderRadius: 8, minHeight: 52, paddingHorizontal: 16 },
  darkBtnText: { color: "#fff", fontSize: 16, fontWeight: "900" },

  // Form
  formTitle: { color: C.text, fontSize: 23, fontWeight: "900", lineHeight: 29 },
  inputWrap: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#f8fafc", borderColor: "#d7dee8", borderRadius: 8, borderWidth: 1, minHeight: 52, paddingHorizontal: 14 },
  inputField: { flex: 1, fontSize: 16, color: C.text, fontWeight: "600" },
  labelSmall: { fontSize: 11, fontWeight: "800", color: C.textMuted, textTransform: "uppercase" },

  // Segment picker
  segPill: { backgroundColor: "#f5f7fb", borderColor: "#d7dee8", borderRadius: 999, borderWidth: 1, paddingHorizontal: 13, paddingVertical: 9 },
  segPillActive: { backgroundColor: "#eaf4ff", borderColor: C.brand },
  segText: { color: C.textSec, fontSize: 13, fontWeight: "800" },
  segTextActive: { color: C.brand },

  // Step dots
  stepDot: { alignItems: "center", backgroundColor: "#eef2f7", borderRadius: 999, height: 34, justifyContent: "center", width: 34 },
  stepDotActive: { backgroundColor: C.brand },
  stepDotDone: { backgroundColor: C.green },
  stepDotText: { color: C.textSec, fontSize: 13, fontWeight: "900" },
  stepLabel: { color: C.textSec, fontSize: 12, fontWeight: "800" },

  // Back
  backBtn: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: C.card, borderColor: C.border, borderRadius: 999, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 },

  // Avatars
  avatarLg: { alignItems: "center", backgroundColor: "#e9f2ff", borderRadius: 30, height: 84, justifyContent: "center", width: 84 },
  avatarLgText: { color: C.brand, fontSize: 26, fontWeight: "900" },
  avatar36: { alignItems: "center", backgroundColor: "#e9f2ff", borderRadius: 14, height: 42, justifyContent: "center", width: 42 },

  // Onboarding
  obShell: { borderRadius: 34, minHeight: 760, overflow: "hidden" },
  obScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(8, 18, 38, 0.58)" },
  obContent: { gap: 18, minHeight: 760, padding: 18, justifyContent: "flex-end" },
  obEye: { color: "rgba(255,255,255,0.78)", fontSize: 12, fontWeight: "900", textTransform: "uppercase" },
  obTitle: { color: "#fff", fontSize: 36, fontWeight: "900", lineHeight: 40 },
  obSub: { color: "rgba(255,255,255,0.82)", fontSize: 16, fontWeight: "700", lineHeight: 23 },
  obStepper: { backgroundColor: "rgba(255,255,255,0.14)", borderColor: "rgba(255,255,255,0.18)", borderRadius: 24, borderWidth: 1, flexDirection: "row", gap: 10, padding: 12 },
  obStepItem: { alignItems: "center", flex: 1, gap: 8 },
  obStepDot: { alignItems: "center", backgroundColor: "rgba(255,255,255,0.16)", borderRadius: 999, height: 34, justifyContent: "center", width: 34 },
  obStepDotActive: { backgroundColor: "#fff" },
  obStepDotDone: { backgroundColor: C.green },
  obStepDotText: { color: "rgba(255,255,255,0.72)", fontSize: 13, fontWeight: "900" },
  obStepLabel: { color: "rgba(255,255,255,0.72)", fontSize: 12, fontWeight: "900" },
  obCard: { backgroundColor: "rgba(255,255,255,0.96)", borderRadius: 30, padding: 18 },
});
