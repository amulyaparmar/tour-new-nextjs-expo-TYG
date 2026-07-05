import { Ionicons } from "@expo/vector-icons";
import { Audio } from "expo-av";
import * as DocumentPicker from "expo-document-picker";
import * as Haptics from "expo-haptics";
import { StatusBar } from "expo-status-bar";
import { useVideoPlayer } from "expo-video";
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
  assetNoteSnippet,
  fetchMaterials,
  fetchRubrics,
  fetchSession,
  fetchSessions,
  fetchTranscript,
  postComment,
  processSession,
  syncCalendar,
  materialUrl,
  updateActionStatus,
  uploadRecording,
  uploadMaterial,
  uploadRubric,
} from "./src/api";
import { getApiBaseUrl } from "./src/config";
import { computeDashboardMetrics } from "./src/dashboard";
import { type MobileAuthSession, authenticatedFetch, clearSession, restoreSession, switchCommunity } from "./src/auth";
import { LoginScreen } from "./src/LoginScreen";
import { SessionAiChat } from "./src/components/SessionAiChat";
import { SessionFollowUpPanel } from "./src/components/SessionFollowUpPanel";
import { TourLogo, TourMark } from "./src/components/TourLogo";
import { LiveActivityBanner, RecordingExperience, RecordingProvider, useRecording } from "./src/recording";

const loginBackground = require("./assets/videos/login-bg.mp4");

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

type ProspectData = { name: string; email: string; phone: string; moveIn: string; bedrooms: string; budget: string };
type MainTab = "home" | "sessions" | "calendar" | "materials" | "settings";
type Screen =
  | { type: "main"; tab: MainTab }
  | { type: "session-detail"; sessionId: string }
  | { type: "create-session" }
  | { type: "rubrics" }
  | { type: "profile" }
  | { type: "tour" };

type TourStep = "contact" | "preferences" | "ready";

const AGENT = {
  name: "Alex Johnson",
  title: "Leasing Consultant",
  property: "Downtown Lofts",
  email: "alex@downtownlofts.com",
  phone: "(512) 555-0189",
  profileUrl: "tour.video/alex-downtown",
};

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

export default function App() {
  const player = useVideoPlayer(loginBackground, (vp) => {
    vp.loop = true;
    vp.muted = true;
    vp.play();
  });

  const [screen, setScreen] = useState<Screen>({ type: "main", tab: "home" });
  const [authSession, setAuthSession] = useState<MobileAuthSession | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [tourStep, setTourStep] = useState<TourStep>("contact");
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
      <RecordingProvider onNotify={showToast}>
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
                onGuestRegistration={() => {
                  setTourStep("contact");
                  nav({ type: "tour" });
                }}
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

function MainTabs({ tab, onTab, onSession, onCreate, onGuestRegistration, onProfile, onRubrics, onSignOut, authSession, onAuthSession, agentName, property }: {
  tab: MainTab; onTab: (t: MainTab) => void; onSession: (id: string) => void; onCreate: () => void; onGuestRegistration: () => void; onProfile: () => void; onRubrics: () => void; onSignOut: () => void; authSession: MobileAuthSession; onAuthSession: (session: MobileAuthSession) => void; agentName: string; property: string;
}) {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [upcomingSessions, setUpcomingSessions] = useState<SessionSummary[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [communityPickerOpen, setCommunityPickerOpen] = useState(false);
  const [communityQuery, setCommunityQuery] = useState("");
  const [switchingCommunityId, setSwitchingCommunityId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [sessData, upcomingData, matData, calendarData] = await Promise.all([
        fetchSessions({ limit: 100 }),
        fetchSessions({ limit: 10, upcoming: true, sort: "scheduled_asc" }),
        fetchMaterials().catch(() => ({ materials: [] as Material[] })),
        fetchCalendarEvents().catch(() => ({ events: [] as CalendarEvent[] })),
      ]);
      setSessions(sessData.sessions);
      setUpcomingSessions(upcomingData.sessions);
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

  const chooseCommunity = useCallback(async (communityId: string) => {
    if (communityId === authSession.workspace.community.id) {
      setCommunityPickerOpen(false);
      return;
    }
    setSwitchingCommunityId(communityId);
    try {
      const nextSession = await switchCommunity(communityId);
      onAuthSession(nextSession);
      setCommunityPickerOpen(false);
      setCommunityQuery("");
      showToast(`Switched to ${nextSession.workspace.community.name}`, "success");
    } catch (caught) {
      showToast(caught instanceof Error ? caught.message : "Could not switch community", "error");
    } finally {
      setSwitchingCommunityId(null);
    }
  }, [authSession.workspace.community.id, onAuthSession]);

  const showScrollView = tab !== "sessions";

  return (
    <View style={st.flex1}>
      {showScrollView && (
        <ScrollView contentInsetAdjustmentBehavior="automatic" showsVerticalScrollIndicator={false} contentContainerStyle={st.scroll} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.brand} />}>
          {error && <ErrorBanner message={error} onRetry={load} />}
          {tab === "home" && <DashboardScreen sessions={sessions} upcomingSessions={upcomingSessions} materials={materials} loading={loading} onSession={onSession} onProfile={onProfile} onCreate={onCreate} onGuestRegistration={onGuestRegistration} onCommunityPress={() => setCommunityPickerOpen(true)} agentName={agentName} property={property} />}
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
      <CommunityPickerModal
        visible={communityPickerOpen}
        session={authSession}
        query={communityQuery}
        switchingId={switchingCommunityId}
        onQueryChange={setCommunityQuery}
        onClose={() => {
          if (!switchingCommunityId) {
            setCommunityPickerOpen(false);
            setCommunityQuery("");
          }
        }}
        onSelect={(communityId) => void chooseCommunity(communityId)}
      />
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

function DashboardScreen({ sessions, upcomingSessions, materials, loading, onSession, onProfile, onCreate, onGuestRegistration, onCommunityPress, agentName, property }: {
  sessions: SessionSummary[];
  upcomingSessions: SessionSummary[];
  materials: Material[];
  loading: boolean;
  onSession: (id: string) => void;
  onProfile: () => void;
  onCreate: () => void;
  onGuestRegistration: () => void;
  onCommunityPress: () => void;
  agentName: string;
  property: string;
}) {
  const metrics = useMemo(() => computeDashboardMetrics(sessions), [sessions]);
  const recent = useMemo(() => sessions.slice(0, 3), [sessions]);
  const initials = agentName.split(" ").map((name) => name[0]).join("").slice(0, 2).toUpperCase();

  return (
    <View style={[st.page, { gap: 20 }]}>
      <View style={homeSt.topBar}>
        <Pressable accessibilityLabel="Open profile" onPress={onProfile}><TourLogo width={62} /></Pressable>
        <Pressable accessibilityLabel="Switch community" onPress={onCommunityPress} style={({ pressed }) => [homeSt.propertyPicker, pressed && st.pressed]}>
          <Text style={homeSt.propertyPickerText} numberOfLines={1}>{property}</Text>
          <Ionicons name="chevron-down" size={15} color={C.textSec} />
        </Pressable>
        <Pressable accessibilityLabel="Notifications" style={homeSt.headerIcon}>
          <Ionicons name="notifications-outline" size={20} color={C.text} />
        </Pressable>
      </View>

      <Pressable onPress={onProfile} style={({ pressed }) => [homeSt.businessCard, pressed && st.pressed]}>
        <View style={homeSt.profileRow}>
          <View style={homeSt.profileAvatar}><Text style={homeSt.profileAvatarText}>{initials}</Text></View>
          <View style={st.flex1}>
            <Text style={homeSt.profileName}>{agentName}</Text>
            <Text style={homeSt.profileRole}>Leasing Consultant · {property}</Text>
          </View>
          <BrandedQrIcon size={21} />
          <Ionicons name="share-social-outline" size={20} color={C.text} />
        </View>
        <View style={homeSt.contactRow}>
          <TourLogo width={62} />
          <View style={homeSt.smsButton}><Text style={homeSt.smsButtonText}>Share via SMS</Text></View>
        </View>
      </Pressable>

      <HomeSection title="Upcoming Tours" action="See All">
        {loading ? <LoadingBox /> : upcomingSessions.length === 0 ? (
          <EmptyState icon="calendar-outline" title="No upcoming tours" subtitle="Scheduled and active tours will appear here" />
        ) : upcomingSessions.slice(0, 3).map((session) => (
          <Pressable key={session.id} onPress={() => onSession(session.id)} style={({ pressed }) => [homeSt.tourCard, pressed && st.pressed]}>
            <View style={st.flex1}>
              <Text style={homeSt.tourTitle} numberOfLines={1}>{session.title}</Text>
              <View style={homeSt.tourMetaRow}>
                <Text style={homeSt.timePill}>
                  {session.status === "in_progress"
                    ? "Now"
                    : session.scheduledAt
                      ? `${new Date(session.scheduledAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })} · ${fmtTime(session.scheduledAt)}`
                      : "Scheduled"}
                </Text>
                <Text style={homeSt.tourMeta} numberOfLines={1}>{session.prospectName ?? "Prospect details pending"}</Text>
              </View>
            </View>
            <View style={[homeSt.statusPill, { backgroundColor: session.status === "in_progress" ? "#dcfce7" : "#fef3c7" }]}>
              <Text style={[homeSt.statusText, { color: session.status === "in_progress" ? C.green : C.amber }]}>
                {session.status === "in_progress" ? "ACTIVE" : "UPCOMING"}
              </Text>
            </View>
          </Pressable>
        ))}
      </HomeSection>

      <Pressable onPress={onGuestRegistration} style={({ pressed }) => [homeSt.actionCard, pressed && st.pressed]}>
        <View style={homeSt.actionIcon}>
          <BrandedQrIcon size={36} />
        </View>
        <View style={st.flex1}>
          <Text style={homeSt.actionTitle}>Guest Registration</Text>
          <Text style={homeSt.actionSub}>Check in a prospect for a tour</Text>
        </View>
        <Ionicons name="arrow-forward-circle" size={28} color={C.text} />
      </Pressable>

      <HomeSection title="Media" showLogo action={materials.length ? "See All" : undefined}>
        <View style={homeSt.mediaRow}>
          {materials.slice(0, 3).map((material) => (
            <View key={material.id} style={homeSt.mediaTile}>
              <Ionicons name={material.type === "training" ? "play-circle-outline" : "document-outline"} size={25} color={C.brand} />
              <Text style={homeSt.mediaLabel} numberOfLines={2}>{material.name}</Text>
            </View>
          ))}
          {materials.length === 0 && <Text style={homeSt.emptyInline}>Reusable tour assets will appear here.</Text>}
        </View>
        <Pressable onPress={onCreate} style={({ pressed }) => [homeSt.createButton, pressed && st.pressed]}>
          <Text style={homeSt.createButtonText}>+ Create New Session</Text>
        </Pressable>
      </HomeSection>

      <HomeSection title="AI Coaching Insights" showLogo>
        <View style={homeSt.insightCard}>
          <View style={st.flex1}>
            <Text style={homeSt.insightText}>
              {metrics.averageScore !== null
                ? `Your current average coaching score is ${metrics.averageScore}%`
                : "Complete a recorded tour to unlock coaching insights"}
            </Text>
            <Text style={homeSt.insightLink}>{metrics.processingSessions ? `${metrics.processingSessions} session${metrics.processingSessions === 1 ? "" : "s"} processing` : "View coaching report"}</Text>
          </View>
          <Ionicons name="analytics-outline" size={42} color={C.brand} />
        </View>
      </HomeSection>

      <HomeSection title="Recent Sessions" action="See All">
        {loading ? <LoadingBox /> : recent.length === 0 ? <EmptyState icon="albums-outline" title="No sessions yet" subtitle="Create your first session to get started" /> : (
          <View style={{ gap: 10 }}>
            {recent.map((session) => <SessionRow key={session.id} session={session} onPress={() => onSession(session.id)} isLast />)}
          </View>
        )}
      </HomeSection>
    </View>
  );
}

function HomeSection({ title, action, showLogo = false, children }: { title: string; action?: string; showLogo?: boolean; children: React.ReactNode }) {
  return (
    <View style={{ gap: 12 }}>
      <View style={homeSt.sectionHeader}>
        {showLogo && <TourLogo width={58} />}
        <Text style={homeSt.sectionTitle}>{title}</Text>
        {action && <Text style={homeSt.sectionAction}>{action}</Text>}
      </View>
      {children}
    </View>
  );
}

function BrandedQrIcon({ size = 32 }: { size?: number }) {
  const markSize = Math.max(8, Math.round(size * 0.38));
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Ionicons name="qr-code-outline" size={size} color={C.text} />
      <View style={[homeSt.qrBrandCenter, { width: markSize + 3, height: markSize + 3 }]}>
        <TourMark size={markSize} />
      </View>
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
  const [showSearch, setShowSearch] = useState(false);
  const [attentionOnly, setAttentionOnly] = useState(false);

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

  type SessionListItem =
    | { kind: "header"; id: string; label: string; count: number }
    | { kind: "session"; id: string; session: SessionSummary };

  const groupedRows = useMemo<SessionListItem[]>(() => {
    const now = new Date();
    const visibleSessions = attentionOnly
      ? sessions.filter((session) => ["uploaded", "failed", "analysis_ready"].includes(session.status))
      : sessions;
    const groups: Array<{ label: string; items: SessionSummary[] }> = [
      { label: "Live", items: visibleSessions.filter((session) => session.status === "in_progress") },
      {
        label: "Today",
        items: visibleSessions.filter((session) =>
          session.status !== "in_progress" &&
          !!session.scheduledAt &&
          new Date(session.scheduledAt).toDateString() === now.toDateString()
        ),
      },
      {
        label: "Needs review",
        items: visibleSessions.filter((session) => ["uploaded", "failed", "analysis_ready"].includes(session.status)),
      },
      {
        label: "This week",
        items: visibleSessions.filter((session) => {
          if (session.status === "in_progress" || ["uploaded", "failed", "analysis_ready"].includes(session.status)) return false;
          if (session.scheduledAt && new Date(session.scheduledAt).toDateString() === now.toDateString()) return false;
          return true;
        }),
      },
    ];
    return groups.flatMap((group) => group.items.length
      ? [
          { kind: "header" as const, id: `header-${group.label}`, label: group.label, count: group.items.length },
          ...group.items.map((session) => ({ kind: "session" as const, id: session.id, session })),
        ]
      : []
    );
  }, [attentionOnly, sessions]);

  const renderItem = useCallback(({ item }: { item: SessionListItem }) => {
    if (item.kind === "header") {
      return (
        <View style={slst.groupHeader}>
          <Text style={slst.groupLabel}>{item.label}</Text>
          <View style={slst.groupCount}><Text style={slst.groupCountText}>{item.count}</Text></View>
        </View>
      );
    }
    const session = item.session;
    const needsReview = ["uploaded", "failed", "analysis_ready"].includes(session.status);
    return (
      <Pressable onPress={() => onSession(session.id)} style={({ pressed }) => [slst.sessionCard, pressed && st.pressed]}>
        <View style={st.flex1}>
          <View style={slst.sessionNameRow}>
            {session.status === "in_progress" && <View style={slst.liveDot} />}
            <Text style={slst.sessionName} numberOfLines={1}>{session.title}</Text>
          </View>
          <Text style={slst.sessionMeta} numberOfLines={1}>
            {[session.location, session.scheduledAt ? `${fmtDate(session.scheduledAt)}, ${fmtTime(session.scheduledAt)}` : null].filter(Boolean).join(" · ") || session.prospectName || "Session details pending"}
          </Text>
        </View>
        <View style={slst.sessionRight}>
          <View style={[slst.syncBadge, needsReview && slst.reviewBadge]}>
            <Text style={[slst.syncText, needsReview && slst.reviewText]}>{needsReview ? "REVIEW" : session.status === "in_progress" ? "LIVE" : "SYNCED"}</Text>
          </View>
          {session.overallScore !== null && <Text style={slst.sessionScore}>{session.overallScore}</Text>}
        </View>
      </Pressable>
    );
  }, [onSession]);

  const keyExtractor = useCallback((item: SessionListItem) => item.id, []);

  const ListHeader = useMemo(() => (
    <View style={slst.header}>
      <View style={homeSt.topBar}>
        <Ionicons name="arrow-back" size={22} color={C.text} />
        <View style={homeSt.propertyPicker}><Text style={homeSt.propertyPickerText}>Sessions</Text></View>
        <Pressable onPress={() => setShowSearch((value) => !value)} style={homeSt.headerIcon}>
          <Ionicons name={showSearch ? "close" : "search"} size={19} color={C.text} />
        </Pressable>
      </View>
      <Text style={st.pageTitle}>Sessions</Text>

      {showSearch && (
        <View style={st.searchBar}>
          <Ionicons name="search-outline" size={18} color={C.textMuted} />
          <TextInput autoFocus placeholder="Search sessions..." placeholderTextColor={C.textMuted} value={search} onChangeText={setSearch} style={st.searchInput} returnKeyType="search" />
        </View>
      )}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={slst.chipsRow}>
        <View style={[slst.chip, slst.personChip]}><Ionicons name="person-circle-outline" size={18} color={C.text} /><Text style={slst.chipText}>You</Text><Ionicons name="chevron-down" size={12} color={C.textSec} /></View>
        <Pressable style={[slst.chip, slst.teamChip]}><Text style={slst.teamChipText}>Your team</Text></Pressable>
        <Pressable onPress={() => setShowSort((v) => !v)} style={[slst.chip, slst.sortChip]}>
          <Text style={slst.chipText}>{SORT_OPTS.find((o) => o.value === sort)?.label}</Text>
          <Ionicons name="chevron-down" size={12} color={C.textSec} />
        </Pressable>
      </ScrollView>

      <Pressable onPress={() => setAttentionOnly((value) => !value)} style={[slst.attentionChip, attentionOnly && { backgroundColor: "#fef3c7" }]}>
        <Ionicons name="alert-circle-outline" size={15} color="#f59e0b" />
        <Text style={slst.attentionText}>Needs attention</Text>
      </Pressable>

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
  ), [attentionOnly, search, sort, showSort, showSearch]);

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
      data={groupedRows}
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
    />
  );
}

const slst = StyleSheet.create({
  list: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 120 },
  header: { gap: 12, marginBottom: 8 },
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
  personChip: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#fff", borderColor: "#e5e7eb" },
  teamChip: { backgroundColor: "#eef2ff" },
  teamChipText: { color: "#4338ca", fontSize: 12, fontWeight: "800" },
  attentionChip: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: "#f59e0b", borderRadius: 18 },
  attentionText: { color: "#f59e0b", fontSize: 12, fontWeight: "800" },
  groupHeader: { flexDirection: "row", alignItems: "center", gap: 8, paddingTop: 8, paddingBottom: 7 },
  groupLabel: { color: "#9ca3af", fontSize: 12, fontWeight: "900", textTransform: "uppercase" },
  groupCount: { minWidth: 18, height: 18, borderRadius: 4, backgroundColor: "#e5e7eb", alignItems: "center", justifyContent: "center", paddingHorizontal: 5 },
  groupCountText: { color: C.textSec, fontSize: 10, fontWeight: "900" },
  sessionCard: { minHeight: 74, flexDirection: "row", alignItems: "center", gap: 12, padding: 15, marginBottom: 10, borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 12, backgroundColor: "#fff" },
  sessionNameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  sessionName: { flex: 1, color: "#1a1a1a", fontSize: 15, fontWeight: "900" },
  sessionMeta: { color: "#666", fontSize: 12, marginTop: 5 },
  sessionRight: { alignItems: "flex-end", gap: 5 },
  syncBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4, backgroundColor: "#ebf5ff" },
  syncText: { color: C.brand, fontSize: 9, fontWeight: "900" },
  reviewBadge: { backgroundColor: "#fffbeb" },
  reviewText: { color: "#f59e0b" },
  sessionScore: { color: "#1a1a1a", fontSize: 16, fontWeight: "900" },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#f04438" },
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

  function addAsset(asset: Material) {
    if (selectedAssetIds.includes(asset.id)) return;
    const snippet = assetNoteSnippet(asset);
    setNotes((current) => (current.trim() ? `${current.trim()}\n\n${snippet}` : snippet));
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
      <RecordingExperience
        title={title || "Tour conversation"}
        notes={notes}
        onNotesChange={setNotes}
        assets={assets}
        selectedAssetIds={selectedAssetIds}
        onAddAsset={addAsset}
        onCancel={async () => {
          await rec.stop();
          setPhase("choose");
        }}
        onFinish={stopRecording}
      />
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

  if (hasAnalysis) {
    return (
      <SessionReviewExperience
        session={session}
        analysis={analysis}
        transcript={transcript}
        comments={comments}
        actions={actions}
        sessionId={sessionId}
        onBack={onBack}
        onReload={load}
      />
    );
  }

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
        {!hasAnalysis && (
          <UploadProcessCard
            sessionId={sessionId}
            status={session.status}
            rubricId={session.rubricId}
            sessionTitle={session.title}
            onDone={load}
          />
        )}

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

function SessionReviewExperience({
  session,
  analysis,
  transcript,
  comments,
  actions,
  sessionId,
  onBack,
  onReload,
}: {
  session: any;
  analysis: AnalysisResult;
  transcript: any[];
  comments: SessionComment[];
  actions: FollowUpAction[];
  sessionId: string;
  onBack: () => void;
  onReload: () => void;
}) {
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [activeSegmentId, setActiveSegmentId] = useState<string | null>(transcript[0]?.id ?? null);
  const [commentingOn, setCommentingOn] = useState<any | null>(null);
  const [commentBody, setCommentBody] = useState("");
  const [posting, setPosting] = useState(false);
  const [momentIndex, setMomentIndex] = useState(0);
  const [reviewMode, setReviewMode] = useState<"transcript" | "coaching" | "ai" | "followup" | "actions">("transcript");
  const scrollRef = useRef<ScrollView | null>(null);
  const segmentY = useRef<Record<string, number>>({});
  const userDragging = useRef(false);
  const lastAutoSegment = useRef<string | null>(null);

  const playbackUrl = getRecordingPlaybackUrl(sessionId);
  const timestampedComments = useMemo(
    () => comments.filter((comment) => comment.timestampSec !== null).sort((a, b) => (a.timestampSec ?? 0) - (b.timestampSec ?? 0)),
    [comments]
  );
  const momentTimes = useMemo(() => {
    if (timestampedComments.length) return timestampedComments.map((comment) => comment.timestampSec ?? 0);
    if (!transcript.length) return [];
    const stride = Math.max(1, Math.floor(transcript.length / 3));
    return transcript.filter((_, index) => index % stride === 0).map((segment) => segment.startTime);
  }, [timestampedComments, transcript]);

  const scrollToSegment = useCallback((segment: any, animated = true) => {
    if (!segment) return;
    setActiveSegmentId(segment.id);
    const y = segmentY.current[segment.id];
    if (typeof y === "number") scrollRef.current?.scrollTo({ y: Math.max(0, y - 12), animated });
  }, []);

  useEffect(() => {
    let mounted = true;
    let loadedSound: Audio.Sound | undefined;
    void (async () => {
      try {
        await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
        const result = await Audio.Sound.createAsync({ uri: playbackUrl }, { shouldPlay: false, progressUpdateIntervalMillis: 250 });
        if (!mounted) {
          await result.sound.unloadAsync();
          return;
        }
        loadedSound = result.sound;
        setSound(result.sound);
        result.sound.setOnPlaybackStatusUpdate((status) => {
          if (!mounted || !status.isLoaded) return;
          const nextPosition = status.positionMillis / 1000;
          setPosition(nextPosition);
          if (status.durationMillis) setDuration(status.durationMillis / 1000);
          setPlaying(status.isPlaying);
          const segment = transcript.find((item) => nextPosition >= item.startTime && nextPosition < item.endTime);
          if (segment) {
            setActiveSegmentId(segment.id);
            if (status.isPlaying && !userDragging.current && lastAutoSegment.current !== segment.id) {
              lastAutoSegment.current = segment.id;
              scrollToSegment(segment);
            }
          }
          if (status.didJustFinish) setPlaying(false);
        });
      } catch {
        showToast("Audio is unavailable for this session", "error");
      }
    })();
    return () => {
      mounted = false;
      void loadedSound?.unloadAsync();
    };
  }, [playbackUrl, scrollToSegment, transcript]);

  const seekToSeconds = useCallback(async (seconds: number, shouldPlay = false) => {
    if (!sound) return;
    const next = Math.max(0, Math.min(duration || seconds, seconds));
    await sound.setPositionAsync(next * 1000);
    setPosition(next);
    if (shouldPlay) await sound.playAsync();
    const segment = transcript.find((item) => next >= item.startTime && next < item.endTime) ?? transcript[0];
    scrollToSegment(segment);
  }, [duration, scrollToSegment, sound, transcript]);

  const handleAiSeek = useCallback((seconds: number) => {
    setReviewMode("transcript");
    void seekToSeconds(seconds, true);
  }, [seekToSeconds]);

  async function togglePlayback() {
    if (!sound) return;
    if (playing) await sound.pauseAsync();
    else await sound.playAsync();
  }

  async function changeSpeed() {
    if (!sound) return;
    const next = speed === 1 ? 1.25 : speed === 1.25 ? 1.5 : speed === 1.5 ? 2 : 1;
    await sound.setRateAsync(next, true);
    setSpeed(next);
  }

  async function postInlineComment() {
    if (!commentingOn || !commentBody.trim()) return;
    setPosting(true);
    try {
      await postComment(sessionId, { body: commentBody.trim(), timestampSec: commentingOn.startTime });
      setCommentBody("");
      setCommentingOn(null);
      showToast("Comment added at this moment", "success");
      onReload();
    } catch {
      showToast("Could not add comment", "error");
    } finally {
      setPosting(false);
    }
  }

  function jumpMoment(direction: 1 | -1) {
    if (!momentTimes.length) return;
    const next = (momentIndex + direction + momentTimes.length) % momentTimes.length;
    setMomentIndex(next);
    void seekToSeconds(momentTimes[next] ?? 0, true);
  }

  function commentsForSegment(segment: any) {
    return comments.filter((comment) =>
      comment.timestampSec !== null &&
      comment.timestampSec >= segment.startTime &&
      comment.timestampSec < segment.endTime
    );
  }

  const pct = duration > 0 ? Math.min(100, (position / duration) * 100) : 0;

  return (
    <View style={reviewSt.root}>
      <View style={reviewSt.header}>
        <Pressable onPress={onBack} style={reviewSt.headerButton}><Ionicons name="arrow-back" size={22} color={C.text} /></Pressable>
        <View style={reviewSt.propertyPicker}>
          <Text style={reviewSt.propertyText} numberOfLines={1}>{session.location || "Session Review"}</Text>
          <Ionicons name="chevron-down" size={15} color={C.textSec} />
        </View>
        <Pressable style={reviewSt.headerButton}><Ionicons name="notifications-outline" size={20} color={C.text} /></Pressable>
      </View>

      <View style={reviewSt.titleRow}>
        <View style={st.flex1}>
          <Text style={reviewSt.title} numberOfLines={1}>{session.title}</Text>
          <Text style={reviewSt.subtitle}>{session.prospectName || "Recorded tour"} · {analysis.overallScore}% score</Text>
        </View>
        <View style={reviewSt.actionCount}><Text style={reviewSt.actionCountText}>{actions.filter((action) => action.status === "open").length} actions</Text></View>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={reviewSt.modeRow}>
        {([
          ["transcript", "Transcript", "chatbubble-outline"],
          ["ai", "Tour AI", "sparkles"],
          ["coaching", "Coaching", "school-outline"],
          ["followup", "Follow-up", "paper-plane-outline"],
          ["actions", "Actions", "checkmark-done-outline"],
        ] as const).map(([mode, label, icon]) => (
          <Pressable key={mode} onPress={() => setReviewMode(mode)} style={[reviewSt.modeButton, reviewMode === mode && reviewSt.modeButtonActive]}>
            <Ionicons name={icon} size={15} color={reviewMode === mode ? C.brand : C.textSec} />
            <Text style={[reviewSt.modeText, reviewMode === mode && reviewSt.modeTextActive]}>{label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={reviewSt.transcriptContent}
        scrollEventThrottle={16}
        onScrollBeginDrag={() => { userDragging.current = true; }}
        onMomentumScrollEnd={(event) => {
          const offset = event.nativeEvent.contentOffset.y;
          const closest = transcript.reduce<any | null>((best, segment) => {
            if (!best) return segment;
            return Math.abs((segmentY.current[segment.id] ?? 0) - offset) < Math.abs((segmentY.current[best.id] ?? 0) - offset) ? segment : best;
          }, null);
          userDragging.current = false;
          if (closest && closest.id !== activeSegmentId) void seekToSeconds(closest.startTime);
        }}
        onScrollEndDrag={() => { setTimeout(() => { userDragging.current = false; }, 120); }}
      >
        {reviewMode === "coaching" && (
          <View style={{ gap: 12 }}>
            <ScoreHero analysis={analysis} />
            <InfoCard title="Executive Summary" icon="document-text-outline">{analysis.summary}</InfoCard>
            <View style={[st.card, { padding: 14, gap: 8, borderLeftWidth: 3, borderLeftColor: C.green }]}>
              <Text style={[st.cardTitle, { color: C.green }]}>Strengths</Text>
              {analysis.strengths.map((strength, index) => <BulletItem key={index} text={strength} color={C.green} />)}
            </View>
            <View style={[st.card, { padding: 14, gap: 8, borderLeftWidth: 3, borderLeftColor: C.amber }]}>
              <Text style={[st.cardTitle, { color: C.amber }]}>Coaching opportunities</Text>
              {analysis.opportunities.map((opportunity, index) => <BulletItem key={index} text={opportunity} color={C.amber} />)}
            </View>
            <RubricTab analysis={analysis} />
          </View>
        )}
        {reviewMode === "ai" && (
          <SessionAiChat sessionId={sessionId} analysis={analysis} onSeek={handleAiSeek} />
        )}
        {reviewMode === "followup" && (
          <SessionFollowUpPanel
            session={session}
            actions={actions}
            sessionId={sessionId}
            onActionsUpdated={onReload}
            onToast={(message, type) => showToast(message, type ?? "info")}
          />
        )}
        {reviewMode === "actions" && <ActionsTab actions={actions} sessionId={sessionId} onUpdate={onReload} />}
        {reviewMode === "transcript" && transcript.length === 0 && <EmptyState icon="chatbubble-outline" title="No transcript yet" subtitle="The transcript will appear after processing." />}
        {reviewMode === "transcript" && transcript.map((segment, index) => {
          const active = segment.id === activeSegmentId;
          const isAgent = segment.speaker?.toLowerCase().includes("agent");
          const segmentComments = commentsForSegment(segment);
          return (
            <View
              key={segment.id || index}
              onLayout={(event) => { segmentY.current[segment.id] = event.nativeEvent.layout.y; }}
              style={[reviewSt.transcriptCard, active && reviewSt.transcriptCardActive]}
            >
              <Pressable onPress={() => void seekToSeconds(segment.startTime, true)} style={reviewSt.transcriptMain}>
                <View style={[reviewSt.speakerAvatar, { backgroundColor: isAgent ? "#8766c9" : "#548ce3" }]}>
                  <Text style={reviewSt.speakerAvatarText}>{isAgent ? "A" : "C"}</Text>
                </View>
                <View style={st.flex1}>
                  <View style={reviewSt.metaRow}>
                    <Text style={reviewSt.speaker}>{segment.speaker || (isAgent ? "Agent" : "Customer")}</Text>
                    <Text style={reviewSt.segmentTime}>{fmtSec(segment.startTime)}</Text>
                  </View>
                  <Text style={reviewSt.transcriptText}>{segment.text}</Text>
                </View>
                <View style={reviewSt.segmentActions}>
                  <Pressable accessibilityLabel="Add comment" onPress={() => setCommentingOn(segment)}><Ionicons name="chatbubble-outline" size={17} color={C.textSec} /></Pressable>
                  <Pressable accessibilityLabel="Bookmark moment" onPress={() => void Haptics.selectionAsync()}><Ionicons name="bookmark-outline" size={17} color={C.textSec} /></Pressable>
                </View>
              </Pressable>
              {segmentComments.map((comment) => (
                <Pressable key={comment.id} onPress={() => void seekToSeconds(comment.timestampSec ?? segment.startTime, true)} style={reviewSt.inlineComment}>
                  <Ionicons name="flash" size={13} color="#f59e0b" />
                  <View style={st.flex1}>
                    <Text style={reviewSt.inlineCommentAuthor}>{comment.authorName} · {fmtSec(comment.timestampSec ?? 0)}</Text>
                    <Text style={reviewSt.inlineCommentBody}>{comment.body}</Text>
                  </View>
                </Pressable>
              ))}
              {commentingOn?.id === segment.id && (
                <View style={reviewSt.inlineComposer}>
                  <TextInput autoFocus value={commentBody} onChangeText={setCommentBody} placeholder={`Comment at ${fmtSec(segment.startTime)}`} placeholderTextColor={C.textMuted} style={reviewSt.inlineInput} />
                  <Pressable disabled={posting || !commentBody.trim()} onPress={postInlineComment} style={reviewSt.inlineSend}>
                    {posting ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="send" size={16} color="#fff" />}
                  </Pressable>
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>

      <View style={reviewSt.playerDock}>
        <View style={reviewSt.quickControls}>
          <Pressable accessibilityLabel="Open Tour AI" onPress={() => setReviewMode("ai")} style={reviewSt.quickButton}><Ionicons name="sparkles" size={20} color={C.text} /></Pressable>
          <Pressable accessibilityLabel="Open follow-up" onPress={() => setReviewMode("followup")} style={reviewSt.quickButton}><Ionicons name="paper-plane-outline" size={20} color={C.text} /></Pressable>
          <Pressable accessibilityLabel="Open coaching" onPress={() => setReviewMode("coaching")} style={reviewSt.quickButton}><Ionicons name="school-outline" size={20} color={C.text} /></Pressable>
          <Pressable accessibilityLabel="Follow active transcript" onPress={() => {
            setReviewMode("transcript");
            scrollToSegment(transcript.find((segment) => segment.id === activeSegmentId));
          }} style={reviewSt.quickButton}><Ionicons name="mic-outline" size={20} color={C.text} /></Pressable>
          <Pressable accessibilityLabel="Comment on active moment" onPress={() => {
            const segment = transcript.find((item) => item.id === activeSegmentId);
            if (segment) {
              setReviewMode("transcript");
              setCommentingOn(segment);
              scrollToSegment(segment);
            }
          }} style={reviewSt.quickButton}><Ionicons name="chatbubble-outline" size={20} color={C.text} /></Pressable>
        </View>
        <View style={reviewSt.momentRow}>
          <Pressable onPress={() => jumpMoment(-1)} style={reviewSt.prevButton}><Text style={reviewSt.prevText}>PREV</Text></Pressable>
          <Text style={reviewSt.momentLabel}>⚡ Coachable Moments</Text>
          <Pressable onPress={() => jumpMoment(1)} style={reviewSt.nextButton}><Text style={reviewSt.nextText}>NEXT ↓</Text></Pressable>
        </View>
        <Pressable onPress={(event) => {
          const width = Dimensions.get("window").width - 40;
          void seekToSeconds(((event.nativeEvent as any).locationX / width) * duration);
        }} style={reviewSt.waveformTrack}>
          {[8, 14, 28, 10, 32, 24, 18, 40, 34, 12, 22, 38, 16, 30, 24, 12, 36, 18, 28, 10, 20, 14, 30, 12].map((height, index) => (
            <View key={`${height}-${index}`} style={[reviewSt.waveformBar, { height, opacity: (index / 23) * 100 <= pct ? 1 : 0.35 }]} />
          ))}
        </Pressable>
        <View style={reviewSt.timeRow}><Text style={reviewSt.time}>{fmtSec(position)}</Text><Text style={reviewSt.time}>{fmtSec(duration)}</Text></View>
        <View style={reviewSt.playbackRow}>
          <Pressable onPress={changeSpeed}><Text style={reviewSt.speed}>{speed}x</Text></Pressable>
          <Pressable onPress={() => void seekToSeconds(position - 10)}><Ionicons name="play-skip-back-outline" size={25} color={C.text} /></Pressable>
          <Pressable disabled={!sound} onPress={togglePlayback} style={reviewSt.playButton}>
            {!sound ? <ActivityIndicator color="#fff" /> : <Ionicons name={playing ? "pause" : "play"} size={25} color="#fff" />}
          </Pressable>
          <Pressable onPress={() => void seekToSeconds(position + 10)}><Ionicons name="play-skip-forward-outline" size={25} color={C.text} /></Pressable>
          <Pressable onPress={() => scrollToSegment(transcript.find((segment) => segment.id === activeSegmentId))}><Ionicons name="scan-outline" size={25} color={C.text} /></Pressable>
        </View>
      </View>
    </View>
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

function UploadProcessCard({
  sessionId,
  status,
  rubricId: initialRubricId,
  sessionTitle,
  onDone,
}: {
  sessionId: string;
  status: string;
  rubricId: string | null;
  sessionTitle?: string;
  onDone: () => void;
}) {
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
  const [assets, setAssets] = useState<Material[]>([]);
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const [rubrics, setRubrics] = useState<Rubric[]>([]);
  const [rubricsLoaded, setRubricsLoaded] = useState(false);
  const [rubricId, setRubricId] = useState<string | null>(initialRubricId);
  const [rubricOpen, setRubricOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    Promise.all([
      fetchRubrics(),
      fetchMaterials().catch(() => ({ materials: [] as Material[] })),
    ])
      .then(([{ rubrics: list }, materialData]) => {
        setRubrics(list);
        setAssets(materialData.materials.filter((material) => materialUrl(material)));
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

  function addRecordingAsset(asset: Material) {
    if (selectedAssetIds.includes(asset.id)) return;
    const snippet = assetNoteSnippet(asset);
    setDNotes((current) => (current.trim() ? `${current.trim()}\n\n${snippet}` : snippet));
    setSelectedAssetIds((current) => [...current, asset.id]);
    void Haptics.selectionAsync();
  }

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
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
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
      setSelectedAssetIds([]);
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
        <Modal visible={recordingOpen} animationType="slide" onRequestClose={() => {}}>
          <RecordingExperience
            title={dTitle || sessionTitle || "Tour conversation"}
            caption="Recording to this session"
            notes={dNotes}
            onNotesChange={setDNotes}
            assets={assets}
            selectedAssetIds={selectedAssetIds}
            onAddAsset={addRecordingAsset}
            cancelIcon="close"
            cancelDisabled={cancelling}
            onCancel={confirmCancelSession}
            onFinish={stopSessionRecording}
          />
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

      <CommunityPickerModal
        visible={communityPickerOpen}
        session={session}
        query={communityQuery}
        switchingId={switchingId}
        onQueryChange={setCommunityQuery}
        onClose={() => {
          if (!switchingId) {
            setCommunityPickerOpen(false);
            setCommunityQuery("");
          }
        }}
        onSelect={(communityId) => void chooseCommunity(communityId)}
      />
    </View>
  );
}

function CommunityPickerModal({
  visible,
  session,
  query,
  switchingId,
  onQueryChange,
  onClose,
  onSelect,
}: {
  visible: boolean;
  session: MobileAuthSession;
  query: string;
  switchingId: string | null;
  onQueryChange: (query: string) => void;
  onClose: () => void;
  onSelect: (communityId: string) => void;
}) {
  const filteredCommunities = useMemo(() => {
    const value = query.trim().toLowerCase();
    return value
      ? session.workspace.communities.filter((community) => community.name.toLowerCase().includes(value))
      : session.workspace.communities;
  }, [query, session.workspace.communities]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={st.sheetBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} disabled={Boolean(switchingId)} onPress={onClose} />
        <View style={[st.assetSheet, { minHeight: "70%" }]}>
          <View style={st.sheetHandle} />
          <View style={st.sheetHeader}>
            <View style={st.flex1}>
              <Text style={st.sheetTitle}>Switch community</Text>
              <Text style={st.sheetSubtitle}>Your dashboard, sessions, assets, and integrations will update.</Text>
            </View>
            <Pressable accessibilityLabel="Close communities" disabled={Boolean(switchingId)} onPress={onClose} style={st.iconButton}>
              <Ionicons name="close" size={20} color={C.text} />
            </Pressable>
          </View>
          <View style={st.searchBar}>
            <Ionicons name="search" size={18} color={C.textMuted} />
            <TextInput
              value={query}
              onChangeText={onQueryChange}
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
            ListEmptyComponent={<EmptyState icon="business-outline" title="No communities found" subtitle="Try a different search." />}
            renderItem={({ item }) => {
              const active = item.id === session.workspace.community.id;
              return (
                <Pressable disabled={Boolean(switchingId)} onPress={() => onSelect(item.id)} style={({ pressed }) => [st.communitySettingRow, st.rowBorder, pressed && st.pressed]}>
                  <View style={[st.communitySettingIcon, active && { backgroundColor: C.greenBg }]}>
                    <Ionicons name="business-outline" size={18} color={active ? C.green : C.brand} />
                  </View>
                  <View style={st.flex1}>
                    <Text style={st.communitySettingName} numberOfLines={1}>{item.name}</Text>
                    {item.alias && <Text style={st.cardRowSub} numberOfLines={1}>{item.alias}</Text>}
                  </View>
                  {switchingId === item.id
                    ? <ActivityIndicator size="small" color={C.brand} />
                    : active
                      ? <Ionicons name="checkmark-circle" size={20} color={C.green} />
                      : <Ionicons name="chevron-forward" size={17} color={C.textMuted} />}
                </Pressable>
              );
            }}
          />
        </View>
      </View>
    </Modal>
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

const homeSt = StyleSheet.create({
  topBar: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  propertyPicker: { maxWidth: 190, minHeight: 36, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, paddingHorizontal: 16, borderRadius: 8, backgroundColor: "#f0f0f5" },
  propertyPickerText: { flexShrink: 1, color: "#666", fontSize: 16, fontWeight: "700" },
  headerIcon: { width: 38, height: 38, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#e2e2e2", borderRadius: 8, backgroundColor: "#fff" },
  businessCard: { padding: 16, gap: 14, borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 20, backgroundColor: "#fff", shadowColor: "#101828", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.07, shadowRadius: 12, elevation: 2 },
  profileRow: { flexDirection: "row", alignItems: "center", gap: 11 },
  profileAvatar: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: C.brand },
  profileAvatarText: { color: "#fff", fontSize: 14, fontWeight: "900" },
  profileName: { color: "#000", fontSize: 14, fontWeight: "800" },
  profileRole: { color: C.textSec, fontSize: 11, marginTop: 3 },
  contactRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  contactText: { flex: 1, color: C.textSec, fontSize: 11 },
  smsButton: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: "#1674ff" },
  smsButtonText: { color: "#fff", fontSize: 10, fontWeight: "800" },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 7 },
  sectionTitle: { flex: 1, color: C.text, fontSize: 17, fontWeight: "900" },
  sectionAction: { color: C.brand, fontSize: 13, fontWeight: "800" },
  tourCard: { minHeight: 70, flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 12, borderWidth: 1, borderColor: C.border, borderRadius: 16, backgroundColor: "#fff" },
  tourTitle: { color: C.text, fontSize: 15, fontWeight: "800" },
  tourMetaRow: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 8 },
  timePill: { color: C.brand, fontSize: 11, fontWeight: "800", paddingHorizontal: 7, paddingVertical: 3, borderRadius: 4, backgroundColor: "rgba(0,108,229,0.07)" },
  tourMeta: { flex: 1, color: C.textSec, fontSize: 12 },
  statusPill: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 20 },
  statusText: { fontSize: 9, fontWeight: "900" },
  actionCard: { minHeight: 78, flexDirection: "row", alignItems: "center", gap: 14, padding: 14, borderWidth: 1, borderColor: "#e5e5e5", borderRadius: 12, backgroundColor: "#fff" },
  actionIcon: { width: 48, height: 48, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: "#fff" },
  qrBrandCenter: { position: "absolute", width: 18, height: 18, borderRadius: 5, alignItems: "center", justifyContent: "center", backgroundColor: "#fff" },
  actionTitle: { color: "#000", fontSize: 14, fontWeight: "900" },
  actionSub: { color: C.textSec, fontSize: 12, marginTop: 3 },
  mediaRow: { flexDirection: "row", gap: 10 },
  mediaTile: { width: "31.5%", aspectRatio: 1, justifyContent: "flex-end", gap: 6, padding: 10, borderRadius: 12, backgroundColor: "#eef4ff" },
  mediaLabel: { color: C.text, fontSize: 11, fontWeight: "700" },
  emptyInline: { color: C.textSec, fontSize: 12 },
  createButton: { minHeight: 50, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: "#1674ff" },
  createButtonText: { color: "#fff", fontSize: 14, fontWeight: "800" },
  insightCard: { minHeight: 105, flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderWidth: 1, borderLeftWidth: 4, borderColor: C.brand, borderRadius: 16, backgroundColor: "#fff" },
  insightText: { color: C.text, fontSize: 14, lineHeight: 20, fontWeight: "600" },
  insightLink: { color: C.brand, fontSize: 12, fontWeight: "800", marginTop: 10 },
});

const reviewSt = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f9fafb", paddingTop: Platform.OS === "ios" ? 50 : 18 },
  header: { minHeight: 54, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16 },
  headerButton: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 9, backgroundColor: "#fff" },
  propertyPicker: { maxWidth: 200, minHeight: 37, flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 16, borderRadius: 8, backgroundColor: "#f0f0f5" },
  propertyText: { flexShrink: 1, color: "#666", fontSize: 16, fontWeight: "700" },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 20, paddingVertical: 12 },
  title: { color: C.text, fontSize: 22, fontWeight: "900" },
  subtitle: { color: C.textSec, fontSize: 11, marginTop: 3 },
  actionCount: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 12, backgroundColor: "#eef2ff" },
  actionCountText: { color: "#4338ca", fontSize: 10, fontWeight: "800" },
  modeRow: { flexDirection: "row", gap: 8, paddingHorizontal: 20, paddingBottom: 10 },
  modeButton: { flex: 1, minHeight: 38, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 10, backgroundColor: "#fff" },
  modeButtonActive: { borderColor: "#bfdbfe", backgroundColor: "#eff6ff" },
  modeText: { color: C.textSec, fontSize: 11, fontWeight: "800" },
  modeTextActive: { color: C.brand },
  transcriptContent: { gap: 8, paddingHorizontal: 20, paddingTop: 4, paddingBottom: 330 },
  transcriptCard: { overflow: "hidden", borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 16, backgroundColor: "#fff", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.035, shadowRadius: 5 },
  transcriptCardActive: { borderLeftWidth: 4, borderLeftColor: "#2563eb" },
  transcriptMain: { flexDirection: "row", alignItems: "flex-start", gap: 11, padding: 12 },
  speakerAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  speakerAvatarText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  metaRow: { flexDirection: "row", alignItems: "baseline", gap: 8, marginBottom: 4 },
  speaker: { color: "#47546b", fontSize: 13, fontWeight: "700" },
  segmentTime: { color: "#a3adbd", fontSize: 11 },
  transcriptText: { color: "#4d5970", fontSize: 14, lineHeight: 21 },
  segmentActions: { width: 24, alignItems: "center", gap: 14, paddingTop: 2 },
  inlineComment: { flexDirection: "row", alignItems: "flex-start", gap: 7, marginHorizontal: 12, marginBottom: 10, padding: 9, borderRadius: 10, backgroundColor: "#fffbeb" },
  inlineCommentAuthor: { color: "#b45309", fontSize: 10, fontWeight: "900" },
  inlineCommentBody: { color: C.text, fontSize: 12, lineHeight: 17, marginTop: 2 },
  inlineComposer: { flexDirection: "row", alignItems: "center", gap: 8, padding: 10, borderTopWidth: 1, borderTopColor: "#eef2f7" },
  inlineInput: { flex: 1, minHeight: 38, paddingHorizontal: 11, borderWidth: 1, borderColor: "#d7dee8", borderRadius: 9, color: C.text, fontSize: 13 },
  inlineSend: { width: 38, height: 38, alignItems: "center", justifyContent: "center", borderRadius: 19, backgroundColor: C.brand },
  playerDock: { position: "absolute", left: 0, right: 0, bottom: 0, gap: 13, paddingHorizontal: 20, paddingTop: 18, paddingBottom: Platform.OS === "ios" ? 28 : 16, borderTopWidth: 1, borderTopColor: "#e5e7eb", backgroundColor: "rgba(255,255,255,0.98)" },
  quickControls: { flexDirection: "row", gap: 12 },
  quickButton: { flex: 1, height: 44, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 22 },
  momentRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  prevButton: { paddingHorizontal: 15, paddingVertical: 9, borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 8 },
  prevText: { color: C.text, fontSize: 12, fontWeight: "900" },
  momentLabel: { color: "#2563eb", fontSize: 12, fontWeight: "900" },
  nextButton: { paddingHorizontal: 15, paddingVertical: 10, borderRadius: 8, backgroundColor: "#2563eb", shadowColor: "#2563eb", shadowOffset: { width: 0, height: 7 }, shadowOpacity: 0.25, shadowRadius: 9 },
  nextText: { color: "#fff", fontSize: 12, fontWeight: "900" },
  waveformTrack: { height: 46, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 3 },
  waveformBar: { width: 3, borderRadius: 2, backgroundColor: "#3b82f6" },
  timeRow: { flexDirection: "row", justifyContent: "space-between", marginTop: -12 },
  time: { color: "#6b7280", fontSize: 10 },
  playbackRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  speed: { minWidth: 28, color: C.text, fontSize: 13, fontWeight: "900" },
  playButton: { width: 56, height: 56, alignItems: "center", justifyContent: "center", borderRadius: 28, backgroundColor: "#2563eb", shadowColor: "#2563eb", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.24, shadowRadius: 9 },
});

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
  callRecorder: { flex: 1, backgroundColor: "#fff", paddingHorizontal: 22, paddingTop: Platform.OS === "ios" ? 56 : 24, paddingBottom: Platform.OS === "ios" ? 30 : 20 },
  callTopBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  callTopButton: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: "#f2f2f7" },
  callTopSpacer: { width: 42 },
  callLiveBadge: { flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 100, backgroundColor: "rgba(0,122,255,0.08)" },
  callLiveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#007aff" },
  callLiveText: { color: "#007aff", fontSize: 10, fontWeight: "900" },
  callCenter: { flex: 1, alignItems: "center", justifyContent: "center", paddingBottom: 12 },
  callMicHalo: { width: 128, height: 128, borderRadius: 64, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(79,70,229,0.17)", marginBottom: 24 },
  callMicCore: { width: 88, height: 88, borderRadius: 44, alignItems: "center", justifyContent: "center", backgroundColor: "#4f46e5", shadowColor: "#4f46e5", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.38, shadowRadius: 24, elevation: 8 },
  callTitle: { color: "#636366", fontSize: 20, fontWeight: "800", textTransform: "uppercase" },
  callTimer: { color: "#111", fontSize: 36, fontWeight: "800", fontVariant: ["tabular-nums"], marginTop: 18, textAlign: "center" },
  waveform: { height: 54, flexDirection: "row", alignItems: "center", gap: 5, marginTop: 22 },
  waveBar: { width: 3, borderRadius: 2, backgroundColor: "#3b82f6" },
  callCaption: { color: "#98a2b3", fontSize: 12, fontWeight: "600", marginTop: 7 },
  callControls: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-around" },
  callAction: { width: 82, alignItems: "center", gap: 8 },
  callActionButton: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(25,23,23,0.06)" },
  callActionCount: { position: "absolute", top: -3, right: -2, minWidth: 20, height: 20, paddingHorizontal: 5, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: "#4f46e5", borderWidth: 2, borderColor: "#111318" },
  callActionCountText: { color: "#fff", fontSize: 10, fontWeight: "900" },
  callStopButton: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", backgroundColor: "#2563eb", shadowColor: "#2563eb", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.22, shadowRadius: 9 },
  callStopSquare: { width: 23, height: 23, borderRadius: 4, backgroundColor: "#fff" },
  callActionLabel: { color: C.text, fontSize: 10, fontWeight: "700" },
  recordingAssetGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 46 },
  recordingAssetCard: { width: "48.5%", minHeight: 112, justifyContent: "flex-end", gap: 5, padding: 12, borderRadius: 16, backgroundColor: "#f2f2f7", shadowColor: "#000", shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.06, shadowRadius: 8 },
  recordingAssetTitle: { color: C.text, fontSize: 13, fontWeight: "800" },
  recordingAssetSub: { color: "#636366", fontSize: 11, lineHeight: 15 },
  recordingAssetCheck: { position: "absolute", right: 9, top: 9 },
  recordingWaveRow: { flexDirection: "row", alignItems: "center", gap: 2 },
  finishRecording: { alignSelf: "center", marginTop: 10, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 20, backgroundColor: "#eef2ff" },
  finishRecordingText: { color: C.brand, fontSize: 12, fontWeight: "900" },
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

});
