import { Platform } from "react-native";
import { formatElapsed } from "./formatElapsed";

type LiveActivityModule = typeof import("expo-live-activity");

let activityId: string | undefined;
let recordingStartMs: number | undefined;

const LIVE_ACTIVITY_CONFIG = {
  backgroundColor: "B91C1C",
  titleColor: "FFFFFF",
  subtitleColor: "FFFFFFCC",
  progressViewTint: "FFFFFF",
  progressViewLabelColor: "FFFFFF",
  timerType: "digital" as const,
};

function getLiveActivity(): LiveActivityModule | null {
  if (Platform.OS !== "ios") return null;
  try {
    return require("expo-live-activity") as LiveActivityModule;
  } catch {
    return null;
  }
}

function liveActivityState(elapsed: number, isPaused: boolean) {
  const subtitle = isPaused
    ? `Paused · ${formatElapsed(elapsed)}`
    : formatElapsed(elapsed);

  const state: import("expo-live-activity").LiveActivityState = {
    title: "Tour Recording",
    subtitle,
  };

  if (recordingStartMs && !isPaused) {
    state.progressBar = {
      date: recordingStartMs + 4 * 60 * 60 * 1000,
    };
  }

  return state;
}

export function startRecordingLiveActivity(): void {
  const LiveActivity = getLiveActivity();
  if (!LiveActivity) return;

  recordingStartMs = Date.now();
  const id = LiveActivity.startActivity(liveActivityState(0, false), LIVE_ACTIVITY_CONFIG);
  activityId = id ?? undefined;
}

export function updateRecordingLiveActivity(elapsed: number, isPaused: boolean): void {
  const LiveActivity = getLiveActivity();
  if (!LiveActivity || !activityId) return;

  LiveActivity.updateActivity(activityId, liveActivityState(elapsed, isPaused));
}

export function stopRecordingLiveActivity(elapsed: number): void {
  const LiveActivity = getLiveActivity();
  if (!LiveActivity || !activityId) return;

  LiveActivity.stopActivity(activityId, {
    title: "Tour Recording",
    subtitle: `Saved · ${formatElapsed(elapsed)}`,
  });
  activityId = undefined;
  recordingStartMs = undefined;
}
