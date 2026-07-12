import { supportsLiveActivities } from "../runtime";

type LiveActivityModule = typeof import("expo-live-activity");

let activityId: string | undefined;
let recordingStartMs: number | undefined;
let recordingSessionTitle = "Tour conversation";
let liveActivityAvailable: boolean | undefined;

/** Tour brand colors. Native SwiftUI supplies the play-mark lockup. */
const TOUR_LIVE_ACTIVITY = {
  config: {
    // Deep Tour blue keeps the white wordmark crisp and gives the #4D8AE5
    // play mark enough contrast on the Lock Screen notification card.
    backgroundColor: "0B2740",
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
    title: recordingSessionTitle,
    subtitle: finished ? "Saved" : isPaused ? "Paused" : "Recording",
  };

  if (recordingStartMs && !isPaused && !finished) {
    state.progressBar = {
      // The native Tour widget treats this as the recording start timestamp
      // and renders an elapsed timer that counts upward.
      date: recordingStartMs,
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

export function startRecordingLiveActivity(sessionTitle?: string | null): void {
  runLiveActivity((LiveActivity) => {
    recordingStartMs = Date.now();
    recordingSessionTitle = sessionTitle?.trim() || "Tour conversation";
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
    recordingSessionTitle = "Tour conversation";
  });
}
