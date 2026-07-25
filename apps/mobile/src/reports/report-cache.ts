import AsyncStorage from "@react-native-async-storage/async-storage";
import { deleteAsync, getInfoAsync } from "expo-file-system/legacy";

import { downloadSessionReportPdf } from "../api";

export type CachedSessionReport = {
  key: string;
  sessionId: string;
  sessionTitle: string;
  version: number | null;
  uri: string;
  filename: string;
  createdAt: string;
};

const STORAGE_KEY = "@tour/mobile/session-reports/v1";

function reportKey(sessionId: string, version?: number | null) {
  return `${sessionId}:${version == null ? "current" : version}`;
}

async function readIndex() {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return [] as CachedSessionReport[];
  try {
    const parsed = JSON.parse(raw) as CachedSessionReport[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeIndex(entries: CachedSessionReport[]) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

export async function getCachedSessionReport(sessionId: string, version?: number | null) {
  const key = reportKey(sessionId, version);
  const entries = await readIndex();
  const entry = entries.find((candidate) => candidate.key === key) ?? null;
  if (!entry) return null;
  const info = await getInfoAsync(entry.uri).catch(() => null);
  if (info?.exists) return entry;
  await writeIndex(entries.filter((candidate) => candidate.key !== key));
  return null;
}

export async function prepareSessionReport(input: {
  sessionId: string;
  sessionTitle: string;
  version?: number | null;
  refresh?: boolean;
}) {
  const key = reportKey(input.sessionId, input.version);
  const entries = await readIndex();
  const existing = entries.find((candidate) => candidate.key === key) ?? null;
  if (!input.refresh && existing) {
    const info = await getInfoAsync(existing.uri).catch(() => null);
    if (info?.exists) return existing;
  }

  const downloaded = await downloadSessionReportPdf(input.sessionId, input.sessionTitle, input.version);
  const entry: CachedSessionReport = {
    key,
    sessionId: input.sessionId,
    sessionTitle: input.sessionTitle,
    version: input.version ?? null,
    uri: downloaded.uri,
    filename: downloaded.filename,
    createdAt: new Date().toISOString(),
  };
  const previous = entries.find((candidate) => candidate.key === key);
  if (previous?.uri && previous.uri !== entry.uri) {
    await deleteAsync(previous.uri, { idempotent: true }).catch(() => undefined);
  }
  await writeIndex([entry, ...entries.filter((candidate) => candidate.key !== key)].slice(0, 30));
  return entry;
}
