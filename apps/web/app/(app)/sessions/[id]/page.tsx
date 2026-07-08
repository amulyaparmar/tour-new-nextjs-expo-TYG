import Link from "next/link";
import { Download } from "lucide-react";

import { SESSION_STATUS_LABELS } from "@tour/shared";

import { getTranscriptForSession } from "@/lib/evidence";
import { listVisibleMaterials } from "@/lib/materials";
import { getRubricForSession } from "@/lib/rubrics";
import { enrichSessionWithAgentName, sessionParticipants } from "@/lib/session-participants";
import { getAnalysisRun, getAudioInsights, getConversationPhases, getSessionById, listAnalysisRuns } from "@/lib/sessions";
import { getRecordingUrl, isLegacyLocalUrl } from "@/lib/storage";
import { AnalysisVersionSelector } from "./AnalysisVersionSelector";
import { DeleteSessionButton } from "./DeleteSessionButton";
import { EditSessionForm } from "./EditSessionForm";
import { EditSessionParticipants } from "./EditSessionParticipants";
import { SessionDetailExperience } from "./SessionDetailExperience";
import { SessionScoreSummary } from "./SessionScoreSummary";
import styles from "./session-detail.module.css";
import { UploadAndProcess, type NoteAsset, type SessionDetailDefaults } from "./UploadAndProcess";
import { requireTourWorkspace } from "@/lib/tour-auth";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ version?: string }>;
};

export default async function SessionDetailPage({ params, searchParams }: Props) {
  const workspace = await requireTourWorkspace();
  const { id } = await params;
  const { version: versionParam } = await searchParams;
  const rawSession = await getSessionById(id);

  if (!rawSession || rawSession.propertyId !== workspace.community.id) {
    return (
      <>
        <Link href="/sessions" className="back-link">&larr; Sessions</Link>
        <h1 style={{ fontSize: 20 }}>Session not found</h1>
      </>
    );
  }

  const session = await enrichSessionWithAgentName(rawSession, workspace);
  const participants = sessionParticipants(session.agentName, session.prospectName);

  const analysisRun = await getAnalysisRun(id, versionParam ?? null);
  const analysis = analysisRun?.result ?? null;
  const analysisRuns = analysis ? await listAnalysisRuns(id) : [];
  const viewingHistoricalVersion = Boolean(
    analysisRun && !analysisRun.isCurrent && analysisRuns.length > 1
  );

  const isScheduled = session.status === "scheduled" || session.status === "in_progress";
  const hasRecording = !isScheduled;
  const hasAnalysis = !!analysis;
  const isProcessing = ["uploaded", "transcribing", "segmenting", "analyzing"].includes(session.status);
  const defaults = !hasAnalysis ? getSessionDetailDefaults(session) : null;
  const noteAssetsPromise = !hasAnalysis ? getNoteAssets() : Promise.resolve<NoteAsset[]>([]);
  const detailDataPromise: Promise<[
    Awaited<ReturnType<typeof getTranscriptForSession>>,
    string | null,
    Awaited<ReturnType<typeof getRubricForSession>> | null,
    Awaited<ReturnType<typeof getConversationPhases>>,
    Awaited<ReturnType<typeof getAudioInsights>>,
  ]> = hasAnalysis
    ? Promise.all([
      getTranscriptForSession(id),
      resolveRecordingUrl(id, session.videoUrl, session.audioUrl),
      getRubricForSession(analysisRun?.rubricId ?? session.rubricId),
      getConversationPhases(id),
      getAudioInsights(id),
    ])
    : Promise.resolve([[], null, null, null, null]);

  const [noteAssets, [transcript, recordingUrl, rubric, phases, audioInsights]] = await Promise.all([
    noteAssetsPromise,
    detailDataPromise,
  ]);

  return (
    <div className={hasAnalysis ? `${styles.page} ${styles.pageExperience}` : styles.page}>
      <Link href="/sessions" className="back-link">&larr; Back to Sessions</Link>

      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h1 className={styles.title}>{session.title}</h1>
          <p className={styles.meta}>
            {session.scheduledAt
              ? new Date(session.scheduledAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
              : "Unscheduled"}
            {session.agentName ? ` · ${session.agentName} · Agent` : ""}
            {session.prospectName ? ` · ${session.prospectName} · Prospect` : ""}
            {session.location ? ` · ${session.location}` : ""}
          </p>
        </div>
        <div className={styles.headerRight}>
          <EditSessionParticipants
            sessionId={id}
            agentName={session.agentName}
            prospectName={session.prospectName}
          />
          {hasAnalysis && analysisRuns.length > 0 && (
            <AnalysisVersionSelector
              sessionId={id}
              runs={analysisRuns}
              selectedVersion={analysisRun?.version ?? null}
            />
          )}
          <span className={`badge badge-${session.status}`}>{SESSION_STATUS_LABELS[session.status]}</span>
          {hasAnalysis && session.status === "analysis_ready" && (
            <button type="button" className={`btn btn-outline btn-sm ${styles.downloadBtn}`}>
              <Download size={14} /> Export
            </button>
          )}
          <DeleteSessionButton sessionId={id} />
        </div>
      </div>

      {!hasAnalysis && isScheduled && (
        <UploadAndProcess sessionId={id} hasRecording={false} variant="new-session" defaults={defaults ?? undefined} noteAssets={noteAssets} />
      )}

      {!hasAnalysis && !isScheduled && (
        <UploadAndProcess sessionId={id} hasRecording={hasRecording} defaults={defaults ?? undefined} noteAssets={noteAssets} />
      )}

      {hasAnalysis && (
        <>
          {viewingHistoricalVersion && analysisRun && (
            <p className={styles.analysisVersionBanner}>
              Viewing analysis v{analysisRun.version}
              {analysisRun.rubricName ? ` (${analysisRun.rubricName})` : ""}
              {" · "}
              <Link href={`/sessions/${encodeURIComponent(id)}`}>View current</Link>
            </p>
          )}
          <SessionScoreSummary analysis={analysis} />
          <SessionDetailExperience
            sessionId={id}
            analysis={analysis}
            transcript={transcript}
            recordingUrl={recordingUrl}
            videoUrl={session.videoUrl}
            audioUrl={session.audioUrl}
            duration={session.duration ?? estimateDuration(analysis.exactMoments)}
            phases={phases}
            initialAudioInsightsStatus={session.audioInsightsStatus}
            initialAudioInsights={audioInsights}
            participants={participants}
            rubric={rubric ? { id: rubric.id, name: rubric.name, analysisModel: rubric.analysisModel } : null}
          />
        </>
      )}

      {!hasAnalysis && !isProcessing && hasRecording && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-header"><h2>Session Details</h2></div>
          <div className="card-body">
            <EditSessionForm
              sessionId={id}
              title={session.title}
              scheduledAt={session.scheduledAt}
              agentName={session.agentName}
              prospectName={session.prospectName}
              location={session.location}
              notes={session.notes}
            />
          </div>
        </div>
      )}
    </div>
  );
}

async function getNoteAssets(): Promise<NoteAsset[]> {
  const materials = await listVisibleMaterials();
  return materials
    .map((material): NoteAsset | null => {
      const url = material.media?.videoUrl ?? material.media?.iframeUrl ?? material.fileUrl ?? null;
      if (!url) return null;
      return {
        id: material.id,
        name: material.name,
        description: material.description,
        url
      };
    })
    .filter((asset): asset is NoteAsset => asset !== null)
    .slice(0, 10);
}

function getSessionDetailDefaults(
  session: NonNullable<Awaited<ReturnType<typeof getSessionById>>>
): SessionDetailDefaults {
  const lead = session.leads?.[0];
  const prospectName = session.prospectName || lead?.name || "";
  const agentName = session.agentName || "";
  const location = session.location || lead?.reason?.replace(/^Tour\s+/i, "") || "";
  const title = session.title || [location || "Tour", prospectName].filter(Boolean).join(" - ");

  return {
    title,
    agentName,
    prospectName,
    location
  };
}

function estimateDuration(moments: Array<{ timestamp: string }>): number {
  let maxSec = 0;
  for (const m of moments) {
    const sec = parseTimestampToSeconds(m.timestamp);
    if (sec > maxSec) maxSec = sec;
  }
  return maxSec > 0 ? maxSec + 60 : 0;
}

function parseTimestampToSeconds(ts: string): number {
  const parts = ts.split(":").map(Number);
  if (parts.length === 2 && parts.every((n) => !isNaN(n))) return parts[0]! * 60 + parts[1]!;
  if (parts.length === 3 && parts.every((n) => !isNaN(n))) return parts[0]! * 3600 + parts[1]! * 60 + parts[2]!;
  return -1;
}

async function resolveRecordingUrl(
  sessionId: string,
  videoUrl: string | null,
  audioUrl: string | null
): Promise<string | null> {
  const stored = videoUrl || audioUrl;
  const proxied = await getRecordingUrl(sessionId);
  if (proxied) return proxied;

  if (stored && !isLegacyLocalUrl(stored)) {
    if (stored.startsWith("http") || stored.startsWith("/api/sessions/")) return stored;
  }
  return null;
}
