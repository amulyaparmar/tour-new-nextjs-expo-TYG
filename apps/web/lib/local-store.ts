import "server-only";

import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { AnalysisResult, AudioInsights, AudioInsightsStatus, ConversationPhaseSegmentation, FollowUpAction, SessionAttachment, SessionDetail, SessionLead, SessionSource, SessionStatus, SessionSummary, AnalysisRun, AnalysisRunSummary, AnalysisRunTrigger } from "@tour/shared";
import { normalizeAudioInsights, normalizeAudioInsightsStatus, normalizeParticipantName } from "@tour/shared";

type TranscriptSegment = {
  id: string;
  sessionId: string;
  speaker: string;
  startTime: number;
  endTime: number;
  text: string;
};

type LocalAnalysisRun = AnalysisRunSummary & {
  result: AnalysisResult;
};

type StoreShape = {
  sessions: SessionDetail[];
  analyses: Record<string, AnalysisResult>;
  analysisRuns: Record<string, LocalAnalysisRun[]>;
  actions: FollowUpAction[];
  transcripts: Record<string, TranscriptSegment[]>;
  conversationPhases: Record<string, ConversationPhaseSegmentation>;
  audioInsights: Record<string, AudioInsights>;
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
        prospectName: normalizeParticipantName(session.prospectName),
        agentName: normalizeParticipantName(session.agentName),
        source: session.source ?? "manual",
        leads: session.leads ?? [],
        attachments: session.attachments ?? [],
        audioInsightsStatus: normalizeAudioInsightsStatus(session.audioInsightsStatus),
      })),
      analyses: parsed.analyses ?? {},
      analysisRuns: parsed.analysisRuns ?? {},
      actions: parsed.actions ?? [],
      transcripts: parsed.transcripts ?? {},
      conversationPhases: parsed.conversationPhases ?? {},
      audioInsights: parsed.audioInsights ?? {}
    };
  } catch {
    return {
      sessions: [],
      analyses: {},
      analysisRuns: {},
      actions: [],
      transcripts: {},
      conversationPhases: {},
      audioInsights: {}
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
  status?: SessionStatus;
  scheduledAt?: string | null;
  location?: string | null;
  prospectName?: string | null;
  agentName?: string | null;
  notes?: string | null;
  source?: SessionSource;
  leads?: SessionLead[];
  attachments?: SessionAttachment[];
  rubricId?: string | null;
  agentId?: string | null;
  propertyId?: string | null;
}): Promise<SessionSummary> {
  const store = await loadStore();
  const session: SessionDetail = {
    id: randomUUID(),
    title: input.title,
    prospectName: normalizeParticipantName(input.prospectName),
    agentName: normalizeParticipantName(input.agentName),
    scheduledAt: input.scheduledAt ?? null,
    location: input.location ?? null,
    status: input.status ?? "scheduled",
    source: input.source ?? "manual",
    leads: input.leads ?? [],
    attachments: input.attachments ?? [],
    rubricId: input.rubricId ?? null,
    agentId: input.agentId ?? null,
    propertyId: input.propertyId ?? null,
    overallScore: null,
    createdAt: new Date().toISOString(),
    audioInsightsStatus: "pending",
    cardSummary: null,
    performanceSummary: null,
    needsImprovement: null,
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
    agentName?: string | null;
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
  if (fields.prospectName !== undefined) session.prospectName = normalizeParticipantName(fields.prospectName);
  if (fields.agentName !== undefined) session.agentName = normalizeParticipantName(fields.agentName);
  if (fields.location !== undefined) session.location = fields.location;
  if (fields.notes !== undefined) session.notes = fields.notes;
  if (fields.rubricId !== undefined) session.rubricId = fields.rubricId;
  await saveStore(store);
}

export async function deleteLocalSession(sessionId: string) {
  const store = await loadStore();
  store.sessions = store.sessions.filter((item) => item.id !== sessionId);
  delete store.analyses[sessionId];
  delete store.analysisRuns[sessionId];
  delete store.transcripts[sessionId];
  delete store.conversationPhases[sessionId];
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

export async function findOpenLocalQrSession(
  cutoffIso: string,
  propertyId?: string | null,
  agentId?: string | null
): Promise<SessionSummary | null> {
  const store = await loadStore();
  return (
    store.sessions
      .filter(
        (session) =>
          session.source === "qr" &&
          session.status === "in_progress" &&
          (session.propertyId ?? null) === (propertyId ?? null) &&
          (session.agentId ?? null) === (agentId ?? null) &&
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

export async function addLocalSessionAttachment(sessionId: string, attachment: SessionAttachment) {
  const store = await loadStore();
  const session = store.sessions.find((item) => item.id === sessionId);
  if (!session) return;
  if (session.attachments.some((item) => item.id === attachment.id || (item.materialId && item.materialId === attachment.materialId))) return;
  session.attachments = [...session.attachments, attachment];
  await saveStore(store);
}

export async function updateLocalSessionLeadNotes(sessionId: string, createdAt: string, notes: string | null) {
  const store = await loadStore();
  const session = store.sessions.find((item) => item.id === sessionId);
  if (!session) return;
  session.leads = session.leads.map((lead) => lead.createdAt === createdAt ? { ...lead, notes } : lead);
  await saveStore(store);
}

export async function getLocalAnalysis(sessionId: string): Promise<AnalysisResult | null> {
  const store = await loadStore();
  const runs = store.analysisRuns[sessionId];
  if (runs?.length) {
    const current = runs.find((run) => run.isCurrent) ?? runs[runs.length - 1];
    return current?.result ?? null;
  }
  return store.analyses[sessionId] ?? null;
}

export async function listLocalAnalysisRuns(sessionId: string): Promise<AnalysisRunSummary[]> {
  const store = await loadStore();
  return [...(store.analysisRuns[sessionId] ?? [])]
    .sort((a, b) => b.version - a.version)
    .map(({ result: _result, ...summary }) => summary);
}

export async function getLocalAnalysisRun(
  sessionId: string,
  version?: string | number | null
): Promise<AnalysisRun | null> {
  const store = await loadStore();
  const runs = store.analysisRuns[sessionId] ?? [];
  if (!runs.length) {
    const legacy = store.analyses[sessionId];
    if (!legacy) return null;
    return {
      id: `${sessionId}-v1`,
      sessionId,
      version: 1,
      isCurrent: true,
      overallScore: legacy.overallScore,
      rubricId: null,
      rubricName: null,
      trigger: "initial",
      createdAt: new Date().toISOString(),
      result: legacy,
    };
  }

  const selected = resolveLocalAnalysisRun(runs, version);
  return selected ?? null;
}

function resolveLocalAnalysisRun(
  runs: LocalAnalysisRun[],
  version?: string | number | null
): LocalAnalysisRun | null {
  if (!version) {
    return runs.find((run) => run.isCurrent) ?? runs[runs.length - 1] ?? null;
  }

  const versionText = String(version);
  const byId = runs.find((run) => run.id === versionText);
  if (byId) return byId;

  const versionNumber = Number(versionText);
  if (!Number.isNaN(versionNumber)) {
    return runs.find((run) => run.version === versionNumber) ?? null;
  }

  return null;
}

export async function saveLocalAnalysisRun(
  sessionId: string,
  analysis: AnalysisResult,
  meta?: {
    rubricId?: string | null;
    rubricName?: string | null;
    trigger?: AnalysisRunTrigger;
  }
): Promise<{ runId: string; version: number }> {
  const store = await loadStore();
  const existing = store.analysisRuns[sessionId] ?? [];
  const version = existing.length > 0 ? Math.max(...existing.map((run) => run.version)) + 1 : 1;
  const trigger = meta?.trigger ?? (version > 1 ? "reanalyze" : "initial");
  const run: LocalAnalysisRun = {
    id: randomUUID(),
    sessionId,
    version,
    isCurrent: true,
    overallScore: analysis.overallScore,
    rubricId: meta?.rubricId ?? null,
    rubricName: meta?.rubricName ?? null,
    trigger,
    createdAt: new Date().toISOString(),
    result: analysis,
  };

  store.analysisRuns[sessionId] = existing.map((item) => ({ ...item, isCurrent: false }));
  store.analysisRuns[sessionId].push(run);
  store.analyses[sessionId] = analysis;

  const session = store.sessions.find((item) => item.id === sessionId);
  if (session) {
    session.status = "analysis_ready";
    session.overallScore = analysis.overallScore;
    session.cardSummary = analysis.cardSummary || null;
    session.performanceSummary = analysis.performanceSummary || null;
    session.needsImprovement = analysis.needsImprovement || null;
  }

  await saveStore(store);
  return { runId: run.id, version: run.version };
}

export async function upsertLocalAnalysis(sessionId: string, analysis: AnalysisResult) {
  await saveLocalAnalysisRun(sessionId, analysis);
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

export async function saveLocalConversationPhases(
  sessionId: string,
  segmentation: ConversationPhaseSegmentation
) {
  const store = await loadStore();
  store.conversationPhases[sessionId] = segmentation;
  await saveStore(store);
}

export async function getLocalConversationPhases(
  sessionId: string
): Promise<ConversationPhaseSegmentation | null> {
  const store = await loadStore();
  return store.conversationPhases[sessionId] ?? null;
}

export async function saveLocalAudioInsights(sessionId: string, insights: AudioInsights) {
  const store = await loadStore();
  store.audioInsights[sessionId] = insights;
  await saveStore(store);
}

export async function getLocalAudioInsights(sessionId: string): Promise<AudioInsights | null> {
  const store = await loadStore();
  return store.audioInsights[sessionId] ?? null;
}

export async function clearLocalAudioInsights(sessionId: string) {
  const store = await loadStore();
  delete store.audioInsights[sessionId];
  await saveStore(store);
}

export async function setLocalAudioInsightsStatus(
  sessionId: string,
  status: AudioInsightsStatus
) {
  const store = await loadStore();
  const session = store.sessions.find((item) => item.id === sessionId);
  if (!session) return;
  session.audioInsightsStatus = status;
  await saveStore(store);
}
