import NetInfo from "@react-native-community/netinfo";
import { AppState, type AppStateStatus } from "react-native";

import {
  createSession,
  fetchSession,
  processSession,
  uploadRecording,
} from "../api";
import { promoteLocalRecordingToCache } from "../session-audio-cache";
import {
  getRecordingUri,
  listPendingSyncSessions,
  listRecoverableRecordingSessions,
  type LocalSessionMeta,
  updateLocalSession,
  writeLocalSessionMeta,
} from "./session-local-store";

type SyncListener = (event: {
  type: "started" | "item" | "done" | "error";
  localId?: string;
  remoteSessionId?: string | null;
  error?: string;
}) => void;

let draining = false;
let started = false;
const listeners = new Set<SyncListener>();

export function onSyncOutboxEvent(listener: SyncListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit(event: Parameters<SyncListener>[0]) {
  for (const listener of listeners) {
    try {
      listener(event);
    } catch {
      // Ignore listener errors.
    }
  }
}

export async function isOnline(): Promise<boolean> {
  const state = await NetInfo.fetch();
  return Boolean(state.isConnected && state.isInternetReachable !== false);
}

async function syncOne(session: LocalSessionMeta): Promise<LocalSessionMeta | null> {
  const recordingUri = getRecordingUri(session.localId);
  if (!recordingUri) {
    return updateLocalSession(session.localId, {
      status: "failed",
      lastError: "No durable recording found on device.",
    });
  }

  updateLocalSession(session.localId, { status: "syncing", lastError: null });
  emit({ type: "item", localId: session.localId, remoteSessionId: session.remoteSessionId });

  let remoteSessionId = session.remoteSessionId;

  try {
    if (!remoteSessionId) {
      const created = await createSession({
        title: session.title.trim() || "Tour conversation",
        prospectName: session.draft.prospect.trim() || session.prospectName,
        agentName: session.agentName,
        location: session.draft.location.trim() || session.propertyName,
        notes: session.draft.notes.trim() || null,
        rubricId: session.draft.rubricId,
      });
      remoteSessionId = created.session.id;
      updateLocalSession(session.localId, { remoteSessionId });
    } else {
      // Idempotent: skip upload if remote already has media.
      try {
        const { session: remote } = await fetchSession(remoteSessionId);
        if (remote.audioUrl || remote.videoUrl || remote.status === "uploaded" || remote.status === "analysis_ready" || remote.status === "reviewed" || remote.status === "transcribing" || remote.status === "segmenting" || remote.status === "analyzing") {
          const uploaded = updateLocalSession(session.localId, {
            status: "uploaded",
            lastError: null,
            remoteSessionId,
          });
          promoteLocalRecordingToCache(remoteSessionId, recordingUri);
          return uploaded;
        }
      } catch {
        // Continue with upload if status check fails.
      }
    }

    await uploadRecording(
      remoteSessionId,
      recordingUri,
      session.mimeType || "audio/m4a",
      session.fileName || `tour-${session.localId}.m4a`,
      session.durationSec ?? undefined,
    );

    promoteLocalRecordingToCache(remoteSessionId, recordingUri);

    if (session.autoProcess) {
      try {
        await processSession(remoteSessionId);
      } catch {
        // Upload succeeded; processing can be retried from session detail.
      }
    }

    return updateLocalSession(session.localId, {
      status: "uploaded",
      remoteSessionId,
      lastError: null,
    });
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Sync failed";
    return updateLocalSession(session.localId, {
      status: "failed",
      remoteSessionId,
      lastError: message,
    });
  }
}

export async function drainSyncOutbox(): Promise<void> {
  if (draining) return;
  if (!(await isOnline())) return;

  draining = true;
  emit({ type: "started" });
  try {
    // Promote interrupted recordings that already have durable audio into the outbox.
    for (const recoverable of listRecoverableRecordingSessions()) {
      if (getRecordingUri(recoverable.localId)) {
        writeLocalSessionMeta({
          ...recoverable,
          status: "ready_to_sync",
          durationSec: recoverable.durationSec ?? Math.max(1, recoverable.elapsedSec),
          updatedAt: new Date().toISOString(),
        });
      }
    }

    const pending = listPendingSyncSessions();
    for (const session of pending) {
      if (!(await isOnline())) break;
      await syncOne(session);
    }
    emit({ type: "done" });
  } catch (caught) {
    emit({
      type: "error",
      error: caught instanceof Error ? caught.message : "Sync failed",
    });
  } finally {
    draining = false;
  }
}

/** Sync a single local session immediately (e.g. right after stop when online). */
export async function syncLocalSessionNow(localId: string): Promise<LocalSessionMeta | null> {
  const pending = listPendingSyncSessions().find((session) => session.localId === localId)
    ?? listRecoverableRecordingSessions().find((session) => session.localId === localId);
  if (!pending) return null;
  if (!(await isOnline())) {
    return updateLocalSession(localId, { status: "ready_to_sync" });
  }
  return syncOne(pending);
}

export function startSyncOutbox(): () => void {
  if (started) return () => {};
  started = true;

  const netSub = NetInfo.addEventListener((state) => {
    if (state.isConnected && state.isInternetReachable !== false) {
      void drainSyncOutbox();
    }
  });

  const onAppState = (next: AppStateStatus) => {
    if (next === "active") void drainSyncOutbox();
  };
  const appSub = AppState.addEventListener("change", onAppState);

  void drainSyncOutbox();

  return () => {
    started = false;
    netSub();
    appSub.remove();
  };
}
