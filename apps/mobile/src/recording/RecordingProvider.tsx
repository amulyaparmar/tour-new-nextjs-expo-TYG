import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  type RecordingOptions,
  type RecordingStatus,
} from "expo-audio";
import {
  startRecordingLiveActivity,
  stopRecordingLiveActivity,
  updateRecordingLiveActivity,
} from "./recordingLiveActivity";
import { supportsBackgroundRecording } from "../runtime";

export type RecordingCtx = {
  isRecording: boolean;
  isPaused: boolean;
  elapsed: number;
  start: () => Promise<boolean>;
  togglePause: () => Promise<void>;
  stop: () => Promise<{ uri: string; durationSec: number } | null>;
};

const RecordingContext = React.createContext<RecordingCtx>({
  isRecording: false,
  isPaused: false,
  elapsed: 0,
  start: async () => false,
  togglePause: async () => {},
  stop: async () => null,
});

const RECORDING_OPTIONS: RecordingOptions = {
  ...RecordingPresets.HIGH_QUALITY,
  numberOfChannels: 1,
  bitRate: 48000,
  android: RecordingPresets.HIGH_QUALITY.android,
  ios: RecordingPresets.HIGH_QUALITY.ios,
  web: {
    ...RecordingPresets.HIGH_QUALITY.web,
    bitsPerSecond: 48000,
  },
};

async function configureRecordingAudioMode(active: boolean) {
  const baseMode = {
    allowsRecording: active,
    shouldPlayInBackground: active,
    playsInSilentMode: true,
    interruptionMode: "doNotMix" as const,
  };

  if (supportsBackgroundRecording()) {
    try {
      await setAudioModeAsync({ ...baseMode, allowsBackgroundRecording: active });
      return;
    } catch {
      // Dev client may reject background flags; fall back to foreground recording.
    }
  }

  try {
    await setAudioModeAsync(baseMode);
  } catch {
    // Ignore audio mode failures in Expo Go so recording can still be tested.
  }
}

type RecordingProviderProps = {
  children: React.ReactNode;
  onNotify?: (message: string, type?: "error" | "success" | "info") => void;
};

export function RecordingProvider({ children, onNotify }: RecordingProviderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  const startingRef = useRef(false);
  const stoppingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const liveActivityTickRef = useRef(0);
  const elapsedRef = useRef(0);
  const isPausedRef = useRef(false);
  const recorderRef = useRef<ReturnType<typeof useAudioRecorder> | null>(null);

  const handleExternalStop = useCallback((status: RecordingStatus) => {
    if (!status.isFinished || stoppingRef.current) return;

    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = undefined;

    stopRecordingLiveActivity(elapsedRef.current);
    setIsRecording(false);
    setIsPaused(false);
    setElapsed(0);
    elapsedRef.current = 0;
    isPausedRef.current = false;
    void configureRecordingAudioMode(false).catch(() => {});
  }, []);

  const recorder = useAudioRecorder(RECORDING_OPTIONS, handleExternalStop);
  recorderRef.current = recorder;

  useEffect(() => {
    void configureRecordingAudioMode(false).catch(() => {});
  }, []);

  useEffect(() => {
    elapsedRef.current = elapsed;
  }, [elapsed]);

  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  const start = useCallback(async () => {
    const activeRecorder = recorderRef.current;
    if (!activeRecorder || startingRef.current || isRecording) return false;

    startingRef.current = true;
    try {
      const { granted } = await requestRecordingPermissionsAsync();
      if (!granted) {
        onNotify?.("Microphone permission required", "error");
        return false;
      }

      await configureRecordingAudioMode(true);
      await activeRecorder.prepareToRecordAsync(RECORDING_OPTIONS);
      activeRecorder.record();

      setIsRecording(true);
      setIsPaused(false);
      setElapsed(0);
      elapsedRef.current = 0;
      liveActivityTickRef.current = 0;
      startRecordingLiveActivity();

      timerRef.current = setInterval(() => {
        setElapsed((current) => {
          const next = current + 1;
          elapsedRef.current = next;
          liveActivityTickRef.current += 1;
          if (liveActivityTickRef.current % 15 === 0) {
            updateRecordingLiveActivity(next, isPausedRef.current);
          }
          return next;
        });
      }, 1000);

      return true;
    } catch {
      onNotify?.("Could not start recording", "error");
      await configureRecordingAudioMode(false).catch(() => {});
      return false;
    } finally {
      startingRef.current = false;
    }
  }, [isRecording, onNotify]);

  const togglePause = useCallback(async () => {
    const activeRecorder = recorderRef.current;
    if (!activeRecorder || !isRecording) return;

    if (isPaused) {
      activeRecorder.record();
      timerRef.current = setInterval(() => {
        setElapsed((current) => {
          const next = current + 1;
          elapsedRef.current = next;
          liveActivityTickRef.current += 1;
          if (liveActivityTickRef.current % 15 === 0) {
            updateRecordingLiveActivity(next, false);
          }
          return next;
        });
      }, 1000);
      setIsPaused(false);
      isPausedRef.current = false;
      updateRecordingLiveActivity(elapsedRef.current, false);
    } else {
      activeRecorder.pause();
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = undefined;
      setIsPaused(true);
      isPausedRef.current = true;
      updateRecordingLiveActivity(elapsedRef.current, true);
    }
  }, [isPaused, isRecording]);

  const stop = useCallback(async (): Promise<{ uri: string; durationSec: number } | null> => {
    const activeRecorder = recorderRef.current;
    if (!activeRecorder || !isRecording) return null;

    stoppingRef.current = true;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = undefined;

    const durationSec = Math.max(1, elapsedRef.current);
    stopRecordingLiveActivity(durationSec);

    try {
      await activeRecorder.stop();
      await configureRecordingAudioMode(false);
      const uri = activeRecorder.uri;
      setIsRecording(false);
      setIsPaused(false);
      setElapsed(0);
      elapsedRef.current = 0;
      return uri ? { uri, durationSec } : null;
    } catch {
      await configureRecordingAudioMode(false).catch(() => {});
      setIsRecording(false);
      setIsPaused(false);
      setElapsed(0);
      elapsedRef.current = 0;
      return null;
    } finally {
      stoppingRef.current = false;
    }
  }, [isRecording]);

  const ctx = useMemo(
    () => ({ isRecording, isPaused, elapsed, start, togglePause, stop }),
    [isRecording, isPaused, elapsed, start, togglePause, stop]
  );

  return <RecordingContext.Provider value={ctx}>{children}</RecordingContext.Provider>;
}

export function useRecording() {
  return React.useContext(RecordingContext);
}
