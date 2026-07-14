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
import { AppState, type AppStateStatus } from "react-native";
import type { Material } from "../api";
import {
  copyRecordingToDurableStore,
  createLocalSession,
  deleteLocalSession,
  updateLocalSession,
  writeCheckpoint,
} from "../offline/session-local-store";
import { trackAnalyticsEvent } from "../analytics";
import {
  startRecordingLiveActivity,
  stopRecordingLiveActivity,
  updateRecordingLiveActivity,
} from "./recordingLiveActivity";
import { supportsBackgroundRecording } from "../runtime";

const CHECKPOINT_INTERVAL_MS = 30_000;
const DRAFT_CHECKPOINT_DEBOUNCE_MS = 1_000;

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
  localId: string | null;
  draft: LiveRecordingDraft;
  meta: LiveRecordingMeta;
  stop: () => Promise<{ uri: string; durationSec: number } | null>;
  clearLiveSession: () => void;
};

export type OpenLiveExperienceInput = {
  meta: LiveRecordingMeta;
  draft: LiveRecordingDraft;
  onBeforeRecordingStart?: () => void | Promise<void>;
  onUploadFile?: () => void | Promise<void>;
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
  localId: string | null;
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
  requestUploadFile: () => void;
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
  localId: null,
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
  requestUploadFile: () => {},
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
  const [localId, setLocalId] = useState<string | null>(null);
  const [transcriptPreview, setTranscriptPreviewState] = useState("");

  const startingRef = useRef(false);
  const stoppingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const checkpointTimerRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const draftCheckpointTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const liveActivityTickRef = useRef(0);
  const elapsedRef = useRef(0);
  const isPausedRef = useRef(false);
  const waveformLevelsRef = useRef<number[]>(EMPTY_WAVEFORM);
  const recorderRef = useRef<ReturnType<typeof useAudioRecorder> | null>(null);
  const beforeStartHandlerRef = useRef<(() => void | Promise<void>) | null>(null);
  const uploadFileHandlerRef = useRef<(() => void | Promise<void>) | null>(null);
  const minimizeHandlerRef = useRef<(() => void) | null>(null);
  const cancelHandlerRef = useRef<((snapshot: LiveSessionSnapshot) => void | Promise<void>) | null>(null);
  const finishHandlerRef = useRef<((snapshot: LiveSessionSnapshot) => void | Promise<void>) | null>(null);
  const liveMetaRef = useRef<LiveRecordingMeta | null>(null);
  const draftRef = useRef<LiveRecordingDraft | null>(null);
  const localIdRef = useRef<string | null>(null);
  const discardLocalOnClearRef = useRef(false);

  const resetLiveUi = useCallback(() => {
    setExperienceVisible(false);
    setLiveMeta(null);
    setDraft(null);
    setLocalId(null);
    localIdRef.current = null;
    setTranscriptPreviewState("");
    beforeStartHandlerRef.current = null;
    uploadFileHandlerRef.current = null;
    minimizeHandlerRef.current = null;
    cancelHandlerRef.current = null;
    finishHandlerRef.current = null;
    liveMetaRef.current = null;
    draftRef.current = null;
  }, []);

  const persistCheckpoint = useCallback((forceAudioCopy = false) => {
    const id = localIdRef.current;
    if (!id) return;
    const sourceUri = recorderRef.current?.uri ?? null;
    writeCheckpoint(id, elapsedRef.current, sourceUri);
    const draftSnapshot = draftRef.current;
    const metaSnapshot = liveMetaRef.current;
    if (draftSnapshot || metaSnapshot) {
      updateLocalSession(id, {
        draft: draftSnapshot ?? undefined,
        title: metaSnapshot?.title,
        prospectName: metaSnapshot?.prospectName,
        propertyName: metaSnapshot?.propertyName,
        agentName: metaSnapshot?.agentName,
        remoteSessionId: metaSnapshot?.sessionId ?? undefined,
        elapsedSec: elapsedRef.current,
        recordingSourceUri: sourceUri,
      });
    }
    if (forceAudioCopy || isPausedRef.current) {
      copyRecordingToDurableStore(id, sourceUri);
    } else {
      // Best-effort mid-recording copy; ignore lock failures.
      copyRecordingToDurableStore(id, sourceUri);
    }
  }, []);

  const clearCheckpointTimer = useCallback(() => {
    if (checkpointTimerRef.current) {
      clearInterval(checkpointTimerRef.current);
      checkpointTimerRef.current = undefined;
    }
    if (draftCheckpointTimerRef.current) {
      clearTimeout(draftCheckpointTimerRef.current);
      draftCheckpointTimerRef.current = undefined;
    }
  }, []);

  const startCheckpointTimer = useCallback(() => {
    clearCheckpointTimer();
    checkpointTimerRef.current = setInterval(() => {
      persistCheckpoint(false);
    }, CHECKPOINT_INTERVAL_MS);
  }, [clearCheckpointTimer, persistCheckpoint]);

  const scheduleDraftCheckpoint = useCallback(() => {
    if (draftCheckpointTimerRef.current) clearTimeout(draftCheckpointTimerRef.current);
    draftCheckpointTimerRef.current = setTimeout(() => {
      persistCheckpoint(false);
    }, DRAFT_CHECKPOINT_DEBOUNCE_MS);
  }, [persistCheckpoint]);

  const handleExternalStop = useCallback(
    (status: RecordingStatus) => {
      if (!status.isFinished || stoppingRef.current) return;

      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = undefined;
      clearCheckpointTimer();
      persistCheckpoint(true);

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
    [clearCheckpointTimer, persistCheckpoint, resetLiveUi],
  );

  const recorder = useAudioRecorder(RECORDING_OPTIONS, handleExternalStop);
  recorderRef.current = recorder;
  const recorderState = useAudioRecorderState(recorder, 80);
  const metering = normalizeMetering(recorderState.metering);
  const meteringRef = useRef(0);
  meteringRef.current = metering;

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

  useEffect(() => {
    localIdRef.current = localId;
  }, [localId]);

  useEffect(() => {
    const onAppState = (next: AppStateStatus) => {
      if (next === "background" || next === "inactive") {
        if (isRecording) persistCheckpoint(true);
      }
    };
    const sub = AppState.addEventListener("change", onAppState);
    return () => sub.remove();
  }, [isRecording, persistCheckpoint]);

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
      startRecordingLiveActivity(liveMetaRef.current?.title);
      startCheckpointTimer();
      void trackAnalyticsEvent("session_start_recording", {
        source: liveMetaRef.current?.source ?? "unknown",
      });
      // Persist initial recording pointer as soon as the file URI is available.
      setTimeout(() => persistCheckpoint(false), 500);

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
  }, [isRecording, onNotify, persistCheckpoint, startCheckpointTimer]);

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
      persistCheckpoint(false);
    } else {
      activeRecorder.pause();
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = undefined;
      setIsPaused(true);
      isPausedRef.current = true;
      updateRecordingLiveActivity(elapsedRef.current, true);
      persistCheckpoint(true);
    }
  }, [isPaused, isRecording, persistCheckpoint]);

  const stop = useCallback(async (): Promise<{ uri: string; durationSec: number } | null> => {
    const activeRecorder = recorderRef.current;
    if (!activeRecorder || !isRecording) return null;

    stoppingRef.current = true;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = undefined;
    clearCheckpointTimer();

    const durationSec = Math.max(1, elapsedRef.current);
    stopRecordingLiveActivity(durationSec);

    try {
      await activeRecorder.stop();
      await configureRecordingAudioMode(false);
      const uri = activeRecorder.uri;
      const id = localIdRef.current;
      if (id && uri) {
        copyRecordingToDurableStore(id, uri);
        writeCheckpoint(id, durationSec, uri);
      }
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
  }, [clearCheckpointTimer, isRecording]);

  useEffect(() => {
    if (!isRecording) {
      waveformLevelsRef.current = EMPTY_WAVEFORM;
      setWaveformLevels(EMPTY_WAVEFORM);
      return undefined;
    }

    const timer = setInterval(() => {
      const level = isPaused
        ? 0.08
        : Math.max(0.06, Math.min(1, meteringRef.current * 0.92 + 0.08));
      const next = [...waveformLevelsRef.current.slice(1), level];
      waveformLevelsRef.current = next;
      setWaveformLevels(next);
    }, 70);

    return () => clearInterval(timer);
  }, [isPaused, isRecording]);

  const clearLiveSession = useCallback(() => {
    clearCheckpointTimer();
    const id = localIdRef.current;
    if (id && discardLocalOnClearRef.current) {
      deleteLocalSession(id);
    }
    discardLocalOnClearRef.current = false;
    resetLiveUi();
  }, [clearCheckpointTimer, resetLiveUi]);

  const buildSnapshot = useCallback((): LiveSessionSnapshot | null => {
    const meta = liveMetaRef.current;
    const currentDraft = draftRef.current;
    if (!meta || !currentDraft) return null;
    return {
      localId: localIdRef.current,
      meta,
      draft: currentDraft,
      stop,
      clearLiveSession,
    };
  }, [clearLiveSession, stop]);

  const openExperience = useCallback((input: OpenLiveExperienceInput) => {
    discardLocalOnClearRef.current = false;
    const local = createLocalSession({
      meta: input.meta,
      draft: input.draft,
      remoteSessionId: input.meta.sessionId,
    });
    localIdRef.current = local.localId;
    setLocalId(local.localId);
    liveMetaRef.current = input.meta;
    draftRef.current = input.draft;
    setLiveMeta(input.meta);
    setDraft(input.draft);
    beforeStartHandlerRef.current = input.onBeforeRecordingStart ?? null;
    uploadFileHandlerRef.current = input.onUploadFile ?? null;
    minimizeHandlerRef.current = input.onMinimize ?? null;
    cancelHandlerRef.current = async (snapshot) => {
      discardLocalOnClearRef.current = true;
      await input.onCancel(snapshot);
    };
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
    const id = localIdRef.current;
    if (id) updateLocalSession(id, { remoteSessionId: sessionId });
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
    scheduleDraftCheckpoint();
  }, [scheduleDraftCheckpoint]);

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
    scheduleDraftCheckpoint();
  }, [scheduleDraftCheckpoint]);

  const runBeforeRecordingStart = useCallback(async () => {
    await beforeStartHandlerRef.current?.();
  }, []);

  const requestUploadFile = useCallback(() => {
    void uploadFileHandlerRef.current?.();
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
      localId,
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
      requestUploadFile,
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
      localId,
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
      requestUploadFile,
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
