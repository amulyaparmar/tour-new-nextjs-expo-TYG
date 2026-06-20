import "server-only";

import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { AnalysisResult, FollowUpAction, SessionDetail, SessionLead, SessionSource, SessionSummary } from "@tour/shared";

type TranscriptSegment = {
  id: string;
  sessionId: string;
  speaker: string;
  startTime: number;
  endTime: number;
  text: string;
};

type StoreShape = {
  sessions: SessionDetail[];
  analyses: Record<string, AnalysisResult>;
  actions: FollowUpAction[];
  transcripts: Record<string, TranscriptSegment[]>;
};

const STORE_PATH = path.join(process.cwd(), ".codex", "local-session-store.json");

async function loadStore(): Promise<StoreShape> {
  try {
    const raw = await readFile(STORE_PATH, "utf8");
    const parsed = JSON.parse(raw) as StoreShape;
    return {
      // Sessions saved before source/leads existed are normalized on load.
      sessions: (parsed.sessions ?? []).map((session) => ({
        ...session,
        source: session.source ?? "manual",
        leads: session.leads ?? []
      })),
      analyses: parsed.analyses ?? {},
      actions: parsed.actions ?? [],
      transcripts: parsed.transcripts ?? {}
    };
  } catch {
    return {
      sessions: [],
      analyses: {},
      actions: [],
      transcripts: {}
    };
  }
}

async function saveStore(store: StoreShape) {
  await mkdir(path.dirname(STORE_PATH), { recursive: true });
  await writeFile(STORE_PATH, JSON.stringify(store, null, 2), "utf8");
}

export async function listLocalSessions(): Promise<SessionSummary[]> {
  const store = await loadStore();
  return [...store.sessions].sort((a, b) => {
    const aDate = a.scheduledAt ? new Date(a.scheduledAt).getTime() : 0;
    const bDate = b.scheduledAt ? new Date(b.scheduledAt).getTime() : 0;
    return bDate - aDate;
  });
}

export async function createLocalSession(input: {
  title: string;
  scheduledAt?: string | null;
  location?: string | null;
  prospectName?: string | null;
  notes?: string | null;
  source?: SessionSource;
  leads?: SessionLead[];
  rubricId?: string | null;
}): Promise<SessionSummary> {
  const store = await loadStore();
  const session: SessionDetail = {
    id: randomUUID(),
    title: input.title,
    prospectName: input.prospectName ?? null,
    scheduledAt: input.scheduledAt ?? null,
    location: input.location ?? null,
    status: "scheduled",
    source: input.source ?? "manual",
    leads: input.leads ?? [],
    rubricId: input.rubricId ?? null,
    overallScore: null,
    createdAt: new Date().toISOString(),
    notes: input.notes ?? null,
    videoUrl: null,
    audioUrl: null,
    duration: null
  };

  store.sessions.unshift(session);
  await saveStore(store);
  return session;
}

export async function getLocalSessionById(sessionId: string): Promise<SessionDetail | null> {
  const store = await loadStore();
  return store.sessions.find((session) => session.id === sessionId) ?? null;
}

export async function updateLocalSession(
  sessionId: string,
  fields: {
    title?: string;
    scheduledAt?: string | null;
    prospectName?: string | null;
    location?: string | null;
    notes?: string | null;
    rubricId?: string | null;
  }
) {
  const store = await loadStore();
  const session = store.sessions.find((item) => item.id === sessionId);
  if (!session) return;
  if (fields.title !== undefined) session.title = fields.title;
  if (fields.scheduledAt !== undefined) session.scheduledAt = fields.scheduledAt;
  if (fields.prospectName !== undefined) session.prospectName = fields.prospectName;
  if (fields.location !== undefined) session.location = fields.location;
  if (fields.notes !== undefined) session.notes = fields.notes;
  if (fields.rubricId !== undefined) session.rubricId = fields.rubricId;
  await saveStore(store);
}

export async function deleteLocalSession(sessionId: string) {
  const store = await loadStore();
  store.sessions = store.sessions.filter((item) => item.id !== sessionId);
  delete store.analyses[sessionId];
  delete store.transcripts[sessionId];
  store.actions = store.actions.filter((action) => action.sessionId !== sessionId);
  await saveStore(store);
}

export async function setLocalSessionStatus(
  sessionId: string,
  status: SessionDetail["status"],
  overallScore?: number
) {
  const store = await loadStore();
  const session = store.sessions.find((item) => item.id === sessionId);
  if (!session) {
    return;
  }
  session.status = status;
  if (typeof overallScore === "number") {
    session.overallScore = overallScore;
  }
  await saveStore(store);
}

export async function findOpenLocalQrSession(cutoffIso: string): Promise<SessionSummary | null> {
  const store = await loadStore();
  return (
    store.sessions
      .filter(
        (session) =>
          session.source === "qr" &&
          session.status === "scheduled" &&
          session.createdAt >= cutoffIso
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null
  );
}

export async function addLocalSessionLead(sessionId: string, lead: SessionLead) {
  const store = await loadStore();
  const session = store.sessions.find((item) => item.id === sessionId);
  if (!session) return;
  session.leads = [...(session.leads ?? []), lead];
  await saveStore(store);
}

export async function getLocalAnalysis(sessionId: string): Promise<AnalysisResult | null> {
  const store = await loadStore();
  return store.analyses[sessionId] ?? null;
}

export async function upsertLocalAnalysis(sessionId: string, analysis: AnalysisResult) {
  const store = await loadStore();
  store.analyses[sessionId] = analysis;
  const session = store.sessions.find((item) => item.id === sessionId);
  if (session) {
    session.status = "analysis_ready";
    session.overallScore = analysis.overallScore;
  }
  await saveStore(store);
}

export async function listLocalActions(sessionId: string): Promise<FollowUpAction[]> {
  const store = await loadStore();
  return store.actions.filter((action) => action.sessionId === sessionId);
}

export async function replaceLocalActions(
  sessionId: string,
  actions: Array<Omit<FollowUpAction, "id" | "sessionId" | "createdAt">>
) {
  const store = await loadStore();
  store.actions = store.actions.filter((action) => action.sessionId !== sessionId);
  const now = new Date().toISOString();
  const rows: FollowUpAction[] = actions.map((action) => ({
    id: randomUUID(),
    sessionId,
    title: action.title,
    description: action.description,
    priority: action.priority,
    status: action.status,
    suggestedMessage: action.suggestedMessage,
    createdAt: now
  }));
  store.actions.unshift(...rows);
  await saveStore(store);
}

export async function updateLocalActionStatus(actionId: string, status: FollowUpAction["status"]) {
  const store = await loadStore();
  const action = store.actions.find((item) => item.id === actionId);
  if (!action) {
    return;
  }
  action.status = status;
  await saveStore(store);
}

export async function saveLocalTranscript(sessionId: string, segments: TranscriptSegment[]) {
  const store = await loadStore();
  store.transcripts[sessionId] = segments;
  await saveStore(store);
}

export async function getLocalTranscript(sessionId: string): Promise<TranscriptSegment[]> {
  const store = await loadStore();
  return store.transcripts[sessionId] ?? [];
}
