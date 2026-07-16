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
    // Importing app first ensures native Firebase is registered before analytics.
    const appModule = await import("@react-native-firebase/app");
    const apps = appModule.getApps();
    if (apps.length === 0) {
      if (__DEV__) console.warn("[analytics] Firebase default app missing after native import");
      return null;
    }

    const analytics = await import("@react-native-firebase/analytics");
    await analytics.default().setAnalyticsCollectionEnabled(true);
    analyticsModule = {
      logEvent: async (name, params) => {
        const cleaned = Object.fromEntries(
          Object.entries(params ?? {}).filter(([, value]) => value != null),
        );
        await analytics.default().logEvent(name, cleaned);
        if (__DEV__) console.log(`[analytics] ${name}`, cleaned);
      },
      setUserId: async (id) => {
        await analytics.default().setUserId(id);
      },
    };
  } catch (error) {
    if (__DEV__) console.warn("[analytics] init failed", error);
    analyticsModule = null;
  }
  return analyticsModule;
}

export async function setAnalyticsUserId(userId: string | null) {
  try {
    const analytics = await ensureAnalytics();
    await analytics?.setUserId(userId);
  } catch (error) {
    if (__DEV__) console.warn("[analytics] setUserId failed", error);
  }
}

export async function trackAnalyticsEvent(name: string, params?: AnalyticsParams) {
  try {
    const analytics = await ensureAnalytics();
    await analytics?.logEvent(name, params);
  } catch (error) {
    if (__DEV__) console.warn(`[analytics] ${name} failed`, error);
  }
}
