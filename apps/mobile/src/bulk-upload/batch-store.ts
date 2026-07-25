import AsyncStorage from "@react-native-async-storage/async-storage";
import type { DocumentPickerAsset } from "expo-document-picker";
import {
  copyAsync,
  deleteAsync,
  documentDirectory,
  getInfoAsync,
  makeDirectoryAsync,
} from "expo-file-system/legacy";

import { createSession, fetchSession, uploadRecording } from "../api";
import { authenticatedFetch } from "../auth";

export type BulkBatchItemStatus =
  | "queued"
  | "creating"
  | "uploading"
  | "processing"
  | "ready"
  | "error"
  | "cancelled";

export type BulkBatchStatus = "draft" | "running" | "waiting" | "complete" | "partial";

export type BulkBatchItem = {
  id: string;
  sourceUri: string;
  localUri: string;
  mimeType: string;
  fileName: string;
  fileSize: number | null;
  title: string;
  prospectName: string;
  status: BulkBatchItemStatus;
  progress: number;
  sessionId: string | null;
  uploadedAt: string | null;
  overallScore: number | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BulkBatch = {
  id: string;
  communityId: string;
  name: string;
  propertyName: string;
  agentName: string | null;
  uploaderIsAgent: boolean;
  location: string;
  notes: string;
  rubricId: string | null;
  status: BulkBatchStatus;
  items: BulkBatchItem[];
  createdAt: string;
  updatedAt: string;
};

export type BulkBatchCounts = {
  total: number;
  queued: number;
  active: number;
  processing: number;
  ready: number;
  failed: number;
  cancelled: number;
};

const STORAGE_KEY = "@tour/mobile/bulk-batches/v1";
const BATCH_ROOT = "bulk-uploads";
const listeners = new Set<() => void>();
const runningBatches = new Set<string>();
let cachedBatches: BulkBatch[] | null = null;
let loadPromise: Promise<BulkBatch[]> | null = null;
let persistTail = Promise.resolve();

function localId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

function safeFilePart(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(-90) || "recording";
}

function defaultBatchName(date = new Date()) {
  return `Tour batch · ${date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

function emitChange() {
  for (const listener of listeners) listener();
}

async function loadAll(): Promise<BulkBatch[]> {
  if (cachedBatches) return cachedBatches;
  if (loadPromise) return loadPromise;
  loadPromise = AsyncStorage.getItem(STORAGE_KEY)
    .then((raw) => {
      if (!raw) return [];
      try {
        const parsed = JSON.parse(raw) as BulkBatch[];
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    })
    .then((batches) => {
      cachedBatches = batches;
      return batches;
    })
    .finally(() => {
      loadPromise = null;
    });
  return loadPromise;
}

function persist(batches: BulkBatch[]) {
  cachedBatches = batches;
  const payload = JSON.stringify(batches);
  persistTail = persistTail
    .catch(() => undefined)
    .then(() => AsyncStorage.setItem(STORAGE_KEY, payload));
  emitChange();
  return persistTail;
}

async function replaceBatch(batch: BulkBatch) {
  const batches = await loadAll();
  const updatedAt = new Date().toISOString();
  const nextBatch = { ...batch, updatedAt };
  const next = batches.some((item) => item.id === batch.id)
    ? batches.map((item) => item.id === batch.id ? nextBatch : item)
    : [nextBatch, ...batches];
  await persist(next);
  return nextBatch;
}

function batchDirectory(batchId: string) {
  return documentDirectory ? `${documentDirectory}${BATCH_ROOT}/${batchId}` : null;
}

async function durableAssetUri(batchId: string, itemId: string, asset: DocumentPickerAsset) {
  const directory = batchDirectory(batchId);
  if (!directory) return asset.uri;
  await makeDirectoryAsync(directory, { intermediates: true });
  const destination = `${directory}/${itemId}-${safeFilePart(asset.name ?? "recording")}`;
  await deleteAsync(destination, { idempotent: true }).catch(() => undefined);
  await copyAsync({ from: asset.uri, to: destination });
  const info = await getInfoAsync(destination);
  if (!info.exists) throw new Error(`Could not preserve ${asset.name ?? "recording"} on this device.`);
  return destination;
}

function recoverInterruptedItems(batch: BulkBatch): BulkBatch {
  let changed = false;
  const items = batch.items.map((item) => {
    if (item.status !== "creating" && item.status !== "uploading") return item;
    changed = true;
    return {
      ...item,
      status: "queued" as const,
      progress: item.uploadedAt ? 100 : 0,
      error: null,
    };
  });
  return changed ? { ...batch, status: "waiting", items } : batch;
}

export function subscribeBulkBatches(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export async function listBulkBatches(communityId: string) {
  const batches = await loadAll();
  return batches
    .filter((batch) => batch.communityId === communityId)
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
}

export async function getBulkBatch(batchId: string) {
  const batches = await loadAll();
  const found = batches.find((batch) => batch.id === batchId) ?? null;
  if (!found) return null;
  if (runningBatches.has(found.id)) return found;
  const recovered = recoverInterruptedItems(found);
  if (recovered !== found) return replaceBatch(recovered);
  return found;
}

export async function getLatestActiveBulkBatch(communityId: string) {
  const batches = await listBulkBatches(communityId);
  const found = batches.find((batch) => batch.status !== "complete") ?? null;
  if (!found) return null;
  if (runningBatches.has(found.id)) return found;
  const recovered = recoverInterruptedItems(found);
  if (recovered !== found) return replaceBatch(recovered);
  return found;
}

export async function appendBulkBatchAssets(batchId: string, assets: DocumentPickerAsset[]) {
  const batch = await getBulkBatch(batchId);
  if (!batch) throw new Error("This batch is no longer available.");
  const now = new Date().toISOString();
  const additions: BulkBatchItem[] = [];
  for (const [index, asset] of assets.entries()) {
    const itemId = localId(`file${batch.items.length + index + 1}`);
    const localUri = await durableAssetUri(batchId, itemId, asset);
    additions.push({
      id: itemId,
      sourceUri: asset.uri,
      localUri,
      mimeType: asset.mimeType ?? (asset.name?.toLowerCase().endsWith(".mp3") ? "audio/mpeg" : "video/mp4"),
      fileName: asset.name ?? `recording-${batch.items.length + index + 1}.mp4`,
      fileSize: asset.size ?? null,
      title: "",
      prospectName: "",
      status: "queued",
      progress: 0,
      sessionId: null,
      uploadedAt: null,
      overallScore: null,
      error: null,
      createdAt: now,
      updatedAt: now,
    });
  }
  return replaceBatch({
    ...batch,
    status: "draft",
    items: [...batch.items, ...additions],
  });
}

export async function createBulkBatch(input: {
  communityId: string;
  propertyName: string;
  agentName?: string | null;
  assets: DocumentPickerAsset[];
}) {
  const now = new Date().toISOString();
  const batchId = localId("batch");
  const items: BulkBatchItem[] = [];

  try {
    for (const [index, asset] of input.assets.entries()) {
      const itemId = localId(`file${index + 1}`);
      const localUri = await durableAssetUri(batchId, itemId, asset);
      items.push({
        id: itemId,
        sourceUri: asset.uri,
        localUri,
        mimeType: asset.mimeType ?? (asset.name?.toLowerCase().endsWith(".mp3") ? "audio/mpeg" : "video/mp4"),
        fileName: asset.name ?? `recording-${index + 1}.mp4`,
        fileSize: asset.size ?? null,
        title: "",
        prospectName: "",
        status: "queued",
        progress: 0,
        sessionId: null,
        uploadedAt: null,
        overallScore: null,
        error: null,
        createdAt: now,
        updatedAt: now,
      });
    }
  } catch (caught) {
    const directory = batchDirectory(batchId);
    if (directory) await deleteAsync(directory, { idempotent: true }).catch(() => undefined);
    throw caught;
  }

  const batch: BulkBatch = {
    id: batchId,
    communityId: input.communityId,
    name: defaultBatchName(),
    propertyName: input.propertyName,
    agentName: input.agentName?.trim() || null,
    uploaderIsAgent: false,
    location: input.propertyName,
    notes: "",
    rubricId: null,
    status: "draft",
    items,
    createdAt: now,
    updatedAt: now,
  };
  return replaceBatch(batch);
}

export async function updateBulkBatch(
  batchId: string,
  patch: Partial<Pick<BulkBatch, "name" | "location" | "notes" | "rubricId" | "uploaderIsAgent" | "agentName" | "status">>,
) {
  const batch = await getBulkBatch(batchId);
  if (!batch) throw new Error("This batch is no longer available.");
  return replaceBatch({ ...batch, ...patch });
}

export async function updateBulkBatchItem(
  batchId: string,
  itemId: string,
  patch: Partial<Pick<BulkBatchItem, "title" | "prospectName" | "status" | "progress" | "sessionId" | "uploadedAt" | "overallScore" | "error">>,
) {
  const batches = await loadAll();
  const batch = batches.find((item) => item.id === batchId);
  if (!batch) throw new Error("This batch is no longer available.");
  const now = new Date().toISOString();
  const items = batch.items.map((item) =>
    item.id === itemId ? { ...item, ...patch, updatedAt: now } : item
  );
  return replaceBatch({ ...batch, items });
}

export async function removeBulkBatchItem(batchId: string, itemId: string) {
  const batch = await getBulkBatch(batchId);
  if (!batch) return null;
  const item = batch.items.find((candidate) => candidate.id === itemId);
  if (item) await deleteAsync(item.localUri, { idempotent: true }).catch(() => undefined);
  return replaceBatch({ ...batch, items: batch.items.filter((candidate) => candidate.id !== itemId) });
}

export async function deleteBulkBatch(batchId: string) {
  const batches = await loadAll();
  const directory = batchDirectory(batchId);
  if (directory) await deleteAsync(directory, { idempotent: true }).catch(() => undefined);
  await persist(batches.filter((batch) => batch.id !== batchId));
}

export function bulkBatchCounts(batch: BulkBatch): BulkBatchCounts {
  return batch.items.reduce<BulkBatchCounts>(
    (counts, item) => {
      counts.total += 1;
      if (item.status === "queued" || item.status === "creating") counts.queued += 1;
      if (item.status === "creating" || item.status === "uploading") counts.active += 1;
      if (item.status === "processing") counts.processing += 1;
      if (item.status === "ready") counts.ready += 1;
      if (item.status === "error") counts.failed += 1;
      if (item.status === "cancelled") counts.cancelled += 1;
      return counts;
    },
    { total: 0, queued: 0, active: 0, processing: 0, ready: 0, failed: 0, cancelled: 0 },
  );
}

function nextBatchStatus(batch: BulkBatch): BulkBatchStatus {
  const counts = bulkBatchCounts(batch);
  if (counts.active > 0 || counts.queued > 0) return "running";
  if (counts.processing > 0) return "waiting";
  if (counts.ready + counts.cancelled === counts.total) return "complete";
  if (counts.failed > 0) return "partial";
  return batch.status;
}

async function processBatchItem(batchId: string, itemId: string) {
  let batch = await getBulkBatch(batchId);
  let item = batch?.items.find((candidate) => candidate.id === itemId);
  if (!batch || !item || item.status === "cancelled" || item.status === "ready") return;

  try {
    if (!item.sessionId) {
      await updateBulkBatchItem(batchId, itemId, { status: "creating", progress: 0, error: null });
      const scheduledAt = new Date();
      const created = await createSession({
        title: item.title.trim() || `Tour recording · ${scheduledAt.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`,
        titleIsAuto: !item.title.trim(),
        sourceFileName: item.fileName,
        scheduledAt: scheduledAt.toISOString(),
        prospectName: item.prospectName.trim() || null,
        agentName: batch.uploaderIsAgent ? batch.agentName : null,
        uploaderIsAgent: batch.uploaderIsAgent,
        location: batch.location.trim() || null,
        notes: batch.notes.trim() || null,
        rubricId: batch.rubricId,
      });
      await updateBulkBatchItem(batchId, itemId, { sessionId: created.session.id });
      item = { ...item, sessionId: created.session.id };
    }

    const sessionId = item.sessionId;
    if (!sessionId) throw new Error("Could not create a session for this recording.");

    let hasRemoteMedia = Boolean(item.uploadedAt);
    if (!hasRemoteMedia) {
      const remote = await fetchSession(sessionId).catch(() => null);
      hasRemoteMedia = Boolean(remote?.session.audioUrl || remote?.session.videoUrl)
        || Boolean(remote && !["scheduled", "in_progress"].includes(remote.session.status));
    }

    if (!hasRemoteMedia) {
      const file = await getInfoAsync(item.localUri);
      if (!file.exists) throw new Error("The saved recording is missing from this device.");
      await updateBulkBatchItem(batchId, itemId, { status: "uploading", progress: 0, error: null });
      await uploadRecording(
        sessionId,
        item.localUri,
        item.mimeType,
        item.fileName,
        undefined,
        (progress) => {
          void updateBulkBatchItem(batchId, itemId, {
            status: "uploading",
            progress: Math.max(0, Math.min(100, progress.percent)),
          });
        },
      );
      await updateBulkBatchItem(batchId, itemId, {
        uploadedAt: new Date().toISOString(),
        progress: 100,
      });
    }

    await updateBulkBatchItem(batchId, itemId, { status: "processing", progress: 100, error: null });
    const response = await authenticatedFetch(`/api/sessions/${sessionId}/process`, { method: "POST" });
    if (!response.ok) {
      const body = await response.json().catch(() => null) as { error?: string } | null;
      throw new Error(body?.error ?? "Could not start analysis.");
    }
  } catch (caught) {
    await updateBulkBatchItem(batchId, itemId, {
      status: "error",
      error: caught instanceof Error ? caught.message : "Upload failed.",
    });
  }
}

export async function refreshBulkBatch(batchId: string) {
  let batch = await getBulkBatch(batchId);
  if (!batch) return null;
  const refreshable = batch.items.filter((item) => item.sessionId && (item.status === "processing" || item.status === "ready"));
  await Promise.all(refreshable.map(async (item) => {
    const remote = await fetchSession(item.sessionId!).catch(() => null);
    if (!remote) return;
    const status = remote.session.status;
    if (status === "analysis_ready" || status === "reviewed") {
      await updateBulkBatchItem(batchId, item.id, {
        status: "ready",
        overallScore: remote.session.overallScore ?? remote.analysis?.overallScore ?? null,
        error: null,
      });
    } else if (status === "failed") {
      await updateBulkBatchItem(batchId, item.id, {
        status: "error",
        error: remote.session.analysisWorkflowError ?? "Analysis needs attention.",
      });
    }
  }));
  batch = await getBulkBatch(batchId);
  if (!batch) return null;
  return replaceBatch({ ...batch, status: nextBatchStatus(batch) });
}

export async function runBulkBatch(batchId: string, concurrency = 2) {
  if (runningBatches.has(batchId)) return getBulkBatch(batchId);
  runningBatches.add(batchId);
  try {
    let batch = await getBulkBatch(batchId);
    if (!batch) throw new Error("This batch is no longer available.");
    batch = await updateBulkBatch(batchId, { status: "running" });
    const pending = batch.items
      .filter((item) => item.status === "queued" || item.status === "error")
      .map((item) => item.id);
    let cursor = 0;
    const workerCount = Math.max(1, Math.min(concurrency, pending.length));
    await Promise.all(Array.from({ length: workerCount }, async () => {
      while (cursor < pending.length) {
        const itemId = pending[cursor];
        cursor += 1;
        if (itemId) await processBatchItem(batchId, itemId);
      }
    }));
    return refreshBulkBatch(batchId);
  } finally {
    runningBatches.delete(batchId);
  }
}

export async function cancelQueuedBulkItems(batchId: string) {
  const batch = await getBulkBatch(batchId);
  if (!batch) return null;
  const now = new Date().toISOString();
  const items = batch.items.map((item) =>
    item.status === "queued" || item.status === "error"
      ? { ...item, status: "cancelled" as const, error: null, updatedAt: now }
      : item
  );
  return replaceBatch({ ...batch, items, status: nextBatchStatus({ ...batch, items }) });
}
