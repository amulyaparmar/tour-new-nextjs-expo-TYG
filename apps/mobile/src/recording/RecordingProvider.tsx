import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
  type RecordingOptions,
  type RecordingStatus,
} from "expo-audio";
import type { Material } from "../api";
import {
  startRecordingLiveActivity,
  stopRecordingLiveActivity,
  updateRecordingLiveActivity,
} from "./recordingLiveActivity";
import { supportsBackgroundRecording } from "../runtime";

export type LiveRecordingMeta = {
  sessionId: string | null;
  title: string;
  prospectName: string | null;
  propertyName: string | null;
  agentName: string | null;
  source: "create-session" | "session-detail";
};

export type LiveRecordingDraft = {
  notes: string;
  assets: Material[];
  selectedAssetIds: string[];
  /** Create-session only — used when uploading after stop. */
  prospect: string;
  location: string;
  rubricId: string | null;
};

export type LiveSessionSnapshot = {
  draft: LiveRecordingDraft;
  meta: LiveRecordingMeta;
  stop: () => Promise<{ uri: string; durationSec: number } | null>;
  clearLiveSession: () => void;
};

export type OpenLiveExperienceInput = {
  meta: LiveRecordingMeta;
  draft: LiveRecordingDraft;
  onBeforeRecordingStart?: () => void | Promise<void>;
  onMinimize?: () => void;
  onCancel: (snapshot: LiveSessionSnapshot) => void | Promise<void>;
  onFinish: (snapshot: LiveSessionSnapshot) => void | Promise<void>;
};

export const WAVEFORM_BAR_COUNT = 52;

export type RecordingCtx = {
  isRecording: boolean;
  isPaused: boolean;
  elapsed: number;
  metering: number;
  waveformLevels: number[];
  experienceVisible: boolean;
  liveMeta: LiveRecordingMeta | null;
  draft: LiveRecordingDraft | null;
  transcriptPreview: string;
  start: () => Promise<boolean>;
  togglePause: () => Promise<void>;
  stop: () => Promise<{ uri: string; durationSec: number } | null>;
  openExperience: (input: OpenLiveExperienceInput) => void;
  minimizeExperience: () => void;
  expandExperience: () => void;
  clearLiveSession: () => void;
  setLiveSessionId: (sessionId: string) => void;
  setTranscriptPreview: (text: string) => void;
  setDraftNotes: (notes: string) => void;
  addDraftAsset: (asset: Material, snippet: string) => void;
  runBeforeRecordingStart: () => void | Promise<void>;
  requestCancel: () => void;
  requestFinish: () => void;
};

const EMPTY_DRAFT: LiveRecordingDraft = {
  notes: "",
  assets: [],
  selectedAssetIds: [],
  prospect: "",
  location: "",
  rubricId: null,
};

const EMPTY_WAVEFORM = Array.from({ length: WAVEFORM_BAR_COUNT }, () => 0.08);

const EMPTY_CTX: RecordingCtx = {
  isRecording: false,
  isPaused: false,
  elapsed: 0,
  metering: 0,
  waveformLevels: EMPTY_WAVEFORM,
  experienceVisible: false,
  liveMeta: null,
  draft: null,
  transcriptPreview: "",
  start: async () => false,
  togglePause: async () => {},
  stop: async () => null,
  openExperience: () => {},
  minimizeExperience: () => {},
  expandExperience: () => {},
  clearLiveSession: () => {},
  setLiveSessionId: () => {},
  setTranscriptPreview: () => {},
  setDraftNotes: () => {},
  addDraftAsset: () => {},
  runBeforeRecordingStart: async () => {},
  requestCancel: () => {},
  requestFinish: () => {},
};

const RecordingContext = React.createContext<RecordingCtx>(EMPTY_CTX);

const RECORDING_OPTIONS: RecordingOptions = {
  ...RecordingPresets.HIGH_QUALITY,
  isMeteringEnabled: true,
  numberOfChannels: 1,
  bitRate: 48000,
  android: RecordingPresets.HIGH_QUALITY.android,
  ios: RecordingPresets.HIGH_QUALITY.ios,
  web: {
    ...RecordingPresets.HIGH_QUALITY.web,
    bitsPerSecond: 48000,
  },
};

/** Map expo-audio dB metering (~-160..0) into a 0..1 speech-friendly level. */
function normalizeMetering(db: number | undefined): number {
  if (db == null || !Number.isFinite(db)) return 0;
  const clamped = Math.max(-55, Math.min(0, db));
  return Math.pow((clamped + 55) / 55, 1.35);
}

async function configureRecordingAudioMode(active: boolean) {
  const baseMode = {
    allowsRecording: active,
    shouldPlayInBackground: active,
    playsInSilentMode: true,
    // mixWithOthers so live speech recognition can share the mic session
    // with expo-audio recording (doNotMix blocks SFSpeechRecognizer).
    interruptionMode: "mixWithOthers" as const,
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
  const [waveformLevels, setWaveformLevels] = useState<number[]>(EMPTY_WAVEFORM);
  const [experienceVisible, setExperienceVisible] = useState(false);
  const [liveMeta, setLiveMeta] = useState<LiveRecordingMeta | null>(null);
  const [draft, setDraft] = useState<LiveRecordingDraft | null>(null);
  const [transcriptPreview, setTranscriptPreviewState] = useState("");

  const startingRef = useRef(false);
  const stoppingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const liveActivityTickRef = useRef(0);
  const elapsedRef = useRef(0);
  const isPausedRef = useRef(false);
  const waveformLevelsRef = useRef<number[]>(EMPTY_WAVEFORM);
  const recorderRef = useRef<ReturnType<typeof useAudioRecorder> | null>(null);
  const beforeStartHandlerRef = useRef<(() => void | Promise<void>) | null>(null);
  const minimizeHandlerRef = useRef<(() => void) | null>(null);
  const cancelHandlerRef = useRef<((snapshot: LiveSessionSnapshot) => void | Promise<void>) | null>(null);
  const finishHandlerRef = useRef<((snapshot: LiveSessionSnapshot) => void | Promise<void>) | null>(null);
  const liveMetaRef = useRef<LiveRecordingMeta | null>(null);
  const draftRef = useRef<LiveRecordingDraft | null>(null);

  const resetLiveUi = useCallback(() => {
    setExperienceVisible(false);
    setLiveMeta(null);
    setDraft(null);
    setTranscriptPreviewState("");
    beforeStartHandlerRef.current = null;
    minimizeHandlerRef.current = null;
    cancelHandlerRef.current = null;
    finishHandlerRef.current = null;
    liveMetaRef.current = null;
    draftRef.current = null;
  }, []);

  const handleExternalStop = useCallback(
    (status: RecordingStatus) => {
      if (!status.isFinished || stoppingRef.current) return;

      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = undefined;

      stopRecordingLiveActivity(elapsedRef.current);
      setIsRecording(false);
      setIsPaused(false);
      setElapsed(0);
      elapsedRef.current = 0;
      isPausedRef.current = false;
      waveformLevelsRef.current = EMPTY_WAVEFORM;
      setWaveformLevels(EMPTY_WAVEFORM);
      resetLiveUi();
      void configureRecordingAudioMode(false).catch(() => {});
    },
    [resetLiveUi],
  );

  const recorder = useAudioRecorder(RECORDING_OPTIONS, handleExternalStop);
  recorderRef.current = recorder;
  const recorderState = useAudioRecorderState(recorder, 80);
  const metering = normalizeMetering(recorderState.metering);

  useEffect(() => {
    void configureRecordingAudioMode(false).catch(() => {});
  }, []);

  useEffect(() => {
    elapsedRef.current = elapsed;
  }, [elapsed]);

  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  useEffect(() => {
    liveMetaRef.current = liveMeta;
  }, [liveMeta]);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

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
      waveformLevelsRef.current = EMPTY_WAVEFORM;
      setWaveformLevels(EMPTY_WAVEFORM);
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
      waveformLevelsRef.current = EMPTY_WAVEFORM;
      setWaveformLevels(EMPTY_WAVEFORM);
      setExperienceVisible(false);
      return uri ? { uri, durationSec } : null;
    } catch {
      await configureRecordingAudioMode(false).catch(() => {});
      setIsRecording(false);
      setIsPaused(false);
      setElapsed(0);
      elapsedRef.current = 0;
      waveformLevelsRef.current = EMPTY_WAVEFORM;
      setWaveformLevels(EMPTY_WAVEFORM);
      setExperienceVisible(false);
      return null;
    } finally {
      stoppingRef.current = false;
    }
  }, [isRecording]);

  useEffect(() => {
    if (!isRecording || isPaused) {
      if (!isRecording) {
        waveformLevelsRef.current = EMPTY_WAVEFORM;
        setWaveformLevels(EMPTY_WAVEFORM);
      }
      return;
    }

    const nextLevel = Math.max(0.06, Math.min(1, metering * 0.92 + 0.08));
    const next = [...waveformLevelsRef.current.slice(1), nextLevel];
    waveformLevelsRef.current = next;
    setWaveformLevels(next);
  }, [isPaused, isRecording, metering]);

  const clearLiveSession = useCallback(() => {
    resetLiveUi();
  }, [resetLiveUi]);

  const buildSnapshot = useCallback((): LiveSessionSnapshot | null => {
    const meta = liveMetaRef.current;
    const currentDraft = draftRef.current;
    if (!meta || !currentDraft) return null;
    return {
      meta,
      draft: currentDraft,
      stop,
      clearLiveSession,
    };
  }, [clearLiveSession, stop]);

  const openExperience = useCallback((input: OpenLiveExperienceInput) => {
    liveMetaRef.current = input.meta;
    draftRef.current = input.draft;
    setLiveMeta(input.meta);
    setDraft(input.draft);
    beforeStartHandlerRef.current = input.onBeforeRecordingStart ?? null;
    minimizeHandlerRef.current = input.onMinimize ?? null;
    cancelHandlerRef.current = input.onCancel;
    finishHandlerRef.current = input.onFinish;
    setExperienceVisible(true);
  }, []);

  const minimizeExperience = useCallback(() => {
    setExperienceVisible(false);
    minimizeHandlerRef.current?.();
  }, []);

  const expandExperience = useCallback(() => {
    if (!liveMeta && !isRecording) return;
    setExperienceVisible(true);
  }, [isRecording, liveMeta]);

  const setLiveSessionId = useCallback((sessionId: string) => {
    setLiveMeta((current) => {
      const next = current ? { ...current, sessionId } : current;
      liveMetaRef.current = next;
      return next;
    });
  }, []);

  const setTranscriptPreview = useCallback((text: string) => {
    setTranscriptPreviewState(text.trim());
  }, []);

  const setDraftNotes = useCallback((notes: string) => {
    setDraft((current) => {
      const next = current ? { ...current, notes } : current;
      draftRef.current = next;
      return next;
    });
  }, []);

  const addDraftAsset = useCallback((asset: Material, snippet: string) => {
    setDraft((current) => {
      if (!current || current.selectedAssetIds.includes(asset.id)) return current;
      const notes = current.notes.trim() ? `${current.notes.trim()}\n\n${snippet}` : snippet;
      const next = {
        ...current,
        notes,
        selectedAssetIds: [...current.selectedAssetIds, asset.id],
      };
      draftRef.current = next;
      return next;
    });
  }, []);

  const runBeforeRecordingStart = useCallback(async () => {
    await beforeStartHandlerRef.current?.();
  }, []);

  const requestCancel = useCallback(() => {
    const snapshot = buildSnapshot();
    if (!snapshot) return;
    void cancelHandlerRef.current?.(snapshot);
  }, [buildSnapshot]);

  const requestFinish = useCallback(() => {
    const snapshot = buildSnapshot();
    if (!snapshot) return;
    void finishHandlerRef.current?.(snapshot);
  }, [buildSnapshot]);

  const ctx = useMemo(
    () => ({
      isRecording,
      isPaused,
      elapsed,
      metering,
      waveformLevels,
      experienceVisible,
      liveMeta,
      draft,
      transcriptPreview,
      start,
      togglePause,
      stop,
      openExperience,
      minimizeExperience,
      expandExperience,
      clearLiveSession,
      setLiveSessionId,
      setTranscriptPreview,
      setDraftNotes,
      addDraftAsset,
      runBeforeRecordingStart,
      requestCancel,
      requestFinish,
    }),
    [
      isRecording,
      isPaused,
      elapsed,
      metering,
      waveformLevels,
      experienceVisible,
      liveMeta,
      draft,
      transcriptPreview,
      start,
      togglePause,
      stop,
      openExperience,
      minimizeExperience,
      expandExperience,
      clearLiveSession,
      setLiveSessionId,
      setTranscriptPreview,
      setDraftNotes,
      addDraftAsset,
      runBeforeRecordingStart,
      requestCancel,
      requestFinish,
    ],
  );

  return <RecordingContext.Provider value={ctx}>{children}</RecordingContext.Provider>;
}

export function useRecording() {
  return React.useContext(RecordingContext);
}

export { EMPTY_DRAFT };
