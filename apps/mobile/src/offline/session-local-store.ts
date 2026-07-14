import { Directory, File, Paths } from "expo-file-system";

import type { LiveRecordingDraft, LiveRecordingMeta } from "../recording/RecordingProvider";

export type LocalSessionStatus =
  | "recording"
  | "ready_to_sync"
  | "syncing"
  | "uploaded"
  | "failed";

export type LocalSessionMeta = {
  localId: string;
  remoteSessionId: string | null;
  status: LocalSessionStatus;
  title: string;
  prospectName: string | null;
  propertyName: string | null;
  agentName: string | null;
  source: LiveRecordingMeta["source"];
  draft: LiveRecordingDraft;
  mimeType: string;
  fileName: string;
  durationSec: number | null;
  elapsedSec: number;
  recordingSourceUri: string | null;
  lastError: string | null;
  autoProcess: boolean;
  createdAt: string;
  updatedAt: string;
};

export type LocalSessionCheckpoint = {
  elapsedSec: number;
  recordingSourceUri: string | null;
  savedAt: string;
};

const SESSIONS_ROOT = "sessions";
const META_FILE = "meta.json";
const CHECKPOINT_FILE = "checkpoint.json";
const RECORDING_FILE = "recording.m4a";

function newLocalId(): string {
  return `local_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function sessionsRoot(): Directory {
  const dir = new Directory(Paths.document, SESSIONS_ROOT);
  if (!dir.exists) {
    dir.create({ intermediates: true, idempotent: true });
  }
  return dir;
}

function sessionDir(localId: string): Directory {
  return new Directory(sessionsRoot(), localId);
}

function metaFile(localId: string): File {
  return new File(sessionDir(localId), META_FILE);
}

function checkpointFile(localId: string): File {
  return new File(sessionDir(localId), CHECKPOINT_FILE);
}

export function recordingFile(localId: string): File {
  return new File(sessionDir(localId), RECORDING_FILE);
}

export function getRecordingUri(localId: string): string | null {
  try {
    const file = recordingFile(localId);
    return file.exists && file.size > 0 ? file.uri : null;
  } catch {
    return null;
  }
}

function readJsonFile<T>(file: File): T | null {
  try {
    if (!file.exists) return null;
    const raw = file.textSync();
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeJsonFile(file: File, value: unknown): void {
  const parent = file.parentDirectory;
  if (!parent.exists) {
    parent.create({ intermediates: true, idempotent: true });
  }
  if (!file.exists) {
    file.create({ intermediates: true });
  }
  file.write(JSON.stringify(value, null, 2));
}

export function readLocalSessionMeta(localId: string): LocalSessionMeta | null {
  return readJsonFile<LocalSessionMeta>(metaFile(localId));
}

export function writeLocalSessionMeta(meta: LocalSessionMeta): LocalSessionMeta {
  const next = { ...meta, updatedAt: new Date().toISOString() };
  writeJsonFile(metaFile(meta.localId), next);
  return next;
}

export function createLocalSession(input: {
  meta: LiveRecordingMeta;
  draft: LiveRecordingDraft;
  remoteSessionId?: string | null;
}): LocalSessionMeta {
  const now = new Date().toISOString();
  const localId = newLocalId();
  const dir = sessionDir(localId);
  if (!dir.exists) {
    dir.create({ intermediates: true, idempotent: true });
  }

  const record: LocalSessionMeta = {
    localId,
    remoteSessionId: input.remoteSessionId ?? input.meta.sessionId,
    status: "recording",
    title: input.meta.title || "Tour conversation",
    prospectName: input.meta.prospectName,
    propertyName: input.meta.propertyName,
    agentName: input.meta.agentName,
    source: input.meta.source,
    draft: input.draft,
    mimeType: "audio/m4a",
    fileName: `tour-${Date.now()}.m4a`,
    durationSec: null,
    elapsedSec: 0,
    recordingSourceUri: null,
    lastError: null,
    autoProcess: true,
    createdAt: now,
    updatedAt: now,
  };
  writeJsonFile(metaFile(localId), record);
  return record;
}

export function updateLocalSession(
  localId: string,
  patch: Partial<Omit<LocalSessionMeta, "localId" | "createdAt">>,
): LocalSessionMeta | null {
  const current = readLocalSessionMeta(localId);
  if (!current) return null;
  return writeLocalSessionMeta({ ...current, ...patch, localId: current.localId, createdAt: current.createdAt });
}

export function listLocalSessions(): LocalSessionMeta[] {
  try {
    const root = sessionsRoot();
    if (!root.exists) return [];
    const items = root.list();
    const sessions: LocalSessionMeta[] = [];
    for (const item of items) {
      // Session folders are directories named by localId.
      if (!("list" in item) || typeof (item as Directory).list !== "function") continue;
      const meta = readLocalSessionMeta(item.name);
      if (meta) sessions.push(meta);
    }
    return sessions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } catch {
    return [];
  }
}

export function listPendingSyncSessions(): LocalSessionMeta[] {
  return listLocalSessions().filter((session) =>
    session.status === "ready_to_sync" || session.status === "failed" || session.status === "syncing",
  );
}

export function listRecoverableRecordingSessions(): LocalSessionMeta[] {
  return listLocalSessions().filter((session) => {
    if (session.status !== "recording") return false;
    return Boolean(getRecordingUri(session.localId) || session.recordingSourceUri);
  });
}

export function writeCheckpoint(
  localId: string,
  elapsedSec: number,
  recordingSourceUri: string | null,
): LocalSessionCheckpoint | null {
  try {
    const checkpoint: LocalSessionCheckpoint = {
      elapsedSec,
      recordingSourceUri,
      savedAt: new Date().toISOString(),
    };
    writeJsonFile(checkpointFile(localId), checkpoint);
    updateLocalSession(localId, {
      elapsedSec,
      recordingSourceUri,
      draft: readLocalSessionMeta(localId)?.draft ?? {
        notes: "",
        assets: [],
        selectedAssetIds: [],
        participants: [],
        attachments: [],
        prospect: "",
        location: "",
        rubricId: null,
      },
    });
    return checkpoint;
  } catch {
    return null;
  }
}

/**
 * Best-effort copy of the in-progress or finished recorder URI into durable storage.
 * Safe to call while recording (may fail on some platforms while the file is locked).
 */
export function copyRecordingToDurableStore(localId: string, sourceUri: string | null | undefined): string | null {
  if (!sourceUri) return null;
  try {
    const source = new File(sourceUri);
    if (!source.exists || source.size <= 0) return null;

    const destination = recordingFile(localId);
    if (destination.exists) {
      try {
        destination.delete();
      } catch {
        // Fall through and attempt copy.
      }
    }
    source.copy(destination);
    if (!destination.exists || destination.size <= 0) return null;
    updateLocalSession(localId, { recordingSourceUri: sourceUri });
    return destination.uri;
  } catch {
    return null;
  }
}

export function markReadyToSync(
  localId: string,
  input: {
    durationSec: number;
    sourceUri?: string | null;
    remoteSessionId?: string | null;
    draft?: LiveRecordingDraft;
    fileName?: string;
    mimeType?: string;
  },
): LocalSessionMeta | null {
  const durableUri =
    copyRecordingToDurableStore(localId, input.sourceUri) ?? getRecordingUri(localId);
  if (!durableUri) {
    return updateLocalSession(localId, {
      status: "failed",
      lastError: "Recording file was not saved on device.",
      durationSec: input.durationSec,
      remoteSessionId: input.remoteSessionId ?? undefined,
      draft: input.draft,
    });
  }

  return updateLocalSession(localId, {
    status: "ready_to_sync",
    durationSec: input.durationSec,
    elapsedSec: input.durationSec,
    remoteSessionId: input.remoteSessionId ?? undefined,
    draft: input.draft,
    fileName: input.fileName,
    mimeType: input.mimeType ?? "audio/m4a",
    lastError: null,
  });
}

export function deleteLocalSession(localId: string): void {
  try {
    const dir = sessionDir(localId);
    if (dir.exists) dir.delete();
  } catch {
    // Best-effort cleanup.
  }
}

export function findLocalSessionByRemoteId(remoteSessionId: string): LocalSessionMeta | null {
  return listLocalSessions().find((session) => session.remoteSessionId === remoteSessionId) ?? null;
}
