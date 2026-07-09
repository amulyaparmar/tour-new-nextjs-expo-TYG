import { Ionicons } from "@expo/vector-icons";
import { Audio } from "expo-av";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import * as Haptics from "expo-haptics";
import { StatusBar } from "expo-status-bar";
import { useVideoPlayer, VideoView } from "expo-video";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppProviders } from "./src/components/app-providers";
import {
  ActivityIndicator,
  Alert,
  AppState,
  Dimensions,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Reanimated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeInUp,
  SlideInLeft,
  SlideInRight,
  SlideOutLeft,
  SlideOutRight,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import {
  type AnalysisResult,
  type ConversationPhaseSegmentation,
  type FollowUpAction,
  type Rubric,
  type SessionSummary,
  type AudioInsights,
  type AudioInsightsStatus,
  rubricItemCount,
  rubricTotalPoints,
} from "@tour/shared";
import {
  findPhaseForTimestamp,
  processingStatusMessage,
  shortPhaseLabel,
  tourSegmentColor,
} from "./src/conversationPhases";
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
  fetchAudioInsights,
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
  submitCheckInLead,
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
import { TourLogo, TourMark } from "./src/components/TourLogo";
import { LiveActivityBanner, RecordingExperience, RecordingProvider, useRecording } from "./src/recording";
import { MotionBlock, MotionPressable, AnimatedTabContent } from "./src/components/ui/motion";
import {
  RubricTab,
  ScoreHero,
  SectionScoreOverview,
  SessionAiChatScreen,
  SessionAudioInsightsScreen,
  SessionInsightCards,
  SessionModeTabs,
  SessionPlayer,
  SessionReviewSkeleton,
  SessionSummaryStrip,
  TourScreenHeader,
  SESSION_PAGE_PADDING,
  type SessionReviewMode,
} from "./src/components/session";
import { tourColors as C, tourColors, scoreColor } from "./src/theme/tour-brand";
import { selectionHaptic, impactHaptic } from "./src/lib/haptics";
import {
  TourBackButton as BackBtn,
  TourEmptyState as EmptyState,
  TourInput as Input,
  TourLoadingBox as LoadingBox,
  TourPrimaryButton as PrimaryBtn,
  TourSegPicker as SegPicker,
  TourStatusBadge,
} from "./src/components/tour";
import { CommunityPickerModal } from "@/components/community-picker-modal";
import { BottomSheetModal } from "@/components/bottom-sheet-modal";
import { Card, CardContent } from "@/components/ui/card";
import { Text as UiText } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { Clock3, ListTodo, Mic } from "lucide-react-native";

const loginBackground = require("./assets/videos/login-bg.mp4");

type ProspectData = { name: string; email: string; phone: string; moveIn: string; bedrooms: string; budget: string };
type MainTab = "home" | "sessions" | "calendar" | "materials" | "settings";
type Screen =
  | { type: "main"; tab: MainTab }
  | { type: "session-detail"; sessionId: string }
  | { type: "session-ai-chat"; sessionId: string; sessionTitle?: string; prospectName?: string }
  | { type: "session-audio-insights"; sessionId: string; sessionTitle?: string; initialStatus?: AudioInsightsStatus; initialInsights?: AudioInsights | null }
  | { type: "create-session" }
  | { type: "rubrics" }
  | { type: "profile" }
  | { type: "tour" };

type TourStep = "contact" | "preferences" | "ready";
type SlideDirection = "forward" | "back";

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
  segmenting: { bg: C.amberBg, text: C.amber },
  analyzing: { bg: C.amberBg, text: C.amber },
  analysis_ready: { bg: C.greenBg, text: C.green },
  reviewed: { bg: C.greenBg, text: C.green },
  failed: { bg: C.redBg, text: C.red },
};

const STATUS_LABELS: Record<string, string> = {
  scheduled: "Scheduled",
  in_progress: "In progress",
  uploaded: "Uploaded",
  transcribing: "Processing",
  segmenting: "Processing",
  analyzing: "Analyzing",
  analysis_ready: "Analyzed",
  reviewed: "Reviewed",
  failed: "Failed",
};

const PROCESSING_STATUSES = new Set(["transcribing", "segmenting", "analyzing"]);
const SESSION_PROCESS_STEPS = [
  { id: "uploaded", label: "Uploaded", icon: "cloud-done-outline" },
  { id: "transcribing", label: "Transcript", icon: "mic-outline" },
  { id: "segmenting", label: "Segments", icon: "git-branch-outline" },
  { id: "analyzing", label: "Analysis", icon: "sparkles-outline" },
] as const;

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

function parseMomentTime(value: string): number | null {
  const parts = value.split(":").map((part) => Number(part.trim()));
  if (parts.some((part) => !Number.isFinite(part))) return null;
  if (parts.length === 2) return parts[0]! * 60 + parts[1]!;
  if (parts.length === 3) return parts[0]! * 3600 + parts[1]! * 60 + parts[2]!;
  return null;
}

function PulseDot({ color = C.red }: { color?: string }) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  useEffect(() => {
    scale.value = withRepeat(withSequence(
      withTiming(1.45, { duration: 850, easing: Easing.out(Easing.quad) }),
      withTiming(1, { duration: 850, easing: Easing.in(Easing.quad) })
    ), -1, false);
    opacity.value = withRepeat(withSequence(
      withTiming(0.45, { duration: 850 }),
      withTiming(1, { duration: 850 })
    ), -1, false);
  }, [opacity, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return <Reanimated.View style={[st.pulseDot, { backgroundColor: color }, animatedStyle]} />;
}

function LoadingShimmer({ rows = 3 }: { rows?: number }) {
  const shimmer = useSharedValue(0.35);
  useEffect(() => {
    shimmer.value = withRepeat(withSequence(
      withTiming(1, { duration: 760 }),
      withTiming(0.35, { duration: 760 })
    ), -1, true);
  }, [shimmer]);
  const animatedStyle = useAnimatedStyle(() => ({ opacity: shimmer.value }));

  return (
    <View style={{ gap: 10 }}>
      {Array.from({ length: rows }).map((_, index) => (
        <Reanimated.View key={index} style={[st.shimmerCard, animatedStyle]}>
          <View style={[st.shimmerBar, { width: index % 2 === 0 ? "68%" : "52%" }]} />
          <View style={[st.shimmerBar, { width: index % 2 === 0 ? "44%" : "72%", height: 8 }]} />
        </Reanimated.View>
      ))}
    </View>
  );
}

function AnimatedProgressFill({ percent, color = C.brand }: { percent: number; color?: string }) {
  const progress = useSharedValue(percent);

  useEffect(() => {
    progress.value = withTiming(Math.max(0, Math.min(100, percent)), { duration: 260, easing: Easing.out(Easing.cubic) });
  }, [percent, progress]);

  const animatedStyle = useAnimatedStyle(() => ({
    width: `${progress.value}%`,
  }));

  return <Reanimated.View style={[st.progressFill, { backgroundColor: color }, animatedStyle]} />;
}

function screenKey(screen: Screen) {
  if (screen.type === "main") return `main:${screen.tab}`;
  if (screen.type === "session-detail") return `session:${screen.sessionId}`;
  if (screen.type === "session-ai-chat") return `session-ai:${screen.sessionId}`;
  if (screen.type === "session-audio-insights") return `session-audio:${screen.sessionId}`;
  return screen.type;
}

function screenRank(screen: Screen) {
  if (screen.type === "main") {
    const index = TAB_ITEMS.findIndex((tab) => tab.id === screen.tab);
    return Math.max(0, index);
  }
  if (screen.type === "profile") return 10;
  if (screen.type === "tour") return 11;
  if (screen.type === "create-session") return 12;
  if (screen.type === "rubrics") return 12;
  if (screen.type === "session-detail") return 13;
  if (screen.type === "session-ai-chat") return 14;
  if (screen.type === "session-audio-insights") return 14;
  return 0;
}

function ScreenTransition({
  children,
  transitionKey,
  direction,
}: {
  children: React.ReactNode;
  transitionKey: string;
  direction: SlideDirection;
}) {
  const entering = direction === "forward"
    ? SlideInRight.duration(260).easing(Easing.out(Easing.cubic))
    : SlideInLeft.duration(260).easing(Easing.out(Easing.cubic));
  const exiting = direction === "forward"
    ? SlideOutLeft.duration(180).easing(Easing.in(Easing.cubic))
    : SlideOutRight.duration(180).easing(Easing.in(Easing.cubic));

  return (
    <Reanimated.View
      key={transitionKey}
      entering={entering}
      exiting={exiting}
      style={st.screenTransition}
    >
      {children}
    </Reanimated.View>
  );
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
  const [transitionDirection, setTransitionDirection] = useState<SlideDirection>("forward");

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
  const routeKey = screen.type === "main" ? "main" : screenKey(screen);
  const nav = useCallback((next: Screen) => {
    setTransitionDirection(screenRank(next) >= screenRank(screen) ? "forward" : "back");
    setScreen(next);
  }, [screen]);

  if (authLoading) {
    return (
      <AppProviders>
        <View style={[st.root, st.center]}>
          <StatusBar style="dark" />
          <ActivityIndicator color={C.brand} size="large" />
        </View>
      </AppProviders>
    );
  }

  if (!authSession) {
    return (
      <AppProviders>
        <StatusBar style="light" />
        <LoginScreen player={player} onAuthenticated={setAuthSession} />
      </AppProviders>
    );
  }

  const agentName =
    authSession.workspace.user.fullName ??
    authSession.workspace.user.email.split("@")[0] ??
    "Team member";
  const property = authSession.workspace.community.name;

  return (
    <AppProviders>
    <View style={st.root}>
      <StatusBar style="dark" />
      <RecordingProvider onNotify={showToast}>
        <ToastProvider>
          <LiveActivityBanner />
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={st.flex1}>
            <ScreenTransition transitionKey={routeKey} direction={transitionDirection}>
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
              {screen.type === "session-detail" && (
                <SessionDetailScreen
                  sessionId={screen.sessionId}
                  onBack={() => nav({ type: "main", tab: "sessions" })}
                  onOpenAiChat={(meta) => nav({ type: "session-ai-chat", ...meta })}
                  onOpenAudioInsights={(meta) => nav({ type: "session-audio-insights", ...meta })}
                />
              )}
              {screen.type === "session-ai-chat" && (
                <SessionAiChatScreen
                  sessionId={screen.sessionId}
                  sessionTitle={screen.sessionTitle}
                  prospectName={screen.prospectName}
                  onBack={() => nav({ type: "session-detail", sessionId: screen.sessionId })}
                />
              )}
              {screen.type === "session-audio-insights" && (
                <SessionAudioInsightsScreen
                  sessionId={screen.sessionId}
                  sessionTitle={screen.sessionTitle}
                  initialStatus={screen.initialStatus}
                  initialInsights={screen.initialInsights ?? null}
                  onBack={() => nav({ type: "session-detail", sessionId: screen.sessionId })}
                />
              )}
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
            </ScreenTransition>
          </KeyboardAvoidingView>
        </ToastProvider>
      </RecordingProvider>
    </View>
    </AppProviders>
  );
}

function CommunityTopBar({
  left,
  right,
  property,
  onCommunityPress,
}: {
  left: React.ReactNode;
  right: React.ReactNode;
  property: string;
  onCommunityPress: () => void;
}) {
  return (
    <View style={homeSt.topBar}>
      <View style={homeSt.topBarSide}>{left}</View>
      <View style={homeSt.topBarCenter}>
        <Pressable
          accessibilityLabel="Switch community"
          onPress={onCommunityPress}
          style={({ pressed }) => [homeSt.propertyPicker, pressed && st.pressed]}
        >
          <Text style={homeSt.propertyPickerText} numberOfLines={1}>{property}</Text>
          <Ionicons name="chevron-down" size={15} color={C.textSec} />
        </Pressable>
      </View>
      <View style={[homeSt.topBarSide, homeSt.topBarSideEnd]}>{right}</View>
    </View>
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
  const [tabTransitionDirection, setTabTransitionDirection] = useState<SlideDirection>("forward");
  const [checkInOpen, setCheckInOpen] = useState(false);

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
  const handleTabPress = useCallback((nextTab: MainTab) => {
    const currentIndex = TAB_ITEMS.findIndex((item) => item.id === tab);
    const nextIndex = TAB_ITEMS.findIndex((item) => item.id === nextTab);
    setTabTransitionDirection(nextIndex >= currentIndex ? "forward" : "back");
    onTab(nextTab);
  }, [onTab, tab]);

  return (
    <View style={st.flex1}>
      {showScrollView && (
        <ScreenTransition transitionKey={`tab:${tab}`} direction={tabTransitionDirection}>
          <ScrollView contentInsetAdjustmentBehavior="automatic" showsVerticalScrollIndicator={false} contentContainerStyle={st.mainScroll} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.brand} />}>
            {error && <ErrorBanner message={error} onRetry={load} />}
            {tab === "home" && <DashboardScreen sessions={sessions} upcomingSessions={upcomingSessions} materials={materials} loading={loading} onSession={onSession} onProfile={onProfile} onCheckIn={() => setCheckInOpen(true)} onAssets={() => handleTabPress("materials")} onCommunityPress={() => setCommunityPickerOpen(true)} agentName={agentName} userEmail={authSession.workspace.user.email} property={property} />}
            {tab === "calendar" && <CalendarScreen sessions={sessions} upcomingSessions={upcomingSessions} entrataEvents={calendarEvents} onSession={onSession} onReload={load} onCommunityPress={() => setCommunityPickerOpen(true)} property={property} />}
            {tab === "materials" && <MaterialsScreen materials={materials} loading={loading} onCreate={onCreate} onReload={load} onBack={() => handleTabPress("home")} onCommunityPress={() => setCommunityPickerOpen(true)} property={property} />}
            {tab === "settings" && <SettingsScreen session={authSession} onSessionChange={onAuthSession} onRubrics={onRubrics} onSignOut={onSignOut} />}
          </ScrollView>
        </ScreenTransition>
      )}

      {tab === "sessions" && (
        <ScreenTransition transitionKey="tab:sessions" direction={tabTransitionDirection}>
          <SessionsListScreen onBack={() => handleTabPress("home")} onCommunityPress={() => setCommunityPickerOpen(true)} onSession={onSession} property={property} />
        </ScreenTransition>
      )}

      <View style={st.tabBar}>
        {TAB_ITEMS.map((t) => (
          <Pressable key={t.id} onPress={() => { selectionHaptic(); handleTabPress(t.id); }} style={st.tabBarItem}>
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
      <CheckInSheet visible={checkInOpen} onClose={() => setCheckInOpen(false)} property={property} />
    </View>
  );
}

// ═══════════════════════════════════════
// Error Banner
// ═══════════════════════════════════════

function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Card style={errorBannerSt.card}>
      <CardContent style={errorBannerSt.content}>
        <Ionicons name="cloud-offline-outline" size={18} color={C.red} />
        <UiText style={errorBannerSt.text} numberOfLines={2}>{message}</UiText>
        {onRetry ? (
          <Button variant="ghost" size="icon" onPress={onRetry} style={errorBannerSt.retry}>
            <Ionicons name="refresh" size={16} color={C.brand} />
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

const errorBannerSt = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderColor: "rgba(239,68,68,0.2)",
    backgroundColor: "rgba(239,68,68,0.05)",
    paddingVertical: 12,
  },
  content: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingVertical: 0 },
  text: { flex: 1, fontSize: 14, fontWeight: "600", color: "#ef4444" },
  retry: { width: 36, height: 36 },
});

// ═══════════════════════════════════════
// Dashboard
// ═══════════════════════════════════════

function DashboardScreen({ sessions, upcomingSessions, materials, loading, onSession, onProfile, onCheckIn, onAssets, onCommunityPress, agentName, userEmail, property }: {
  sessions: SessionSummary[];
  upcomingSessions: SessionSummary[];
  materials: Material[];
  loading: boolean;
  onSession: (id: string) => void;
  onProfile: () => void;
  onCheckIn: () => void;
  onAssets: () => void;
  onCommunityPress: () => void;
  agentName: string;
  userEmail: string;
  property: string;
}) {
  const [selectedMaterial, setSelectedMaterial] = useState<Material | null>(null);
  const todayTours = useMemo(() => {
    const todayKey = new Date().toDateString();
    return upcomingSessions
      .filter((session) =>
        session.status === "in_progress" ||
        (session.scheduledAt && new Date(session.scheduledAt).toDateString() === todayKey)
      )
      .slice(0, 2);
  }, [upcomingSessions]);
  const initials = agentName.split(" ").map((name) => name[0]).join("").slice(0, 2).toUpperCase();

  return (
    <View style={[st.page, { gap: 18 }]}>
      <CommunityTopBar
        property={property}
        onCommunityPress={onCommunityPress}
        left={<Pressable accessibilityLabel="Open profile" onPress={onProfile}><TourLogo width={62} /></Pressable>}
        right={
          <Pressable accessibilityLabel="Notifications" style={homeSt.headerIcon}>
            <Ionicons name="notifications-outline" size={20} color={C.text} />
          </Pressable>
        }
      />

      <MotionBlock delay={40} style={homeSt.profileCard}>
        <View style={homeSt.profileHeader} />
        <View style={homeSt.profileBody}>
          <View style={homeSt.profileAvatarLarge}>
            <Text style={homeSt.profileAvatarLargeText}>{initials}</Text>
          </View>
          <Text style={homeSt.profileNameLarge}>{agentName}</Text>
          <Text style={homeSt.profileRoleLarge}>Leasing Consultant</Text>
          <Text style={homeSt.profileProperty}>{property}</Text>

          <View style={homeSt.contactList}>
            <ProfileContact icon="mail" text={userEmail || "team@tour.video"} />
            <ProfileContact icon="call" text="(586) 258-8588" />
            <ProfileContact icon="sparkles" text="Favorite feature: rooftop views and resident events" />
          </View>
        </View>
      </MotionBlock>

      <MotionPressable onPress={onCheckIn} haptic="medium" entering={FadeInDown.delay(90)} style={homeSt.checkInPill}>
        <Ionicons name="navigate" size={22} color="#fff" />
        <Text style={homeSt.checkInPillText}>Check-In</Text>
      </MotionPressable>

      {todayTours.length > 0 && (
        <HomeSection title="Ready Today">
          <View style={homeSt.focusStack}>
            {todayTours.map((session) => (
              <MotionPressable key={session.id} onPress={() => onSession(session.id)} haptic="selection" style={homeSt.tourCard}>
                <View style={st.flex1}>
                  <Text style={homeSt.tourTitle} numberOfLines={1}>{session.title}</Text>
                  <View style={homeSt.tourMetaRow}>
                    <Text style={homeSt.timePill}>{session.status === "in_progress" ? "Now" : session.scheduledAt ? fmtTime(session.scheduledAt) : "Today"}</Text>
                    <Text style={homeSt.tourMeta} numberOfLines={1}>{session.prospectName ?? "Guest ready for tour"}</Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={18} color={C.textMuted} />
              </MotionPressable>
            ))}
          </View>
        </HomeSection>
      )}

      <HomeSection title="Library" showLogo action={materials.length ? "See All" : undefined} onAction={materials.length ? onAssets : undefined}>
        <View style={homeSt.mediaRow}>
          {materials.slice(0, 3).map((material) => {
            const previewUrl = materialPreviewUrl(material);
            const canOpen = Boolean(materialUrl(material));
            return (
              <View key={material.id} style={homeSt.mediaTileWrap}>
              <Pressable onPress={() => setSelectedMaterial(material)} style={({ pressed }) => [homeSt.mediaTile, pressed && st.pressed]}>
                <View style={homeSt.mediaThumb}>
                  {previewUrl ? (
                    <Image source={{ uri: previewUrl }} style={homeSt.mediaPreviewImage} resizeMode="cover" />
                  ) : (
                    <View style={homeSt.mediaFallbackIcon}>
                      <Ionicons name={canOpen ? "play" : "document-outline"} size={canOpen ? 18 : 23} color={C.brand} />
                    </View>
                  )}
                  {canOpen && (
                    <View style={homeSt.mediaPlayBadge}>
                      <Ionicons name="play" size={11} color="#fff" />
                    </View>
                  )}
                </View>
                <Text style={homeSt.mediaLabel} numberOfLines={2}>{material.name}</Text>
              </Pressable>
              </View>
            );
          })}
          {materials.length === 0 && <Text style={homeSt.emptyInline}>Reusable tour assets will appear here.</Text>}
        </View>
      </HomeSection>
      <MaterialPreviewModal material={selectedMaterial} onClose={() => setSelectedMaterial(null)} />
    </View>
  );
}

function materialPreviewUrl(material: Material) {
  return material.media?.imageUrl ?? material.media?.gifUrl ?? null;
}

async function openMaterial(material: Material) {
  const url = materialUrl(material);
  if (!url) return;
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert("Couldn't open media", "The video link is unavailable right now.");
  }
}

function ProfileContact({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={homeSt.profileContactRow}>
      <View style={homeSt.profileContactIcon}>
        <Ionicons name={icon} size={15} color="#111827" />
      </View>
      <Text style={homeSt.profileContactText} numberOfLines={1}>{text}</Text>
    </View>
  );
}

type MobileCheckInQuestion = {
  id: string;
  label: string;
  type: "select" | "text";
  options?: string[];
  placeholder?: string;
  required?: boolean;
};

const CHECK_IN_REP = { slug: "alex", name: "Alex Johnson", firstName: "Alex" };
const CHECK_IN_PROPERTY = "27 North";
const CHECK_IN_URL = "https://tour.you/p/alex?check-in=true";
const CHECK_IN_QR_URL = `https://api.qrserver.com/v1/create-qr-code/?size=420x420&margin=12&format=png&data=${encodeURIComponent(CHECK_IN_URL)}`;
const CHECK_IN_SHEET_HEIGHT = Math.round(Dimensions.get("window").height * 0.86);
const CHECK_IN_QUESTIONS: MobileCheckInQuestion[] = [
  {
    id: "hear_about",
    label: "Where did you hear about us?",
    type: "select",
    options: ["Google", "Apartments.com", "Drive by", "Referral", "Social media", "Other"],
    placeholder: "Select one",
  },
  {
    id: "move_in",
    label: "When are you looking to move in?",
    type: "select",
    options: ["ASAP", "Within 1 month", "1-3 months", "3-6 months", "Just browsing"],
    placeholder: "Select a timeframe",
  },
  {
    id: "floor_plan",
    label: "Which floor plan interests you most?",
    type: "select",
    options: ["Studio", "1 bedroom", "2 bedroom", "3 bedroom", "Not sure yet"],
    placeholder: "Select a floor plan",
  },
];

function formatCheckInPhone(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)} ${digits.slice(3)}`;
  return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
}

function normalizeCountryCode(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 4);
  return `+${digits || "1"}`;
}

function validCheckInEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function CheckInSheet({ visible, onClose, property }: { visible: boolean; onClose: () => void; property: string }) {
  const propertyLabel = property || CHECK_IN_PROPERTY;
  const [mode, setMode] = useState<"checkin" | "qr">("checkin");
  const [step, setStep] = useState<"contact" | "questions" | "done">("contact");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [countryCode, setCountryCode] = useState("+1");
  const [reason, setReason] = useState(`Tour ${propertyLabel}`);
  const [jobTitle, setJobTitle] = useState("");
  const [showJobTitle, setShowJobTitle] = useState(false);
  const [wantsSummary, setWantsSummary] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [highlightedField, setHighlightedField] = useState<"firstName" | "email" | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const checkInScrollRef = useRef<ScrollView>(null);
  const contactFieldOffsets = useRef<Record<string, number>>({});
  const firstNameRef = useRef<TextInput>(null);
  const lastNameRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);
  const phoneRef = useRef<TextInput>(null);
  const reasonRef = useRef<TextInput>(null);
  const jobTitleRef = useRef<TextInput>(null);
  const closeSheet = useCallback(() => {
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!visible) return;
    setMode("checkin");
    setStep("contact");
    setHighlightedField(null);
    setReason(`Tour ${propertyLabel}`);
    setError(null);
  }, [propertyLabel, visible]);

  async function submitLead() {
    setSubmitting(true);
    setError(null);
    try {
      const phoneDigits = phone.replace(/\D/g, "");
      await submitCheckInLead({
        firstName: firstName.trim(),
        lastName: lastName.trim() || null,
        email: email.trim(),
        phone: phoneDigits ? `${normalizeCountryCode(countryCode)}${phoneDigits}` : null,
        wantsSummary,
        jobTitle: showJobTitle ? jobTitle.trim() || null : null,
        reason: reason.trim() || null,
        questionAnswers: answers,
        repSlug: CHECK_IN_REP.slug,
        propertyName: propertyLabel,
      });
      setStep("done");
      showToast("Guest checked in", "success");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function nextFromContact() {
    setError(null);
    if (!firstName.trim()) {
      scrollToContactField("firstName");
      setError("First name is required.");
      return;
    }
    if (!email.trim()) {
      scrollToContactField("email");
      setError("Email is required.");
      return;
    }
    if (!validCheckInEmail(email)) {
      scrollToContactField("email");
      setError("Enter a valid email.");
      return;
    }
    setHighlightedField(null);
    if (CHECK_IN_QUESTIONS.length) {
      setStep("questions");
      return;
    }
    void submitLead();
  }

  function scrollToContactField(field: "firstName" | "email") {
    setHighlightedField(field);
    const y = contactFieldOffsets.current[field] ?? 0;
    requestAnimationFrame(() => {
      checkInScrollRef.current?.scrollTo({ y: Math.max(0, y - 14), animated: true });
    });
  }

  function goBackFromQuestions() {
    setError(null);
    setStep("contact");
  }

  function nextFromQuestion() {
    setError(null);
    void submitLead();
  }

  function focusNextInput(ref: React.RefObject<TextInput | null>) {
    requestAnimationFrame(() => ref.current?.focus());
  }

  function submitReasonField() {
    if (showJobTitle) {
      focusNextInput(jobTitleRef);
      return;
    }
    nextFromContact();
  }

  async function shareCheckInLink() {
    await Share.share({ title: "Tour check-in", message: checkInShareText(), url: CHECK_IN_URL });
  }

  function checkInShareText() {
    return `Check in for your tour at ${propertyLabel}: ${CHECK_IN_URL}`;
  }

  async function sendCheckInSms() {
    const body = encodeURIComponent(checkInShareText());
    const separator = Platform.OS === "ios" ? "&" : "?";
    await Linking.openURL(`sms:${separator}body=${body}`);
  }

  async function sendCheckInWhatsApp() {
    const text = encodeURIComponent(checkInShareText());
    try {
      await Linking.openURL(`whatsapp://send?text=${text}`);
    } catch {
      await Linking.openURL(`https://wa.me/?text=${text}`);
    }
  }

  return (
    <BottomSheetModal
      visible={visible}
      onClose={closeSheet}
      sheetHeight={CHECK_IN_SHEET_HEIGHT}
      keyboardAvoiding
      contentStyle={homeSt.checkInSheetBody}
    >
          <View style={homeSt.sheetTabs}>
            <Pressable onPress={() => setMode("checkin")} style={[homeSt.sheetTab, mode === "checkin" && homeSt.sheetTabActive]}>
              <Ionicons name="send-outline" size={16} color={mode === "checkin" ? C.brand : C.textMuted} />
              <Text style={[homeSt.sheetTabText, mode === "checkin" && homeSt.sheetTabTextActive]}>Check in</Text>
            </Pressable>
            <Pressable onPress={() => setMode("qr")} style={[homeSt.sheetTab, mode === "qr" && homeSt.sheetTabActive]}>
              <BrandedQrIcon size={17} />
              <Text style={[homeSt.sheetTabText, mode === "qr" && homeSt.sheetTabTextActive]}>QR</Text>
            </Pressable>
          </View>

          {mode === "qr" ? (
            <View style={homeSt.qrPanel}>
              <View style={homeSt.qrCard}>
                <Image source={{ uri: CHECK_IN_QR_URL }} style={homeSt.qrImage} resizeMode="contain" />
              </View>
              <Text style={homeSt.qrTitle}>Scan to check in</Text>
              <Text style={homeSt.qrSub}>{CHECK_IN_URL}</Text>
              <View style={homeSt.qrShareGrid}>
                <Pressable onPress={() => void sendCheckInSms()} style={({ pressed }) => [homeSt.qrShareButton, homeSt.qrShareButtonPrimary, pressed && st.pressed]}>
                  <Ionicons name="chatbubble-outline" size={17} color="#fff" />
                  <Text style={homeSt.qrShareButtonPrimaryText}>SMS</Text>
                </Pressable>
                <Pressable onPress={() => void sendCheckInWhatsApp()} style={({ pressed }) => [homeSt.qrShareButton, pressed && st.pressed]}>
                  <Ionicons name="logo-whatsapp" size={17} color="#16a34a" />
                  <Text style={homeSt.qrShareButtonText}>WhatsApp</Text>
                </Pressable>
                <Pressable onPress={() => void shareCheckInLink()} style={({ pressed }) => [homeSt.qrShareButton, pressed && st.pressed]}>
                  <Ionicons name="share-social-outline" size={17} color={C.text} />
                  <Text style={homeSt.qrShareButtonText}>Share</Text>
                </Pressable>
              </View>
            </View>
          ) : step === "done" ? (
            <View style={homeSt.donePanel}>
              <View style={homeSt.doneIcon}><Ionicons name="checkmark" size={34} color="#fff" /></View>
              <Text style={homeSt.qrTitle}>You're checked in</Text>
              <Text style={homeSt.qrSub}>Thanks for visiting {propertyLabel}. {CHECK_IN_REP.firstName} has the guest details and can start the tour.</Text>
              <Pressable onPress={closeSheet} style={({ pressed }) => [homeSt.sheetPrimary, pressed && st.pressed]}>
                <Text style={homeSt.sheetPrimaryText}>Done</Text>
              </Pressable>
            </View>
          ) : step === "questions" ? (
            <ScrollView
              ref={checkInScrollRef}
              style={homeSt.checkInScroll}
              contentContainerStyle={homeSt.checkInForm}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <View style={homeSt.stepHeader}>
                <Text style={homeSt.stepKicker}>Optional details</Text>
                <Text style={homeSt.questionTitle}>{firstName ? `${firstName}, ` : ""}a few quick questions</Text>
              </View>
              {CHECK_IN_QUESTIONS.map((question) => (
                <CheckInQuestionField
                  key={question.id}
                  question={question}
                  value={answers[question.id] ?? ""}
                  onChange={(value) => setAnswers((current) => ({ ...current, [question.id]: value }))}
                />
              ))}
              <Pressable onPress={() => setWantsSummary((value) => !value)} style={homeSt.toggleRow}>
                <Text style={homeSt.toggleText}>Send me follow-up notes after the tour</Text>
                <Ionicons name={wantsSummary ? "checkbox" : "square-outline"} size={21} color={wantsSummary ? C.brand : C.textMuted} />
              </Pressable>
              {error && <Text style={homeSt.fieldError}>{error}</Text>}
            </ScrollView>
          ) : (
            <ScrollView
              ref={checkInScrollRef}
              style={homeSt.checkInScroll}
              contentContainerStyle={homeSt.checkInForm}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <View style={homeSt.checkInHead}>
                <View style={homeSt.formHeadAvatar}><Ionicons name="person-outline" size={23} color="#fff" /></View>
                <Text style={homeSt.formHeadText}>Check in for your tour{"\n"}with {CHECK_IN_REP.firstName}</Text>
              </View>
              <View style={homeSt.formRow2}>
                <CheckInField
                  label="First name"
                  value={firstName}
                  onChangeText={(value) => {
                    setFirstName(value);
                    if (highlightedField === "firstName") setHighlightedField(null);
                  }}
                  autoComplete="given-name"
                  autoFocus
                  inputRef={firstNameRef}
                  returnKeyType="next"
                  blurOnSubmit={false}
                  onSubmitEditing={() => focusNextInput(lastNameRef)}
                  highlighted={highlightedField === "firstName"}
                  onLayoutY={(y) => { contactFieldOffsets.current.firstName = y; }}
                />
                <CheckInField
                  label="Last name"
                  value={lastName}
                  onChangeText={setLastName}
                  autoComplete="family-name"
                  inputRef={lastNameRef}
                  returnKeyType="next"
                  blurOnSubmit={false}
                  onSubmitEditing={() => focusNextInput(emailRef)}
                />
              </View>
              <CheckInField
                label="Email"
                value={email}
                onChangeText={(value) => {
                  setEmail(value);
                  if (error) setError(null);
                  if (highlightedField === "email") setHighlightedField(null);
                }}
                keyboardType="email-address"
                autoComplete="email"
                inputRef={emailRef}
                returnKeyType="next"
                blurOnSubmit={false}
                onSubmitEditing={() => focusNextInput(phoneRef)}
                highlighted={highlightedField === "email"}
                onLayoutY={(y) => { contactFieldOffsets.current.email = y; }}
              />
              <View style={homeSt.phoneRow}>
                <View style={homeSt.phoneCc}>
                  <Text style={homeSt.phoneFlag}>🇺🇸</Text>
                  <TextInput
                    value={countryCode}
                    onChangeText={setCountryCode}
                    keyboardType="phone-pad"
                    autoComplete="tel-country-code"
                    returnKeyType="next"
                    blurOnSubmit={false}
                    onSubmitEditing={() => focusNextInput(phoneRef)}
                    placeholder="+1"
                    placeholderTextColor="#6b7280"
                    style={homeSt.phoneCcInput}
                  />
                </View>
                <View style={st.flex1}>
                  <CheckInField
                    label="Phone number"
                    value={phone}
                    onChangeText={(value) => setPhone(formatCheckInPhone(value))}
                    keyboardType="phone-pad"
                    autoComplete="tel"
                    inputRef={phoneRef}
                    returnKeyType="next"
                    blurOnSubmit={false}
                    onSubmitEditing={() => focusNextInput(reasonRef)}
                  />
                </View>
              </View>
              <CheckInField
                label="Reason for visit (optional)"
                value={reason}
                onChangeText={setReason}
                inputRef={reasonRef}
                returnKeyType={showJobTitle ? "next" : "done"}
                blurOnSubmit={!showJobTitle}
                onSubmitEditing={submitReasonField}
              />
              {showJobTitle ? (
                <CheckInField
                  label="Job title"
                  value={jobTitle}
                  onChangeText={setJobTitle}
                  autoComplete="organization-title"
                  inputRef={jobTitleRef}
                  returnKeyType="done"
                  onSubmitEditing={nextFromContact}
                />
              ) : (
                <Pressable onPress={() => { setShowJobTitle(true); setTimeout(() => jobTitleRef.current?.focus(), 0); }} style={({ pressed }) => [homeSt.addJobButton, pressed && st.pressed]}>
                  <Ionicons name="briefcase-outline" size={15} color="#111827" />
                  <Text style={homeSt.addJobText}>Job title</Text>
                </Pressable>
              )}
              {error && <Text style={homeSt.fieldError}>{error}</Text>}
            </ScrollView>
          )}

          {mode === "checkin" && step !== "done" ? (
            <View style={homeSt.floatingActionWrap}>
              {step === "questions" ? (
                <Pressable onPress={goBackFromQuestions} style={({ pressed }) => [homeSt.floatingBackButton, pressed && st.pressed]}>
                  <Ionicons name="chevron-back" size={18} color={C.text} />
                </Pressable>
              ) : null}
              <Pressable
                onPress={step === "questions" ? nextFromQuestion : nextFromContact}
                disabled={submitting}
                style={({ pressed }) => [homeSt.floatingNextButton, submitting && { opacity: 0.64 }, pressed && st.pressed]}
              >
                {submitting ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name={step === "questions" ? "send-outline" : "arrow-forward"} size={18} color="#fff" />}
                <Text style={homeSt.nextButtonText}>{submitting ? "Checking in..." : step === "questions" ? "Check in" : "Next"}</Text>
              </Pressable>
            </View>
          ) : null}
    </BottomSheetModal>
  );
}

function CheckInField({
  label,
  value,
  onChangeText,
  keyboardType,
  autoComplete,
  autoFocus,
  inputRef,
  returnKeyType,
  blurOnSubmit,
  onSubmitEditing,
  highlighted,
  onLayoutY,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  keyboardType?: "default" | "email-address" | "phone-pad";
  autoComplete?: "given-name" | "family-name" | "email" | "tel" | "organization-title";
  autoFocus?: boolean;
  inputRef?: React.Ref<TextInput>;
  returnKeyType?: "next" | "done";
  blurOnSubmit?: boolean;
  onSubmitEditing?: () => void;
  highlighted?: boolean;
  onLayoutY?: (y: number) => void;
}) {
  return (
    <View
      onLayout={(event) => onLayoutY?.(event.nativeEvent.layout.y)}
      style={[homeSt.floatingField, highlighted && homeSt.floatingFieldHighlighted]}
    >
      {value.length > 0 && <Text style={homeSt.floatingLabel}>{label}</Text>}
      <TextInput
        ref={inputRef}
        autoFocus={autoFocus}
        value={value}
        onChangeText={onChangeText}
        placeholder={label}
        placeholderTextColor="#6b7280"
        keyboardType={keyboardType}
        autoComplete={autoComplete}
        returnKeyType={returnKeyType}
        blurOnSubmit={blurOnSubmit}
        onSubmitEditing={onSubmitEditing}
        style={homeSt.floatingInput}
      />
    </View>
  );
}

function CheckInQuestionField({ question, value, onChange }: { question: MobileCheckInQuestion; value: string; onChange: (value: string) => void }) {
  if (question.type === "select") {
    const isMultiSelect = question.id === "floor_plan";
    const selectedOptions = isMultiSelect ? value.split(", ").filter(Boolean) : [];
    function selectOption(option: string) {
      if (!isMultiSelect) {
        onChange(option);
        return;
      }
      const next = selectedOptions.includes(option)
        ? selectedOptions.filter((item) => item !== option)
        : [...selectedOptions, option];
      onChange(next.join(", "));
    }

    return (
      <View style={homeSt.questionField}>
        <Text style={homeSt.questionLabel}>{question.label}</Text>
        {isMultiSelect && <Text style={homeSt.questionHint}>Select all that fit.</Text>}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={homeSt.questionOptions}>
          {(question.options ?? []).map((option) => {
            const active = isMultiSelect ? selectedOptions.includes(option) : value === option;
            return (
              <Pressable key={option} onPress={() => selectOption(option)} style={[homeSt.questionOption, active && homeSt.questionOptionActive]}>
                <Text style={[homeSt.questionOptionText, active && homeSt.questionOptionTextActive]}>{option}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    );
  }
  return <CheckInField label={question.label} value={value} onChangeText={onChange} />;
}

function HomeSection({ title, action, showLogo = false, onAction, children }: { title: string; action?: string; showLogo?: boolean; onAction?: () => void; children: React.ReactNode }) {
  return (
    <MotionBlock style={{ gap: 12 }}>
      <View style={homeSt.sectionHeader}>
        {showLogo && <TourLogo width={58} />}
        <Text style={homeSt.sectionTitle}>{title}</Text>
        {action && (
          <Pressable onPress={onAction} disabled={!onAction} hitSlop={8} style={({ pressed }) => pressed ? st.pressed : undefined}>
            <Text style={homeSt.sectionAction}>{action}</Text>
          </Pressable>
        )}
      </View>
      {children}
    </MotionBlock>
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

function MetricCard({ icon, label, value, color, delay = 0, live = false }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string; color: string; delay?: number; live?: boolean }) {
  return (
    <Reanimated.View entering={FadeInUp.delay(delay).duration(360).springify()} style={homeSt.metricCard}>
      <Card style={metricSt.card}>
        <CardContent style={metricSt.content}>
          {live ? <PulseDot color={color} /> : <Ionicons name={icon} size={20} color={color} />}
          <UiText style={metricSt.value}>{value}</UiText>
          <UiText style={metricSt.label}>{label}</UiText>
        </CardContent>
      </Card>
    </Reanimated.View>
  );
}

const metricSt = StyleSheet.create({
  card: { gap: 6, borderColor: C.border, paddingVertical: 16 },
  content: { gap: 6, paddingHorizontal: 16, paddingVertical: 0 },
  value: { fontSize: 24, fontWeight: "900", fontVariant: ["tabular-nums"], color: C.text },
  label: { fontSize: 11, fontWeight: "800", textTransform: "uppercase", color: C.textMuted },
});

function CardRow({ icon, title, sub, onPress }: { icon: keyof typeof Ionicons.glyphMap; title: string; sub: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && st.pressed}>
      <Card style={cardRowSt.card}>
        <CardContent style={cardRowSt.content}>
          <View style={cardRowSt.iconWrap}>
            <Ionicons name={icon} size={22} color={C.brand} />
          </View>
          <View style={st.flex1}>
            <UiText style={cardRowSt.title}>{title}</UiText>
            <UiText style={cardRowSt.sub}>{sub}</UiText>
          </View>
          <Ionicons name="chevron-forward" size={18} color={C.textMuted} />
        </CardContent>
      </Card>
    </Pressable>
  );
}

const cardRowSt = StyleSheet.create({
  card: { flexDirection: "row", alignItems: "center", gap: 12, borderColor: C.border, paddingVertical: 12 },
  content: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 0 },
  iconWrap: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: "#e8f2ff",
  },
  title: { fontSize: 14, fontWeight: "900", color: C.text },
  sub: { marginTop: 2, fontSize: 12, color: C.textSec },
});

function SessionRow({ session, onPress, isLast }: { session: SessionSummary; onPress: () => void; isLast: boolean }) {
  const colors = STATUS_COLORS[session.status] ?? { bg: "#eaf4ff", text: C.brand };
  const label = STATUS_LABELS[session.status] ?? session.status;
  return (
    <MotionPressable onPress={onPress} haptic="selection" style={[st.sessionRow, !isLast && st.rowBorder]}>
      <View style={st.flex1}>
        <Text style={st.sessionTitle} numberOfLines={1}>{session.title}</Text>
        <Text style={st.sessionMeta} numberOfLines={1}>{session.prospectName ?? "No prospect"}{session.scheduledAt ? ` \u00B7 ${fmtDate(session.scheduledAt)}` : ""}</Text>
      </View>
      <TourStatusBadge label={label} bg={colors.bg} color={colors.text} />
      {session.overallScore !== null && <Text style={[st.scoreNum, { color: scoreColor(session.overallScore) }]}>{session.overallScore}%</Text>}
      <Ionicons name="chevron-forward" size={16} color="#cbd5e1" />
    </MotionPressable>
  );
}

// ═══════════════════════════════════════
// Sessions List (paginated + infinite scroll + filters)
// ═══════════════════════════════════════

type StatusFilter = "all" | "needs_review" | "feedback";
type SortOption = "newest" | "oldest" | "score_desc" | "score_asc";

const FILTER_CHIPS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "needs_review", label: "Needs review" },
  { value: "feedback", label: "Feedback received" },
];

const SORT_OPTS: { value: SortOption; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: "newest", label: "Newest", icon: "arrow-down-outline" },
  { value: "oldest", label: "Oldest", icon: "arrow-up-outline" },
  { value: "score_desc", label: "Score \u2193", icon: "trending-down-outline" },
  { value: "score_asc", label: "Score \u2191", icon: "trending-up-outline" },
];

const SESSIONS_PAGE_SIZE = 20;

function SessionsListScreen({ onBack, onCommunityPress, onSession, property }: { onBack: () => void; onCommunityPress: () => void; onSession: (id: string) => void; property: string }) {
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

  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const fetchPageData = useCallback(async (p: number, replace: boolean) => {
    if (replace) setLoading(true);
    else setLoadingMore(true);
    try {
      const data = await fetchSessions({
        page: p,
        limit: SESSIONS_PAGE_SIZE,
        sort,
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
  }, [sort, search]);

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
    const visibleSessions = sessions.filter((session) => {
      if (statusFilter === "all") return true;
      if (statusFilter === "needs_review") return ["uploaded", "failed", "analysis_ready"].includes(session.status);
      if (statusFilter === "feedback") return ["analysis_ready", "reviewed"].includes(session.status) || session.overallScore !== null;
      return true;
    });

    const label = statusFilter === "needs_review"
      ? "Needs Review"
      : statusFilter === "feedback"
        ? "Feedback Received"
        : "Recent Sessions";

    return visibleSessions.length
      ? [
          { kind: "header" as const, id: `header-${statusFilter}`, label, count: visibleSessions.length },
          ...visibleSessions.map((session) => ({ kind: "session" as const, id: session.id, session })),
        ]
      : [];
  }, [sessions, statusFilter]);

  const renderItem = useCallback(({ item }: { item: SessionListItem }) => {
    if (item.kind === "header") {
      return (
        <Reanimated.View entering={FadeIn.delay(80)} style={slst.groupHeader}>
          <Text style={slst.groupLabel}>{item.label}</Text>
          <View style={slst.groupCount}><Text style={slst.groupCountText}>{item.count}</Text></View>
        </Reanimated.View>
      );
    }
    const session = item.session;
    const needsReview = ["uploaded", "failed", "analysis_ready"].includes(session.status);
    return (
      <MotionPressable onPress={() => onSession(session.id)} haptic="selection" entering={FadeInDown.duration(260).springify()} style={slst.sessionCard}>
        <View style={st.flex1}>
          <View style={slst.sessionNameRow}>
            {session.status === "in_progress" && <PulseDot color="#f04438" />}
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
      </MotionPressable>
    );
  }, [onSession]);

  const keyExtractor = useCallback((item: SessionListItem) => item.id, []);
  const sessionMetrics = useMemo(() => computeDashboardMetrics(sessions), [sessions]);
  const averageScore = sessionMetrics.averageScore !== null ? `${sessionMetrics.averageScore}%` : "--";

  const ListHeader = useMemo(() => (
    <View style={slst.header}>
      <CommunityTopBar
        property={property}
        onCommunityPress={onCommunityPress}
        left={
          <Pressable accessibilityLabel="Back to home" onPress={onBack} style={({ pressed }) => [homeSt.headerIcon, pressed && st.pressed]}>
            <Ionicons name="arrow-back" size={22} color={C.text} />
          </Pressable>
        }
        right={
          <Pressable onPress={() => setShowSearch((value) => !value)} style={homeSt.headerIcon}>
            <Ionicons name={showSearch ? "close" : "search"} size={19} color={C.text} />
          </Pressable>
        }
      />
      <View style={slst.titleRow}>
        <Text style={st.pageTitle}>Sessions</Text>
        <View style={slst.avgPill}>
          <Ionicons name="analytics-outline" size={14} color={sessionMetrics.averageScore !== null ? scoreColor(sessionMetrics.averageScore) : C.brand} />
          <Text style={slst.avgPillValue}>{averageScore}</Text>
          <Text style={slst.avgPillLabel}>Avg</Text>
        </View>
      </View>

      {showSearch && (
        <Reanimated.View entering={FadeInDown.duration(220)} style={st.searchBar}>
          <Ionicons name="search-outline" size={18} color={C.textMuted} />
          <TextInput autoFocus placeholder="Search sessions..." placeholderTextColor={C.textMuted} value={search} onChangeText={setSearch} style={st.searchInput} returnKeyType="search" />
        </Reanimated.View>
      )}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={slst.chipsRow}>
        <View style={[slst.chip, slst.personChip]}><Ionicons name="person-circle-outline" size={18} color={C.text} /><Text style={slst.chipText}>You</Text><Ionicons name="chevron-down" size={12} color={C.textSec} /></View>
        <Pressable style={[slst.chip, slst.teamChip]}><Text style={slst.teamChipText}>Your team</Text></Pressable>
        <Pressable onPress={() => setShowSort((v) => !v)} style={[slst.chip, slst.sortChip]}>
          <Text style={slst.chipText}>{SORT_OPTS.find((o) => o.value === sort)?.label}</Text>
          <Ionicons name="chevron-down" size={12} color={C.textSec} />
        </Pressable>
      </ScrollView>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={slst.filterRow}>
        {FILTER_CHIPS.map((chip) => {
          const active = statusFilter === chip.value;
          return (
            <Pressable
              key={chip.value}
              onPress={() => { selectionHaptic(); setStatusFilter(chip.value); }}
              style={[slst.filterChip, active && slst.filterChipActive]}
            >
              <Text style={[slst.filterChipText, active && slst.filterChipTextActive]}>{chip.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {showSort && (
        <View style={slst.sortPanel}>
          {SORT_OPTS.map((o) => (
            <Pressable
              key={o.value}
              onPress={() => { selectionHaptic(); setSort(o.value); setShowSort(false); }}
              style={[slst.sortOpt, sort === o.value && slst.sortOptActive]}
            >
              <Ionicons name={o.icon} size={16} color={sort === o.value ? C.brand : C.textMuted} />
              <Text style={[slst.sortOptText, sort === o.value && { color: C.brand, fontWeight: "700" }]}>{o.label}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  ), [averageScore, onBack, onCommunityPress, property, search, sessionMetrics.averageScore, sort, showSort, showSearch, statusFilter]);

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
        <LoadingShimmer rows={5} />
      </View>
    );
    return (
      <EmptyState
        icon={search || statusFilter !== "all" ? "search-outline" : "albums-outline"}
        title={search || statusFilter !== "all" ? "No matching sessions" : "No sessions yet"}
        subtitle="Recent tours will appear here"
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
  filterRow: { gap: 7, paddingVertical: 2 },
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
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  avgPill: { minHeight: 36, flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 11, borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 999, backgroundColor: "#fff" },
  avgPillValue: { color: C.text, fontSize: 15, fontWeight: "900", fontVariant: ["tabular-nums"] },
  avgPillLabel: { color: C.textMuted, fontSize: 10, fontWeight: "900", textTransform: "uppercase" },
  filterChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: "#e2e8f0", backgroundColor: "#fff" },
  filterChipActive: { borderColor: "#bfdbfe", backgroundColor: "#eff6ff" },
  filterChipText: { color: C.textSec, fontSize: 12, fontWeight: "800" },
  filterChipTextActive: { color: C.brand },
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

const calSt = StyleSheet.create({
  upcomingBlock: { gap: 12 },
});

function CalendarScreen({
  sessions,
  upcomingSessions,
  entrataEvents,
  onSession,
  onReload,
  onCommunityPress,
  property,
}: {
  sessions: SessionSummary[];
  upcomingSessions: SessionSummary[];
  entrataEvents: CalendarEvent[];
  onSession: (id: string) => void;
  onReload: () => Promise<void>;
  onCommunityPress: () => void;
  property: string;
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
      <CommunityTopBar
        property={property}
        onCommunityPress={onCommunityPress}
        left={<TourLogo width={62} />}
        right={
          <Pressable onPress={() => void runSync()} disabled={syncing} style={({ pressed }) => [homeSt.headerIcon, pressed && st.pressed]}>
            {syncing ? <ActivityIndicator size="small" color={C.brand} /> : <Ionicons name="sync" size={18} color={C.text} />}
          </Pressable>
        }
      />
      <View style={st.pageHeadingRow}>
        <View style={st.flex1}>
          <Text style={st.pageTitle}>Calendar</Text>
          <Text style={st.pageHeadingSub}>{entrataEvents.length} Entrata tours · {sessions.length} sessions</Text>
        </View>
      </View>

      <View style={st.integrationStrip}>
        <View style={st.integrationIcon}><Ionicons name="calendar" size={17} color={C.green} /></View>
        <View style={st.flex1}>
          <Text style={st.integrationTitle}>Entrata connected</Text>
          <Text style={st.integrationSub}>Tours and prospect details sync from Entrata.</Text>
        </View>
        <View style={st.connectedBadge}><View style={st.connectedBadgeDot} /><Text style={st.connectedBadgeText}>Live</Text></View>
      </View>

      <View style={calSt.upcomingBlock}>
        <View style={homeSt.sectionHeader}>
          <Text style={homeSt.sectionTitle}>Upcoming Tours</Text>
          <Text style={homeSt.sectionAction}>See All</Text>
        </View>
        {upcomingSessions.length === 0 ? (
          <EmptyState icon="calendar-outline" title="No upcoming tours" subtitle="Scheduled and active tours will appear here" />
        ) : (
          <View style={homeSt.focusStack}>
            {upcomingSessions.slice(0, 4).map((session) => (
              <MotionPressable key={session.id} onPress={() => onSession(session.id)} haptic="selection" style={homeSt.tourCard}>
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
                <Ionicons name="chevron-forward" size={18} color={C.textMuted} />
              </MotionPressable>
            ))}
          </View>
        )}
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

const assetSt = StyleSheet.create({
  header: { gap: 14 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  titleText: { flex: 1, minWidth: 0 },
  recordButton: { minHeight: 46, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9, borderWidth: 1, borderColor: "#d7dee8", borderRadius: 999, backgroundColor: "#fff" },
  recordButtonText: { color: C.text, fontSize: 14, fontWeight: "900" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 14 },
  cardWrap: { width: (Dimensions.get("window").width - 54) / 2 },
  card: { gap: 8 },
  thumb: { aspectRatio: 1, alignItems: "center", justifyContent: "center", overflow: "hidden", borderRadius: 18, backgroundColor: "#eef4ff" },
  thumbImage: { ...StyleSheet.absoluteFillObject, width: "100%", height: "100%" },
  thumbOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(15,23,42,0.08)" },
  playBadge: { position: "absolute", left: 10, bottom: 10, width: 30, height: 30, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "rgba(255,255,255,0.9)", borderRadius: 15, backgroundColor: "rgba(15,23,42,0.86)" },
  fallbackIcon: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 16, backgroundColor: "#fff" },
  cardTitle: { color: C.text, fontSize: 14, fontWeight: "900" },
  cardMeta: { color: C.textSec, fontSize: 11, fontWeight: "700" },
  modalScrim: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(15,23,42,0.42)" },
  modalSheet: { maxHeight: "88%", gap: 14, padding: 18, paddingBottom: Platform.OS === "ios" ? 34 : 20, borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: "#fff" },
  modalHandle: { alignSelf: "center", width: 42, height: 5, borderRadius: 3, backgroundColor: "#d1d5db" },
  modalHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  modalTitle: { color: C.text, fontSize: 22, fontWeight: "900" },
  modalMeta: { color: C.textSec, fontSize: 12, fontWeight: "700", marginTop: 2, textTransform: "capitalize" },
  modalPreview: { minHeight: 250, overflow: "hidden", borderRadius: 20, backgroundColor: "#eef4ff" },
  modalImage: { width: "100%", height: 250 },
  modalFallback: { height: 250, alignItems: "center", justifyContent: "center" },
  modalActions: { flexDirection: "row", gap: 10 },
  modalPrimary: { flex: 1, minHeight: 50, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 16, backgroundColor: C.brand },
  modalPrimaryText: { color: "#fff", fontSize: 14, fontWeight: "900" },
  modalSecondary: { minWidth: 98, minHeight: 50, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, paddingHorizontal: 14, borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 16, backgroundColor: "#fff" },
  modalSecondaryText: { color: C.text, fontSize: 13, fontWeight: "900" },
});

function MaterialsScreen({ materials, loading, onCreate, onReload, onBack, onCommunityPress, property }: { materials: Material[]; loading: boolean; onCreate: () => void; onReload: () => Promise<void>; onBack: () => void; onCommunityPress: () => void; property: string }) {
  const [uploading, setUploading] = useState(false);
  const [selected, setSelected] = useState<Material | null>(null);

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
      <View style={assetSt.header}>
        <CommunityTopBar
          property={property}
          onCommunityPress={onCommunityPress}
          left={
            <Pressable accessibilityLabel="Back to home" onPress={onBack} style={({ pressed }) => [homeSt.headerIcon, pressed && st.pressed]}>
              <Ionicons name="arrow-back" size={22} color={C.text} />
            </Pressable>
          }
          right={
            <Pressable onPress={() => void addAsset()} disabled={uploading} style={({ pressed }) => [homeSt.headerIcon, pressed && st.pressed]}>
              {uploading ? <ActivityIndicator size="small" color={C.brand} /> : <Ionicons name="add" size={21} color={C.text} />}
            </Pressable>
          }
        />
        <View>
          <Text style={st.pageTitle}>Assets</Text>
          <Text style={st.pageHeadingSub}>{materials.length} community resources</Text>
        </View>
        <Pressable onPress={onCreate} style={({ pressed }) => [assetSt.recordButton, pressed && st.pressed]}>
          <Ionicons name="radio-button-on-outline" size={16} color={C.purple} />
          <Text style={assetSt.recordButtonText}>Record Projects</Text>
        </Pressable>
      </View>

      {loading ? <LoadingBox /> : materials.length === 0 ? <EmptyState icon="folder-open-outline" title="No materials" subtitle="Tour videos and community resources will appear here" /> : (
        <View style={assetSt.grid}>
          {materials.map((material) => {
            const previewUrl = materialPreviewUrl(material);
            const canPlay = Boolean(materialUrl(material));
            return (
              <View key={material.id} style={assetSt.cardWrap}>
              <Pressable onPress={() => setSelected(material)} style={({ pressed }) => [assetSt.card, pressed && st.pressed]}>
                <View style={assetSt.thumb}>
                  {previewUrl ? (
                    <>
                      <Image source={{ uri: previewUrl }} style={assetSt.thumbImage} resizeMode="cover" />
                      <View style={assetSt.thumbOverlay} />
                    </>
                  ) : (
                    <View style={assetSt.fallbackIcon}>
                      <Ionicons name={canPlay ? "play" : "document-outline"} size={22} color={C.brand} />
                    </View>
                  )}
                  {canPlay && (
                    <View style={assetSt.playBadge}>
                      <Ionicons name="play" size={13} color="#fff" />
                    </View>
                  )}
                </View>
                <Text style={assetSt.cardTitle} numberOfLines={1}>{material.name}</Text>
                <Text style={assetSt.cardMeta} numberOfLines={1}>{material.type} · {fmtDate(material.createdAt)}</Text>
              </Pressable>
              </View>
            );
          })}
        </View>
      )}

      <MaterialPreviewModal material={selected} onClose={() => setSelected(null)} />
    </View>
  );
}

function MaterialPreviewModal({ material, onClose }: { material: Material | null; onClose: () => void }) {
  const url = material ? materialUrl(material) : null;
  const previewUrl = material ? materialPreviewUrl(material) : null;
  const videoUrl = material?.media?.videoUrl ?? (url && isVideoLikeUrl(url) ? url : null);

  async function shareSelected() {
    if (!material) return;
    try {
      await Share.share({
        title: material.name,
        message: url ? `${material.name}\n${url}` : material.name,
        url: url ?? undefined,
      });
    } catch {
      showToast("Could not open share sheet", "error");
    }
  }

  async function downloadSelected() {
    if (!material) return;
    await downloadMaterial(material);
  }

  return (
    <Modal visible={Boolean(material)} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={assetSt.modalScrim} onPress={onClose}>
        <Pressable onPress={(event) => event.stopPropagation()} style={assetSt.modalSheet}>
          <View style={assetSt.modalHandle} />
          <View style={assetSt.modalHeader}>
            <View style={st.flex1}>
              <Text style={assetSt.modalTitle} numberOfLines={2}>{material?.name}</Text>
              <Text style={assetSt.modalMeta}>{material ? `${material.type} · ${fmtDate(material.createdAt)}` : ""}</Text>
            </View>
            <Pressable accessibilityLabel="Close media preview" onPress={onClose} style={homeSt.headerIcon}>
              <Ionicons name="close" size={19} color={C.text} />
            </Pressable>
          </View>

          <View style={assetSt.modalPreview}>
            {videoUrl ? (
              <MaterialVideoPreview source={videoUrl} />
            ) : previewUrl ? (
              <Image source={{ uri: previewUrl }} style={assetSt.modalImage} resizeMode="cover" />
            ) : (
              <View style={assetSt.modalFallback}>
                <Ionicons name={url ? "play-circle-outline" : "document-outline"} size={52} color={C.brand} />
              </View>
            )}
          </View>

          <Text style={st.materialDesc}>{material?.description}</Text>

          <View style={assetSt.modalActions}>
            <Pressable onPress={() => void shareSelected()} style={({ pressed }) => [assetSt.modalSecondary, pressed && st.pressed]}>
              <Ionicons name="share-social-outline" size={16} color={C.text} />
              <Text style={assetSt.modalSecondaryText}>Share</Text>
            </Pressable>
            <Pressable disabled={!url} onPress={() => void downloadSelected()} style={({ pressed }) => [assetSt.modalSecondary, !url && { opacity: 0.55 }, pressed && st.pressed]}>
              <Ionicons name="download-outline" size={16} color={C.text} />
              <Text style={assetSt.modalSecondaryText}>Download</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function isVideoLikeUrl(url: string) {
  if (/^file:\/\//i.test(url)) return true;
  return /\.(mp4|mov|m4v|webm)(?:[?#].*)?$/i.test(url);
}

function materialDownloadName(material: Material, url: string) {
  const cleanName = material.name.trim().replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "") || "tour-asset";
  const path = (() => {
    try {
      return new URL(url).pathname;
    } catch {
      return url;
    }
  })();
  const extension = path.match(/\.([a-z0-9]{2,6})(?:$|[?#])/i)?.[0] ?? (material.media?.videoUrl ? ".mp4" : "");
  return cleanName.toLowerCase().endsWith(extension.toLowerCase()) ? cleanName : `${cleanName}${extension}`;
}

async function downloadMaterial(material: Material) {
  const url = materialUrl(material);
  if (!url) {
    showToast("No downloadable file found", "error");
    return;
  }

  try {
    if (Platform.OS === "web") {
      await Linking.openURL(url);
      return;
    }

    const localUri = url.startsWith("file://")
      ? url
      : (await FileSystem.File.downloadFileAsync(
          url,
          new FileSystem.File(FileSystem.Paths.document, `${Date.now()}-${materialDownloadName(material, url)}`),
          { idempotent: true }
        )).uri;

    await Share.share({
      title: material.name,
      message: material.name,
      url: localUri,
    });
  } catch {
    showToast("Could not download this asset", "error");
  }
}

function MaterialVideoPreview({ source }: { source: string }) {
  const player = useVideoPlayer(source, (vp) => {
    vp.loop = false;
  });
  return <VideoView player={player} style={assetSt.modalImage} contentFit="cover" nativeControls />;
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
            <View style={[st.progressTrack, { alignSelf: "stretch" }]}><AnimatedProgressFill percent={progress} /></View>
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

function SessionDetailScreen({
  sessionId,
  onBack,
  onOpenAiChat,
  onOpenAudioInsights,
}: {
  sessionId: string;
  onBack: () => void;
  onOpenAiChat: (meta: { sessionId: string; sessionTitle?: string; prospectName?: string }) => void;
  onOpenAudioInsights: (meta: {
    sessionId: string;
    sessionTitle?: string;
    initialStatus?: AudioInsightsStatus;
    initialInsights?: AudioInsights | null;
  }) => void;
}) {
  const [session, setSession] = useState<any>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [actions, setActions] = useState<FollowUpAction[]>([]);
  const [transcript, setTranscript] = useState<any[]>([]);
  const [phases, setPhases] = useState<ConversationPhaseSegmentation | null>(null);
  const [comments, setComments] = useState<SessionComment[]>([]);
  const [audioInsightsStatus, setAudioInsightsStatus] = useState<AudioInsightsStatus>("pending");
  const [audioInsights, setAudioInsights] = useState<AudioInsights | null>(null);
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
      setPhases(sRes.phases ?? null);
      setAudioInsightsStatus(sRes.session.audioInsightsStatus ?? "pending");
      setAnalysis(aRes.analysis);
      setActions(actRes.actions);
      setTranscript(tRes.transcript);
      setComments(cRes.comments);

      if (sRes.session.audioInsightsStatus === "ready" || sRes.session.audioInsightsStatus === "processing") {
        const insightsRes = await fetchAudioInsights(sessionId).catch(() => null);
        if (insightsRes) {
          setAudioInsightsStatus(insightsRes.status);
          setAudioInsights(insightsRes.insights);
        }
      }
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

  if (loading && !session) return <SessionReviewSkeleton onBack={onBack} />;

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
        phases={phases}
        comments={comments}
        actions={actions}
        audioInsightsStatus={audioInsightsStatus}
        audioInsights={audioInsights}
        sessionId={sessionId}
        onBack={onBack}
        onReload={load}
        onOpenAiChat={() =>
          onOpenAiChat({
            sessionId,
            sessionTitle: session.title,
            prospectName: session.prospectName ?? undefined,
          })
        }
        onOpenAudioInsights={() =>
          onOpenAudioInsights({
            sessionId,
            sessionTitle: session.title,
            initialStatus: audioInsightsStatus,
            initialInsights: audioInsights,
          })
        }
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
  phases,
  comments,
  actions,
  audioInsightsStatus,
  audioInsights,
  sessionId,
  onBack,
  onReload,
  onOpenAiChat,
  onOpenAudioInsights,
}: {
  session: any;
  analysis: AnalysisResult;
  transcript: any[];
  phases: ConversationPhaseSegmentation | null;
  comments: SessionComment[];
  actions: FollowUpAction[];
  audioInsightsStatus: AudioInsightsStatus;
  audioInsights: AudioInsights | null;
  sessionId: string;
  onBack: () => void;
  onReload: () => void;
  onOpenAiChat: () => void;
  onOpenAudioInsights: () => void;
}) {
  const [localActions, setLocalActions] = useState(actions);
  const [localComments, setLocalComments] = useState(comments);
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [activeSegmentId, setActiveSegmentId] = useState<string | null>(transcript[0]?.id ?? null);
  const [commentingOn, setCommentingOn] = useState<any | null>(null);
  const [commentBody, setCommentBody] = useState("");
  const [reviewMode, setReviewMode] = useState<SessionReviewMode>("rubric");
  const scrollRef = useRef<ScrollView | null>(null);
  const segmentY = useRef<Record<string, number>>({});
  const userDragging = useRef(false);
  const lastAutoSegment = useRef<string | null>(null);

  useEffect(() => { setLocalActions(actions); }, [actions]);
  useEffect(() => { setLocalComments(comments); }, [comments]);

  const playbackUrl = getRecordingPlaybackUrl(sessionId);

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
    const body = commentBody.trim();
    const timestampSec = commentingOn.startTime;
    const tempId = `optimistic-${Date.now()}`;
    const optimistic: SessionComment = {
      id: tempId,
      sessionId,
      authorName: "You",
      body,
      timestampSec,
      parentId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setLocalComments((prev) => [...prev, optimistic]);
    setCommentBody("");
    setCommentingOn(null);
    try {
      const { comment } = await postComment(sessionId, { body, timestampSec });
      setLocalComments((prev) => prev.map((item) => (item.id === tempId ? comment : item)));
      showToast("Comment added at this moment", "success");
    } catch {
      setLocalComments((prev) => prev.filter((item) => item.id !== tempId));
      showToast("Could not add comment", "error");
    }
  }

  function commentsForSegment(segment: any) {
    return localComments.filter((comment) =>
      comment.timestampSec !== null &&
      comment.timestampSec >= segment.startTime &&
      comment.timestampSec < segment.endTime
    );
  }

  const pct = duration > 0 ? Math.min(100, (position / duration) * 100) : 0;
  const openActionCount = localActions.filter((action) => action.status === "open").length;
  const coachingMoments = useMemo(() => {
    return analysis.exactMoments
      .map((moment, index) => ({
        ...moment,
        id: `${moment.timestamp}-${index}`,
        seconds: parseMomentTime(moment.timestamp),
      }))
      .filter((moment) => moment.seconds !== null)
      .sort((left, right) => (left.seconds ?? 0) - (right.seconds ?? 0));
  }, [analysis.exactMoments]);
  const transcriptGroups = useMemo(() => {
    if (!transcript.length) return [] as Array<{ id: string; label: string; startTime: number; color: string; segments: any[] }>;
    if (!phases?.spans.length) {
      return [{ id: "all", label: "Transcript", startTime: transcript[0]?.startTime ?? 0, color: C.brand, segments: transcript }];
    }
    return phases.spans
      .map((span, index) => {
        const segments = transcript.filter((segment) => segment.startTime >= span.startTime && segment.startTime < span.endTime);
        return {
          id: span.id,
          label: shortPhaseLabel(span.label),
          startTime: span.startTime,
          color: tourSegmentColor(index),
          segments,
        };
      })
      .filter((group) => group.segments.length > 0);
  }, [phases, transcript]);

  return (
    <View style={reviewSt.root}>
      <ScrollView
        ref={scrollRef}
        style={reviewSt.scrollBody}
        contentContainerStyle={reviewSt.scrollContent}
        showsVerticalScrollIndicator={false}
        stickyHeaderIndices={[3]}
        scrollEventThrottle={16}
        onScrollBeginDrag={() => {
          if (reviewMode === "transcript") userDragging.current = true;
        }}
        onMomentumScrollEnd={(event) => {
          if (reviewMode !== "transcript") return;
          const offset = event.nativeEvent.contentOffset.y;
          const closest = transcript.reduce<any | null>((best, segment) => {
            if (!best) return segment;
            return Math.abs((segmentY.current[segment.id] ?? 0) - offset) < Math.abs((segmentY.current[best.id] ?? 0) - offset) ? segment : best;
          }, null);
          userDragging.current = false;
          if (closest && closest.id !== activeSegmentId) void seekToSeconds(closest.startTime);
        }}
        onScrollEndDrag={() => {
          setTimeout(() => { userDragging.current = false; }, 120);
        }}
      >
        <TourScreenHeader
          onBack={onBack}
          title={session.title}
          subtitle={session.prospectName || "Recorded tour"}
          meta={[
            ...(duration ? [{ icon: Clock3, label: fmtSec(duration) }] : []),
            { icon: Mic, label: "Call review" },
            ...(openActionCount > 0
              ? [{ icon: ListTodo, label: `${openActionCount} actions` }]
              : []),
          ]}
        />

        <SessionSummaryStrip
          score={analysis.overallScore}
          pointsEarned={analysis.totalPointsEarned}
          pointsPossible={analysis.totalPointsPossible}
          openActionCount={openActionCount}
          onCoachingPress={() => setReviewMode("coaching")}
        />

        <SessionInsightCards
          analysis={analysis}
          audioInsightsStatus={audioInsightsStatus}
          audioInsights={audioInsights}
          onOpenAiChat={onOpenAiChat}
          onOpenAudioInsights={onOpenAudioInsights}
        />

        <View style={reviewSt.tabSticky}>
          <SessionModeTabs
            value={reviewMode}
            onChange={setReviewMode}
            openActionCount={openActionCount}
          />
        </View>

        <View style={reviewSt.tabBody}>
        {reviewMode === "rubric" && (
          <AnimatedTabContent tabKey="rubric">
            <View style={{ gap: 12 }}>
              <InfoCard title="Executive Summary" icon="document-text-outline">{analysis.summary}</InfoCard>
              <SectionScoreOverview analysis={analysis} />
              <RubricTab analysis={analysis} />
              <View style={[st.card, { padding: 14, gap: 8, borderLeftWidth: 3, borderLeftColor: C.green }]}>
                <Text style={[st.cardTitle, { color: C.green }]}>Strengths</Text>
                {analysis.strengths.map((strength, index) => <BulletItem key={index} text={strength} color={C.green} />)}
              </View>
            </View>
          </AnimatedTabContent>
        )}
        {reviewMode === "coaching" && (
          <AnimatedTabContent tabKey="coaching">
          <View style={{ gap: 12 }}>
            <ActionsTab
              actions={localActions}
              sessionId={sessionId}
              onUpdate={onReload}
              onActionsChange={setLocalActions}
            />
            <View style={[st.card, { padding: 14, gap: 8, borderLeftWidth: 3, borderLeftColor: C.amber }]}>
              <Text style={[st.cardTitle, { color: C.amber }]}>Where points were lost</Text>
              {analysis.opportunities.map((opportunity, index) => <BulletItem key={index} text={opportunity} color={C.amber} />)}
            </View>
            {coachingMoments.length > 0 ? (
              <View style={{ gap: 10 }}>
                <Text style={st.sectionTitle}>Coachable moments</Text>
                {coachingMoments.map((moment) => (
                  <CoachingMomentCard
                    key={moment.id}
                    moment={moment}
                    onSeek={() => void seekToSeconds(moment.seconds ?? 0, true)}
                  />
                ))}
              </View>
            ) : null}
          </View>
          </AnimatedTabContent>
        )}
        {reviewMode === "transcript" && transcript.length === 0 && (
          <AnimatedTabContent tabKey="transcript-empty">
            <EmptyState icon="chatbubble-outline" title="No transcript yet" subtitle="The transcript will appear after processing." />
          </AnimatedTabContent>
        )}
        {reviewMode === "transcript" && transcriptGroups.map((group) => (
          <View key={group.id} style={reviewSt.phaseSection}>
            <View style={reviewSt.phaseDivider}>
              <View style={[reviewSt.phaseDividerLine, { backgroundColor: group.color }]} />
              <Text style={[reviewSt.phaseDividerTitle, { color: group.color }]}>{group.label}</Text>
              <Text style={reviewSt.phaseDividerTime}>{fmtSec(group.startTime)}</Text>
            </View>
            {group.segments.map((segment, index) => {
              const active = segment.id === activeSegmentId;
              const isAgent = segment.speaker?.toLowerCase().includes("agent");
              const prev = group.segments[index - 1];
              const showInitial = !prev || prev.speaker !== segment.speaker;
              const segmentComments = commentsForSegment(segment);
              const moments = coachingMoments.filter((moment) =>
                moment.seconds !== null &&
                moment.seconds >= segment.startTime &&
                moment.seconds < segment.endTime
              );
              return (
                <Reanimated.View
                  key={segment.id || index}
                  entering={FadeInDown.delay(Math.min(index * 18, 180)).duration(240)}
                  onLayout={(event) => { segmentY.current[segment.id] = event.nativeEvent.layout.y; }}
                  style={[reviewSt.turnRow, active && reviewSt.turnRowActive]}
                >
                  <Pressable onPress={() => void seekToSeconds(segment.startTime, true)} style={reviewSt.turnMain}>
                    <View style={reviewSt.turnInitialSlot}>
                      {showInitial && (
                        <Text style={[reviewSt.turnInitial, { color: isAgent ? tourColors.agent : tourColors.prospect }]}>
                          {isAgent ? "A" : "P"}
                        </Text>
                      )}
                    </View>
                    <View style={st.flex1}>
                      <View style={reviewSt.turnMeta}>
                        <Text style={[reviewSt.turnSpeaker, { color: isAgent ? tourColors.agent : tourColors.prospect }]}>
                          {segment.speaker || (isAgent ? "Agent" : "Prospect")}
                        </Text>
                        <Text style={reviewSt.segmentTime}>{fmtSec(segment.startTime)}</Text>
                      </View>
                      <Text style={reviewSt.turnText}>{segment.text}</Text>
                    </View>
                    <View style={reviewSt.turnActions}>
                      <Pressable accessibilityLabel="Add comment" onPress={() => setCommentingOn(segment)}><Ionicons name="chatbubble-outline" size={16} color={C.textSec} /></Pressable>
                      <Pressable accessibilityLabel="Bookmark moment" onPress={() => selectionHaptic()}><Ionicons name="bookmark-outline" size={16} color={C.textSec} /></Pressable>
                    </View>
                  </Pressable>
                  {moments.map((moment) => (
                    <CoachingMomentCard
                      key={moment.id}
                      moment={moment}
                      compact
                      onSeek={() => void seekToSeconds(moment.seconds ?? segment.startTime, true)}
                    />
                  ))}
                  {segmentComments.map((comment) => (
                    <Pressable key={comment.id} onPress={() => void seekToSeconds(comment.timestampSec ?? segment.startTime, true)} style={reviewSt.inlineComment}>
                      <Ionicons name="chatbubble-ellipses-outline" size={13} color={C.brand} />
                      <View style={st.flex1}>
                        <Text style={reviewSt.inlineCommentAuthor}>{comment.authorName} · {fmtSec(comment.timestampSec ?? 0)}</Text>
                        <Text style={reviewSt.inlineCommentBody}>{comment.body}</Text>
                      </View>
                    </Pressable>
                  ))}
                  {commentingOn?.id === segment.id && (
                    <View style={reviewSt.inlineComposer}>
                      <TextInput autoFocus value={commentBody} onChangeText={setCommentBody} placeholder={`Comment at ${fmtSec(segment.startTime)}`} placeholderTextColor={C.textMuted} style={reviewSt.inlineInput} />
                      <Pressable disabled={!commentBody.trim()} onPress={postInlineComment} style={reviewSt.inlineSend}>
                        <Ionicons name="send" size={16} color="#fff" />
                      </Pressable>
                    </View>
                  )}
                </Reanimated.View>
              );
            })}
          </View>
        ))}
        </View>
      </ScrollView>

      <SessionPlayer
        position={position}
        duration={duration}
        playing={playing}
        speed={speed}
        ready={!!sound}
        progressPercent={pct}
        onToggle={() => void togglePlayback()}
        onSpeed={() => void changeSpeed()}
        onSeek={(ratio) => void seekToSeconds(ratio * duration)}
      />
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

function CoachingMomentCard({
  moment,
  onSeek,
  compact = false,
}: {
  moment: {
    timestamp: string;
    transcriptQuote: string;
    explanation: string;
    suggestedImprovement: string;
    seconds: number | null;
  };
  onSeek: () => void;
  compact?: boolean;
}) {
  return (
    <MotionPressable onPress={onSeek} haptic="selection" entering={FadeInDown.duration(260).springify()} style={[reviewSt.coachingMoment, compact && reviewSt.coachingMomentCompact]}>
      <View style={reviewSt.coachingMomentHeader}>
        <View style={reviewSt.coachingMomentIcon}><Ionicons name="flash" size={13} color={C.purple} /></View>
        <Text style={reviewSt.coachingMomentKicker}>Coachable Moment</Text>
        <Text style={reviewSt.coachingMomentTime}>{moment.timestamp}</Text>
      </View>
      <Text style={reviewSt.coachingMomentBody}>{moment.explanation}</Text>
      {moment.suggestedImprovement ? (
        <View style={reviewSt.coachingSuggestion}>
          <Text style={reviewSt.coachingSuggestionLabel}>Try</Text>
          <Text style={reviewSt.coachingSuggestionText}>{moment.suggestedImprovement}</Text>
        </View>
      ) : null}
      {!compact && moment.transcriptQuote ? (
        <Text style={reviewSt.coachingQuote} numberOfLines={2}>"{moment.transcriptQuote}"</Text>
      ) : null}
      <View style={reviewSt.coachingMomentActions}>
        <Text style={reviewSt.coachingMomentAction}>Save</Text>
        <Text style={reviewSt.coachingMomentAction}>Practice</Text>
        <Text style={reviewSt.coachingMomentAction}>Copy suggestion</Text>
      </View>
    </MotionPressable>
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

function ProcessingTimeline({ status }: { status: string }) {
  const activeIndex = Math.max(0, SESSION_PROCESS_STEPS.findIndex((step) => step.id === status));
  const isComplete = status === "analysis_ready" || status === "reviewed";

  return (
    <View style={reviewSt.processingTimeline}>
      {SESSION_PROCESS_STEPS.map((step, index) => {
        const done = isComplete || index < activeIndex;
        const active = !isComplete && index === activeIndex;
        const color = done ? C.green : active ? C.brand : C.textMuted;
        return (
          <View key={step.id} style={reviewSt.processingStep}>
            <View style={[reviewSt.processingStepIcon, active && reviewSt.processingStepIconActive, done && reviewSt.processingStepIconDone]}>
              {active ? <PulseDot color={C.brand} /> : <Ionicons name={(done ? "checkmark" : step.icon) as any} size={16} color={color} />}
            </View>
            <Text style={[reviewSt.processingStepText, (active || done) && { color }]}>{step.label}</Text>
          </View>
        );
      })}
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
        <View style={st.progressTrack}><AnimatedProgressFill percent={progress} /></View>
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
        <Text style={[st.pageSub, { textAlign: "center" }]}>{processingStatusMessage(status)}</Text>
        <ProcessingTimeline status={status} />
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

function ActionsTab({
  actions,
  sessionId,
  onUpdate,
  onActionsChange,
}: {
  actions: FollowUpAction[];
  sessionId: string;
  onUpdate: () => void;
  onActionsChange?: (next: FollowUpAction[] | ((prev: FollowUpAction[]) => FollowUpAction[])) => void;
}) {
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const open = actions.filter((a) => a.status === "open");
  const done = actions.filter((a) => a.status !== "open");

  async function handleStatus(id: string, status: "completed" | "dismissed") {
    const previous = actions;
    onActionsChange?.((prev) => prev.map((action) => (action.id === id ? { ...action, status } : action)));
    setUpdatingId(id);
    try {
      await updateActionStatus(sessionId, id, status);
      showToast(status === "completed" ? "Marked as done" : "Dismissed", "success");
      onUpdate();
    } catch {
      onActionsChange?.(previous);
      showToast("Failed to update", "error");
    } finally {
      setUpdatingId(null);
    }
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
  const [error, setError] = useState<string | null>(null);

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

  function applicationsFor(rubricId: string) {
    return sessions.filter((item) => item.rubricId === rubricId);
  }

  const defaultRubric = rubrics.find((rubric) => rubric.isDefault) ?? rubrics[0] ?? null;
  const otherRubrics = defaultRubric ? rubrics.filter((rubric) => rubric.id !== defaultRubric.id) : rubrics;

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
            </View>
            <View>
              <Text style={st.pageTitle}>Rubrics</Text>
              <Text style={st.pageHeadingSub}>{session.workspace.community.name}</Text>
            </View>
            {error && <ErrorBanner message={error} onRetry={load} />}
          {loading ? <LoadingBox /> : rubrics.length === 0 ? (
            <EmptyState icon="clipboard-outline" title="No rubrics" subtitle="Evaluation templates will appear here" />
          ) : (
            <>
              {defaultRubric && (
                <MotionPressable onPress={() => setSelected(defaultRubric)} haptic="selection" style={st.defaultRubricCard}>
                  <View style={st.defaultRubricIcon}>
                    <Ionicons name="clipboard-outline" size={23} color={C.purple} />
                  </View>
                  <View style={st.flex1}>
                    <View style={st.rubricTitleRow}>
                      <Text style={st.defaultRubricTitle} numberOfLines={2}>{defaultRubric.name}</Text>
                      <View style={st.defaultBadge}><Text style={st.defaultBadgeText}>Default</Text></View>
                    </View>
                    <Text style={st.materialMeta}>
                      {defaultRubric.definition.sections.length} sections · {rubricItemCount(defaultRubric.definition)} items · {rubricTotalPoints(defaultRubric.definition)} pts
                    </Text>
                    <Text style={st.rubricAppliedText}>{applicationsFor(defaultRubric.id).length} session{applicationsFor(defaultRubric.id).length === 1 ? "" : "s"}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={C.textMuted} />
                </MotionPressable>
              )}

              <Text style={st.sectionTitle}>All rubrics</Text>
              <View style={st.rubricGrid}>
              {otherRubrics.map((rubric) => {
                const applications = applicationsFor(rubric.id);
                return (
                  <MotionPressable
                    key={rubric.id}
                    onPress={() => setSelected(rubric)}
                    haptic="selection"
                    style={st.rubricCard}
                  >
                    <View style={st.rubricListIcon}><Ionicons name="clipboard-outline" size={19} color={C.purple} /></View>
                    <View style={st.rubricCardBody}>
                      <Text style={st.rubricCardTitle} numberOfLines={2}>{rubric.name}</Text>
                      <Text style={st.materialMeta} numberOfLines={1}>
                        {rubric.definition.sections.length} sections · {rubricItemCount(rubric.definition)} items
                      </Text>
                      <Text style={st.rubricAppliedText}>{applications.length} session{applications.length === 1 ? "" : "s"}</Text>
                    </View>
                  </MotionPressable>
                );
              })}
              </View>
            </>
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
        <View style={st.settingsCommunityRow}>
          <View style={[st.communitySettingIcon, { backgroundColor: C.greenBg }]}>
            <Ionicons name="business-outline" size={18} color={C.green} />
          </View>
          <View style={st.flex1}>
            <Text style={st.communitySettingName}>{session.workspace.community.name}</Text>
            <Text style={st.cardRowSub}>{session.workspace.communities.length} available communities</Text>
          </View>
          <Text style={st.settingsChangeText}>Change</Text>
        </View>
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
// Shared components (see src/components/tour)
// ═══════════════════════════════════════

const W = Dimensions.get("window").width;

const homeSt = StyleSheet.create({
  topBar: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 8 },
  topBarSide: { width: 44, alignItems: "flex-start", justifyContent: "center" },
  topBarSideEnd: { alignItems: "flex-end" },
  topBarCenter: { flex: 1, minWidth: 0, alignItems: "center", justifyContent: "center" },
  propertyPicker: { maxWidth: "100%", minHeight: 42, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, paddingHorizontal: 16, borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 999, backgroundColor: "#fff" },
  propertyPickerText: { flexShrink: 1, color: "#5f6673", fontSize: 16, lineHeight: 19, fontWeight: "800", textAlign: "center" },
  headerIcon: { width: 38, height: 38, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#e2e2e2", borderRadius: 8, backgroundColor: "#fff" },
  profileCard: { overflow: "hidden", borderRadius: 28, backgroundColor: "#fff", shadowColor: "#101828", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.12, shadowRadius: 24, elevation: 4 },
  profileHeader: { height: 112, backgroundColor: "#111" },
  profileBody: { alignItems: "center", gap: 5, paddingHorizontal: 24, paddingTop: 0, paddingBottom: 24 },
  profileAvatarLarge: { width: 88, height: 88, marginTop: -44, borderWidth: 4, borderColor: "#fff", borderRadius: 44, alignItems: "center", justifyContent: "center", backgroundColor: "#d1d5db" },
  profileAvatarLargeText: { color: "#6b7280", fontSize: 30, fontWeight: "900" },
  profileNameLarge: { color: "#111", fontSize: 22, fontWeight: "900", marginTop: 12, textAlign: "center" },
  profileRoleLarge: { color: "#5f6673", fontSize: 15, fontWeight: "600" },
  profileProperty: { color: "#7b8496", fontSize: 14, fontWeight: "700" },
  contactList: { alignSelf: "stretch", gap: 14, marginTop: 22 },
  profileContactRow: { minHeight: 34, flexDirection: "row", alignItems: "center", gap: 14 },
  profileContactIcon: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: "#f1f1f1" },
  profileContactText: { flex: 1, color: "#252a32", fontSize: 14, fontWeight: "600" },
  checkInPill: { alignSelf: "center", minWidth: 210, minHeight: 62, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 30, borderRadius: 31, backgroundColor: "#2f343c", shadowColor: "#111827", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.16, shadowRadius: 18, elevation: 5 },
  checkInPillText: { color: "#fff", fontSize: 21, fontWeight: "900" },
  businessCard: { padding: 16, gap: 14, borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 20, backgroundColor: "#fff", shadowColor: "#101828", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.07, shadowRadius: 12, elevation: 2 },
  profileRow: { flexDirection: "row", alignItems: "center", gap: 11 },
  profileAvatar: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: C.brand },
  profileAvatarText: { color: "#fff", fontSize: 14, fontWeight: "900" },
  profileName: { color: "#000", fontSize: 14, fontWeight: "800" },
  profileRole: { color: C.textSec, fontSize: 11, marginTop: 3 },
  contactRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  contactText: { flex: 1, color: C.textSec, fontSize: 11 },
  smsButton: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: C.brand },
  smsButtonText: { color: "#fff", fontSize: 10, fontWeight: "800" },
  metricsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
  metricCard: { width: (W - 47) / 2 },
  commandGrid: { flexDirection: "row", gap: 9 },
  commandButton: { flex: 1, minHeight: 92, justifyContent: "space-between", padding: 12, borderWidth: 1, borderColor: C.border, borderRadius: 16, backgroundColor: "#fff" },
  commandIcon: { width: 34, height: 34, alignItems: "center", justifyContent: "center", borderRadius: 10 },
  commandTitle: { color: C.text, fontSize: 13, fontWeight: "900" },
  commandSub: { color: C.textSec, fontSize: 10, fontWeight: "700", marginTop: 2 },
  focusStack: { gap: 9 },
  focusCard: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: 10, padding: 11, borderWidth: 1, borderColor: C.border, borderRadius: 14, backgroundColor: "#fff" },
  focusIcon: { width: 38, height: 38, alignItems: "center", justifyContent: "center", borderRadius: 12 },
  focusTitle: { color: C.text, fontSize: 13, fontWeight: "900" },
  focusMeta: { color: C.textSec, fontSize: 11, fontWeight: "700", marginTop: 3 },
  focusScore: { fontSize: 18, fontWeight: "900", fontVariant: ["tabular-nums"] },
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
  mediaTileWrap: { width: (W - 56) / 3 },
  mediaTile: { minHeight: 132, justifyContent: "space-between", gap: 8, padding: 8, borderRadius: 12, backgroundColor: "#eef4ff" },
  mediaThumb: { flex: 1, minHeight: 82, alignItems: "center", justifyContent: "center", position: "relative", overflow: "hidden", borderRadius: 10, backgroundColor: "rgba(255,255,255,0.55)" },
  mediaPreviewImage: { ...StyleSheet.absoluteFillObject, width: "100%", height: "100%" },
  mediaFallbackIcon: { width: 38, height: 38, alignItems: "center", justifyContent: "center", borderRadius: 19, backgroundColor: "#fff" },
  mediaPlayBadge: { position: "absolute", right: 7, bottom: 7, width: 24, height: 24, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "rgba(255,255,255,0.86)", borderRadius: 12, backgroundColor: "rgba(15,23,42,0.88)" },
  mediaLabel: { color: C.text, fontSize: 11, fontWeight: "700" },
  emptyInline: { color: C.textSec, fontSize: 12 },
  createButton: { minHeight: 50, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: C.brand },
  createButtonText: { color: "#fff", fontSize: 14, fontWeight: "800" },
  insightCard: { minHeight: 105, flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderWidth: 1, borderLeftWidth: 4, borderColor: C.brand, borderRadius: 16, backgroundColor: "#fff" },
  insightText: { color: C.text, fontSize: 14, lineHeight: 20, fontWeight: "600" },
  insightLink: { color: C.brand, fontSize: 12, fontWeight: "800", marginTop: 10 },
  sheetScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.42)" },
  sheetKeyboard: { flex: 1, justifyContent: "flex-end" },
  checkInSheet: { position: "relative", maxHeight: "88%", gap: 8, paddingHorizontal: 18, paddingTop: 4, paddingBottom: Platform.OS === "ios" ? 16 : 12, borderTopLeftRadius: 26, borderTopRightRadius: 26, backgroundColor: "#fff" },
  sheet: { paddingHorizontal: 18, paddingTop: 10, paddingBottom: Platform.OS === "ios" ? 34 : 20, borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: "#fff" },
  sheetHandleHitbox: { alignSelf: "stretch", alignItems: "center", justifyContent: "center", minHeight: 28, marginBottom: 6 },
  sheetHandle: { width: 44, height: 5, borderRadius: 3, backgroundColor: "#d1d5db" },
  sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
  sheetTitle: { color: "#111827", fontSize: 24, fontWeight: "900" },
  sheetSub: { color: "#7b8496", fontSize: 13, fontWeight: "700", marginTop: 2 },
  sheetClose: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 20, backgroundColor: "#fff" },
  sheetTabs: { flexDirection: "row", gap: 6, padding: 4, borderRadius: 17, backgroundColor: "#f3f4f6", marginBottom: 10 },
  sheetTab: { flex: 1, minHeight: 39, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, borderRadius: 13 },
  sheetTabActive: { backgroundColor: "#fff", shadowColor: "#101828", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 1 },
  sheetTabText: { color: C.textMuted, fontSize: 13, fontWeight: "900" },
  sheetTabTextActive: { color: C.brand },
  checkInSheetBody: { gap: 8 },
  checkInScroll: { flexShrink: 1, maxHeight: "100%" },
  checkInForm: { gap: 10, paddingBottom: 14 },
  skipButton: { alignSelf: "flex-end", paddingHorizontal: 8, paddingVertical: 2 },
  skipText: { color: "#0b0b0c", fontSize: 21, fontWeight: "900" },
  checkInHead: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 2 },
  formHeadAvatar: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 22, backgroundColor: "#111827" },
  formHeadText: { flex: 1, color: "#111318", fontSize: 17, lineHeight: 22, fontWeight: "900" },
  formRow2: { flexDirection: "row", gap: 9 },
  floatingField: { flex: 1, minHeight: 56, justifyContent: "center", paddingHorizontal: 14, borderWidth: 1, borderColor: "#d7dae3", borderRadius: 14, backgroundColor: "#fff" },
  floatingFieldHighlighted: { borderColor: C.brand, borderWidth: 2, shadowColor: C.brand, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 10, elevation: 2 },
  floatingLabel: { position: "absolute", left: 12, top: -8, paddingHorizontal: 5, color: "#4b5563", fontSize: 11, fontWeight: "900", backgroundColor: "#fff" },
  floatingInput: { color: "#111318", fontSize: 16, fontWeight: "600", paddingVertical: 0 },
  phoneRow: { flexDirection: "row", gap: 9 },
  phoneCc: { width: 84, minHeight: 56, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingHorizontal: 10, borderWidth: 1, borderColor: "#d7dae3", borderRadius: 14, backgroundColor: "#fff" },
  phoneFlag: { fontSize: 15 },
  phoneCcInput: { flex: 1, minWidth: 34, color: "#111318", fontSize: 15, fontWeight: "800", paddingVertical: 0 },
  phoneCcText: { color: "#111318", fontSize: 19, fontWeight: "800" },
  addJobButton: { minHeight: 42, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1, borderColor: "#d7d7d7", borderRadius: 999, backgroundColor: "#fff" },
  addJobText: { color: "#111318", fontSize: 13, fontWeight: "900" },
  nextButton: { minHeight: 52, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9, borderRadius: 999, backgroundColor: "#111" },
  nextButtonText: { color: "#fff", fontSize: 16, fontWeight: "900" },
  checkInDestination: { color: C.textMuted, fontSize: 9, fontWeight: "700", textAlign: "center" },
  stepHeader: { gap: 2, marginBottom: 2 },
  stepKicker: { color: C.brand, fontSize: 11, fontWeight: "900", textTransform: "uppercase" },
  questionTitle: { color: C.text, fontSize: 18, lineHeight: 23, fontWeight: "900" },
  questionField: { gap: 8 },
  questionLabel: { color: C.text, fontSize: 13, fontWeight: "900" },
  questionHint: { color: C.textMuted, fontSize: 11, fontWeight: "700", marginTop: -4 },
  questionOptions: { gap: 8, paddingRight: 8 },
  questionOption: { minHeight: 36, justifyContent: "center", paddingHorizontal: 12, borderWidth: 1, borderColor: "#d7dae3", borderRadius: 999, backgroundColor: "#fff" },
  questionOptionActive: { borderColor: C.brand, backgroundColor: "#eff6ff" },
  questionOptionText: { color: C.textSec, fontSize: 12, fontWeight: "800" },
  questionOptionTextActive: { color: C.brand },
  toggleRow: { minHeight: 40, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingHorizontal: 2 },
  toggleText: { flex: 1, color: C.text, fontSize: 12, fontWeight: "800" },
  fieldError: { color: C.red, fontSize: 12, fontWeight: "800" },
  buttonRow: { flexDirection: "row", gap: 10 },
  backBtn: { minWidth: 96, minHeight: 56, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#d7dae3", borderRadius: 13, backgroundColor: "#fff" },
  backBtnText: { color: C.text, fontSize: 15, fontWeight: "900" },
  questionProgress: { alignItems: "center", paddingTop: 2 },
  questionProgressText: { color: C.textMuted, fontSize: 11, fontWeight: "900" },
  floatingActionWrap: { flexDirection: "row", alignItems: "center", gap: 10, paddingTop: 10, paddingBottom: 2, backgroundColor: "#fff" },
  floatingBackButton: { width: 50, minHeight: 50, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#d7dae3", borderRadius: 999, backgroundColor: "#fff" },
  floatingNextButton: { flex: 1, minHeight: 52, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 14, backgroundColor: "#111" },
  donePanel: { alignItems: "center", gap: 13, paddingVertical: 10 },
  doneIcon: { width: 68, height: 68, alignItems: "center", justifyContent: "center", borderRadius: 34, backgroundColor: C.green },
  manualForm: { gap: 10 },
  sheetField: { minHeight: 50, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 13, borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 14, backgroundColor: "#fff" },
  sheetFieldMultiline: { minHeight: 82, alignItems: "flex-start", paddingTop: 14 },
  sheetInput: { flex: 1, color: C.text, fontSize: 14, fontWeight: "700", paddingVertical: 0 },
  sheetInputMultiline: { minHeight: 52, textAlignVertical: "top" },
  sheetPrimary: { minHeight: 52, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9, marginTop: 4, borderRadius: 16, backgroundColor: "#111" },
  sheetPrimaryText: { color: "#fff", fontSize: 15, fontWeight: "900" },
  qrPanel: { alignSelf: "stretch", alignItems: "center", gap: 12, paddingTop: 6 },
  qrCard: { width: 210, height: 210, alignItems: "center", justifyContent: "center", padding: 12, borderRadius: 24, backgroundColor: "#f8fafc" },
  qrImage: { width: "100%", height: "100%" },
  qrTitle: { color: C.text, fontSize: 18, fontWeight: "900" },
  qrSub: { maxWidth: 300, color: C.textSec, fontSize: 13, lineHeight: 19, fontWeight: "600", textAlign: "center" },
  qrShareGrid: { alignSelf: "stretch", width: "100%", flexDirection: "row", gap: 8, paddingTop: 4 },
  qrShareButton: { flex: 1, minWidth: 0, minHeight: 46, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 14, backgroundColor: "#fff" },
  qrShareButtonPrimary: { borderColor: C.brand, backgroundColor: C.brand },
  qrShareButtonText: { color: C.text, fontSize: 12, fontWeight: "900" },
  qrShareButtonPrimaryText: { color: "#fff", fontSize: 12, fontWeight: "900" },
});

const communitySt = StyleSheet.create({
  sheet: { minHeight: "70%", maxHeight: "84%", borderTopLeftRadius: 22, borderTopRightRadius: 22, backgroundColor: "#fff", paddingHorizontal: 14, paddingBottom: Platform.OS === "ios" ? 32 : 18 },
  handle: { width: 40, height: 4, alignSelf: "center", borderRadius: 2, backgroundColor: "#d0d5dd", marginTop: 11, marginBottom: 16 },
  header: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 14 },
  headerText: { flex: 1, minWidth: 0 },
  title: { color: C.text, fontSize: 21, lineHeight: 26, fontWeight: "900" },
  subtitle: { color: C.textSec, fontSize: 13, lineHeight: 18, fontWeight: "600", marginTop: 3 },
  closeButton: { width: 46, height: 46, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: C.border, borderRadius: 12, backgroundColor: C.card },
  searchBar: { minHeight: 52, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, borderWidth: 1, borderColor: C.border, borderRadius: 10, backgroundColor: C.card },
  searchInput: { flex: 1, minWidth: 0, color: C.text, fontSize: 16, fontWeight: "700", paddingVertical: 0 },
  list: { flex: 1, marginTop: 10 },
  listContent: { paddingBottom: 20 },
  row: { minHeight: 62, width: "100%", flexDirection: "row", alignItems: "center", gap: 11, paddingHorizontal: 0, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#f1f5f9" },
  iconBox: { width: 42, height: 42, flexShrink: 0, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: "#eef2ff" },
  rowText: { flex: 1, minWidth: 0, justifyContent: "center" },
  rowTitle: { color: C.text, fontSize: 15, lineHeight: 19, fontWeight: "900" },
  rowSub: { color: C.textSec, fontSize: 13, lineHeight: 17, fontWeight: "700", marginTop: 1 },
  rowAction: { width: 28, flexShrink: 0, alignItems: "flex-end", justifyContent: "center" },
});

const reviewSt = StyleSheet.create({
  root: { flex: 1, backgroundColor: tourColors.bg, paddingTop: Platform.OS === "ios" ? 50 : 18 },
  scrollBody: { flex: 1 },
  scrollContent: { paddingBottom: 150 },
  tabSticky: { backgroundColor: tourColors.bg, zIndex: 2 },
  tabBody: { gap: 13, paddingHorizontal: SESSION_PAGE_PADDING, paddingTop: 8 },
  header: { minHeight: 50, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16 },
  headerButton: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#e6eaf0", borderRadius: 12, backgroundColor: "#fff" },
  propertyPicker: { maxWidth: 210, minHeight: 36, flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 14, borderRadius: 999, backgroundColor: "#eef2f7" },
  propertyText: { flexShrink: 1, color: "#647084", fontSize: 14, fontWeight: "800" },
  titleRow: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 10 },
  title: { color: C.text, fontSize: 24, fontWeight: "900", letterSpacing: 0 },
  subtitle: { color: "#7b8496", fontSize: 13, fontWeight: "700", marginTop: 4 },
  reviewSummary: { flexDirection: "row", alignItems: "stretch", gap: 10, paddingHorizontal: 16, paddingBottom: 12 },
  scoreCompact: { width: 108, minHeight: 70, justifyContent: "center", paddingHorizontal: 14, borderWidth: 1, borderRadius: 16 },
  scoreCompactValue: { fontSize: 26, fontWeight: "900", lineHeight: 30, fontVariant: ["tabular-nums"] },
  scoreCompactLabel: { color: "#667085", fontSize: 10, fontWeight: "900", textTransform: "uppercase", marginTop: 2 },
  scorePill: { minWidth: 40, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, borderWidth: 1, alignItems: "center", borderCurve: "continuous" },
  scorePillText: { fontSize: 13, fontWeight: "900", fontVariant: ["tabular-nums"] },
  actionsCta: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderWidth: 1, borderColor: "#dbeafe", borderRadius: 16, backgroundColor: "#fff" },
  actionsCtaIcon: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: "#eff6ff" },
  actionsCtaTitle: { color: C.text, fontSize: 14, fontWeight: "900" },
  actionsCtaSub: { color: C.brand, fontSize: 11, fontWeight: "800", marginTop: 2 },
  actionCount: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 12, backgroundColor: "#eef2ff" },
  actionCountText: { color: "#4338ca", fontSize: 10, fontWeight: "800" },
  modeRow: { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingBottom: 12 },
  modeButton: { minHeight: 40, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: 13, paddingVertical: 8, borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 999, backgroundColor: "#fff" },
  modeButtonActive: { borderColor: "#bfdbfe", backgroundColor: "#eff6ff" },
  modeText: { color: "#667085", fontSize: 12, fontWeight: "900" },
  modeTextActive: { color: C.brand },
  transcriptContent: { gap: 13, paddingHorizontal: SESSION_PAGE_PADDING, paddingTop: 8, paddingBottom: 150 },
  phaseSection: { gap: 4 },
  phaseDivider: { flexDirection: "row", alignItems: "center", gap: 8, paddingTop: 10, paddingBottom: 7 },
  phaseDividerLine: { width: 4, height: 18, borderRadius: 2 },
  phaseDividerTitle: { flex: 1, fontSize: 12, fontWeight: "900", textTransform: "uppercase" },
  phaseDividerTime: { color: "#98a2b3", fontSize: 11, fontWeight: "800" },
  turnRow: { borderRadius: 12, backgroundColor: "transparent" },
  turnRowActive: { backgroundColor: "#eef6ff" },
  turnMain: { flexDirection: "row", alignItems: "flex-start", gap: 8, paddingVertical: 8, paddingHorizontal: 8 },
  turnInitialSlot: { width: 20, alignItems: "center", paddingTop: 1 },
  turnInitial: { fontSize: 12, fontWeight: "900" },
  turnMeta: { flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 3 },
  turnSpeaker: { fontSize: 12, fontWeight: "900" },
  segmentTime: { color: "#98a2b3", fontSize: 11, fontWeight: "800", marginLeft: "auto" },
  turnText: { color: "#344054", fontSize: 14, lineHeight: 20, fontWeight: "600" },
  turnActions: { width: 22, alignItems: "center", gap: 13, paddingTop: 2 },
  inlineComment: { flexDirection: "row", alignItems: "flex-start", gap: 7, marginLeft: 36, marginRight: 8, marginBottom: 7, padding: 9, borderRadius: 10, backgroundColor: "#eef6ff" },
  inlineCommentAuthor: { color: C.brand, fontSize: 10, fontWeight: "900" },
  inlineCommentBody: { color: C.text, fontSize: 12, lineHeight: 17, marginTop: 2 },
  inlineComposer: { flexDirection: "row", alignItems: "center", gap: 8, marginLeft: 36, marginRight: 8, marginBottom: 8 },
  inlineInput: { flex: 1, minHeight: 38, paddingHorizontal: 11, borderWidth: 1, borderColor: "#d7dee8", borderRadius: 9, color: C.text, fontSize: 13 },
  inlineSend: { width: 38, height: 38, alignItems: "center", justifyContent: "center", borderRadius: 19, backgroundColor: C.brand },
  coachingMoment: { gap: 9, marginVertical: 6, padding: 12, borderWidth: 1, borderColor: "#e9d5ff", borderRadius: 14, backgroundColor: "#fbf7ff" },
  coachingMomentCompact: { marginLeft: 36, marginRight: 8, marginTop: 2 },
  coachingMomentHeader: { flexDirection: "row", alignItems: "center", gap: 7 },
  coachingMomentIcon: { width: 22, height: 22, alignItems: "center", justifyContent: "center", borderRadius: 8, backgroundColor: C.purpleBg },
  coachingMomentKicker: { flex: 1, color: C.purple, fontSize: 11, fontWeight: "900", textTransform: "uppercase" },
  coachingMomentTime: { color: "#8b5cf6", fontSize: 11, fontWeight: "900" },
  coachingMomentBody: { color: C.text, fontSize: 13, fontWeight: "700", lineHeight: 19 },
  coachingSuggestion: { gap: 3, padding: 10, borderRadius: 10, backgroundColor: "#fff" },
  coachingSuggestionLabel: { color: C.purple, fontSize: 10, fontWeight: "900", textTransform: "uppercase" },
  coachingSuggestionText: { color: "#344054", fontSize: 13, fontWeight: "700", lineHeight: 18 },
  coachingQuote: { color: "#7b8496", fontSize: 12, lineHeight: 17, fontStyle: "italic" },
  coachingMomentActions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  coachingMomentAction: { color: C.purple, fontSize: 11, fontWeight: "900" },
  processingTimeline: { alignSelf: "stretch", flexDirection: "row", justifyContent: "space-between", gap: 8, marginTop: 2, paddingTop: 8 },
  processingStep: { flex: 1, alignItems: "center", gap: 6, minWidth: 58 },
  processingStepIcon: { width: 34, height: 34, alignItems: "center", justifyContent: "center", borderRadius: 17, borderWidth: 1, borderColor: "#e2e8f0", backgroundColor: "#fff" },
  processingStepIconActive: { borderColor: "#bfdbfe", backgroundColor: "#eff6ff" },
  processingStepIconDone: { borderColor: "#bbf7d0", backgroundColor: C.greenBg },
  processingStepText: { color: C.textMuted, fontSize: 10, lineHeight: 13, fontWeight: "800", textAlign: "center" },
  playerDock: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: Platform.OS === "ios" ? 26 : 14,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    backgroundColor: "rgba(255,255,255,0.98)",
    shadowColor: "#101828",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 12,
  },
  phaseTrack: { height: 5, borderRadius: 4, backgroundColor: "#f3f4f6", position: "relative", overflow: "hidden" },
  phaseSegment: { position: "absolute", top: 0, bottom: 0, borderRadius: 2, opacity: 0.92 },
  phasePlayhead: { position: "absolute", top: -2, bottom: -2, width: 2, backgroundColor: "#111827" },
  waveformTrack: { height: 24, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 3 },
  waveformBar: { width: 3, borderRadius: 2, backgroundColor: C.brand },
  time: { color: "#667085", fontSize: 12, fontWeight: "800", fontVariant: ["tabular-nums"] },
  playbackRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  playbackMeta: { flexDirection: "row", alignItems: "center", gap: 10, flexShrink: 1 },
  playbackControls: { flexDirection: "row", alignItems: "center", gap: 14 },
  speed: { minWidth: 28, color: C.text, fontSize: 13, fontWeight: "900" },
  playButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 22, backgroundColor: C.brand, shadowColor: C.brand, shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.2, shadowRadius: 8 },
});

const st = StyleSheet.create({
  root: { backgroundColor: C.bg, flex: 1 },
  flex1: { flex: 1 },
  center: { alignItems: "center", justifyContent: "center" },
  screenTransition: { flex: 1 },
  scroll: { gap: 14, paddingHorizontal: 18, paddingTop: 56, paddingBottom: 32 },
  mainScroll: { gap: 14, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 120 },
  pressed: { opacity: 0.76, transform: [{ scale: 0.99 }] },
  page: { gap: 14 },
  pulseDot: { width: 10, height: 10, borderRadius: 5 },
  shimmerCard: { minHeight: 76, justifyContent: "center", gap: 9, padding: 14, borderWidth: 1, borderColor: C.border, borderRadius: 12, backgroundColor: C.card },
  shimmerBar: { height: 12, borderRadius: 999, backgroundColor: "#e8eef7" },

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
  defaultRubricCard: { minHeight: 118, flexDirection: "row", alignItems: "center", gap: 13, padding: 16, borderWidth: 1, borderColor: "#e9d5ff", borderRadius: 18, backgroundColor: "#fbf7ff" },
  defaultRubricIcon: { width: 50, height: 50, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: C.purpleBg },
  defaultRubricTitle: { flex: 1, color: C.text, fontSize: 17, fontWeight: "900" },
  rubricGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  rubricCard: { width: "48%", minHeight: 146, justifyContent: "space-between", gap: 12, padding: 13, borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 16, backgroundColor: "#fff" },
  rubricCardBody: { gap: 4 },
  rubricCardTitle: { color: C.text, fontSize: 13, lineHeight: 17, fontWeight: "900" },
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
  callLiveBadge: { flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 100, backgroundColor: C.brand + "12" },
  callLiveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.brand },
  callLiveText: { color: C.brand, fontSize: 10, fontWeight: "900" },
  callCenter: { flex: 1, alignItems: "center", justifyContent: "center", paddingBottom: 12 },
  callMicHalo: { width: 128, height: 128, borderRadius: 64, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(79,70,229,0.17)", marginBottom: 24 },
  callMicCore: { width: 88, height: 88, borderRadius: 44, alignItems: "center", justifyContent: "center", backgroundColor: C.brand, shadowColor: C.brand, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.38, shadowRadius: 24, elevation: 8 },
  callTitle: { color: "#636366", fontSize: 20, fontWeight: "800", textTransform: "uppercase" },
  callTimer: { color: "#111", fontSize: 36, fontWeight: "800", fontVariant: ["tabular-nums"], marginTop: 18, textAlign: "center" },
  waveform: { height: 54, flexDirection: "row", alignItems: "center", gap: 5, marginTop: 22 },
  waveBar: { width: 3, borderRadius: 2, backgroundColor: C.brand },
  callCaption: { color: "#98a2b3", fontSize: 12, fontWeight: "600", marginTop: 7 },
  callControls: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-around" },
  callAction: { width: 82, alignItems: "center", gap: 8 },
  callActionButton: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(25,23,23,0.06)" },
  callActionCount: { position: "absolute", top: -3, right: -2, minWidth: 20, height: 20, paddingHorizontal: 5, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: C.brand, borderWidth: 2, borderColor: "#111318" },
  callActionCountText: { color: "#fff", fontSize: 10, fontWeight: "900" },
  callStopButton: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", backgroundColor: C.brand, shadowColor: C.brand, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.22, shadowRadius: 9 },
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
  communitySheet: { minHeight: "70%", overflow: "hidden" },
  communitySheetList: { paddingTop: 10, paddingBottom: 20 },
  communityEmpty: { alignItems: "center", gap: 8, paddingVertical: 32 },
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
  settingsCommunityRow: { flexDirection: "row", alignItems: "center", gap: 12, width: "100%" },
  settingsSectionLabel: { color: C.textMuted, fontSize: 10, fontWeight: "900", marginTop: 4 },
  communitySettingRow: { minHeight: 58, flexDirection: "row", alignItems: "center", gap: 11, paddingHorizontal: 12 },
  communitySettingIcon: { width: 34, height: 34, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: "#eef2ff" },
  communityRowBody: { flex: 1, minWidth: 0, gap: 2 },
  communitySettingName: { color: C.text, fontSize: 13, fontWeight: "800" },
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
