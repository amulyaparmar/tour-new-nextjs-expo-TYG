import { supportsLiveActivities } from "../runtime";

type LiveActivityModule = typeof import("expo-live-activity");

let activityId: string | undefined;
let recordingStartMs: number | undefined;
let liveActivityAvailable: boolean | undefined;

/** Tour brand colors + mark asset (see assets/liveActivity/tour-mark.png). */
const TOUR_LIVE_ACTIVITY = {
  imageName: "tour-mark",
  dynamicIslandImageName: "tour-mark",
  config: {
    backgroundColor: "006CE5",
    titleColor: "FFFFFF",
    subtitleColor: "FFFFFFCC",
    progressViewTint: "FFFFFF",
    progressViewLabelColor: "FFFFFF",
    // Open Tour back to the live recording experience from Lock Screen / Dynamic Island.
    deepLinkUrl: "tournewtouryoutyg://recording",
    timerType: "digital" as const,
    imagePosition: "right" as const,
    imageAlign: "center" as const,
    contentFit: "contain" as const,
  },
} as const;

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

function liveActivityState(_elapsed: number, isPaused: boolean, finished = false) {
  const state: import("expo-live-activity").LiveActivityState = {
    title: finished ? "Saved" : isPaused ? "Paused" : "Recording",
    imageName: TOUR_LIVE_ACTIVITY.imageName,
    dynamicIslandImageName: TOUR_LIVE_ACTIVITY.dynamicIslandImageName,
  };

  if (recordingStartMs && !isPaused && !finished) {
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
    const id = LiveActivity.startActivity(liveActivityState(0, false), TOUR_LIVE_ACTIVITY.config);
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
    LiveActivity.stopActivity(activityId!, liveActivityState(elapsed, false, true));
    activityId = undefined;
    recordingStartMs = undefined;
  });
}
