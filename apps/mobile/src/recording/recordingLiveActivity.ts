import { formatElapsed } from "./formatElapsed";
import { supportsLiveActivities } from "../runtime";

type LiveActivityModule = typeof import("expo-live-activity");

let activityId: string | undefined;
let recordingStartMs: number | undefined;
let liveActivityAvailable: boolean | undefined;

const LIVE_ACTIVITY_CONFIG = {
  backgroundColor: "B91C1C",
  titleColor: "FFFFFF",
  subtitleColor: "FFFFFFCC",
  progressViewTint: "FFFFFF",
  progressViewLabelColor: "FFFFFF",
  timerType: "digital" as const,
};

function getLiveActivity(): LiveActivityModule | null {
  if (!supportsLiveActivities()) return null;
  if (liveActivityAvailable === false) return null;

  try {
    return require("expo-live-activity") as LiveActivityModule;
  } catch {
    liveActivityAvailable = false;
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

function runLiveActivity(action: (LiveActivity: LiveActivityModule) => void): void {
  const LiveActivity = getLiveActivity();
  if (!LiveActivity) return;

  try {
    action(LiveActivity);
  } catch {
    liveActivityAvailable = false;
    activityId = undefined;
    recordingStartMs = undefined;
  }
}

export function startRecordingLiveActivity(): void {
  runLiveActivity((LiveActivity) => {
    recordingStartMs = Date.now();
    const id = LiveActivity.startActivity(liveActivityState(0, false), LIVE_ACTIVITY_CONFIG);
    activityId = id ?? undefined;
  });
}

export function updateRecordingLiveActivity(elapsed: number, isPaused: boolean): void {
  if (!activityId) return;
  runLiveActivity((LiveActivity) => {
    LiveActivity.updateActivity(activityId!, liveActivityState(elapsed, isPaused));
  });
}

export function stopRecordingLiveActivity(elapsed: number): void {
  if (!activityId) return;
  runLiveActivity((LiveActivity) => {
    LiveActivity.stopActivity(activityId!, {
      title: "Tour Recording",
      subtitle: `Saved · ${formatElapsed(elapsed)}`,
    });
    activityId = undefined;
    recordingStartMs = undefined;
  });
}
