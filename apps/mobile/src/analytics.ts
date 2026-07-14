import { isExpoGo } from "./runtime";

type AnalyticsParams = Record<string, string | number | boolean | null | undefined>;

let analyticsModule: {
  logEvent: (name: string, params?: AnalyticsParams) => Promise<void>;
  setUserId: (id: string | null) => Promise<void>;
} | null = null;
let initAttempted = false;

async function ensureAnalytics() {
  if (initAttempted) return analyticsModule;
  initAttempted = true;
  // Expo Go cannot load native Firebase. Debug/dev-client builds can.
  if (isExpoGo()) return null;

  try {
    const analytics = await import("@react-native-firebase/analytics");
    await analytics.default().setAnalyticsCollectionEnabled(true);
    analyticsModule = {
      logEvent: async (name, params) => {
        const cleaned = Object.fromEntries(
          Object.entries(params ?? {}).filter(([, value]) => value != null),
        );
        await analytics.default().logEvent(name, cleaned);
      },
      setUserId: async (id) => {
        await analytics.default().setUserId(id);
      },
    };
  } catch {
    analyticsModule = null;
  }
  return analyticsModule;
}

export async function setAnalyticsUserId(userId: string | null) {
  const analytics = await ensureAnalytics();
  await analytics?.setUserId(userId);
}

export async function trackAnalyticsEvent(name: string, params?: AnalyticsParams) {
  const analytics = await ensureAnalytics();
  await analytics?.logEvent(name, params);
}
