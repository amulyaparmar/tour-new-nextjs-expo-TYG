import Link from "next/link";

import { SESSION_STATUS_LABELS } from "@tour/shared";

import { getScreenshotsForSession, getTranscriptForSession } from "@/lib/evidence";
import { getAnalysisBySessionId, getSessionById, listFollowUpActions } from "@/lib/sessions";
import { GenerateAnalysisButton } from "./GenerateAnalysisButton";
import { ActionStatusButtons } from "./ActionStatusButtons";
import { DetailTabs } from "./DetailTabs";
import { UploadAndProcess } from "./UploadAndProcess";

type Props = { params: Promise<{ id: string }> };

export default async function SessionDetailPage({ params }: Props) {
  const { id } = await params;
  const session = await getSessionById(id);

  if (!session) {
    return (
      <>
        <Link href="/sessions" className="back-link">← Sessions</Link>
        <h1 style={{ fontSize: 20 }}>Session not found</h1>
      </>
    );
  }

  const analysis = await getAnalysisBySessionId(id);
  const actions = await listFollowUpActions(id);
  const transcript = getTranscriptForSession(id);
  const screenshots = getScreenshotsForSession(id);

  const hasRecording = session.status !== "scheduled";
  const hasAnalysis = !!analysis;

  return (
    <>
      <Link href="/sessions" className="back-link">← Back to Sessions</Link>

      {/* ── Header ── */}
      <div className="page-header">
        <h1>{session.title}</h1>
        <p>
          <span className={`badge badge-${session.status}`} style={{ marginRight: 6 }}>
            {SESSION_STATUS_LABELS[session.status]}
          </span>
          {session.scheduledAt
            ? new Date(session.scheduledAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
            : "Unscheduled"}
          {session.prospectName ? ` · ${session.prospectName}` : ""}
        </p>
      </div>

      {/* ── Upload / Process (always visible if no analysis yet) ── */}
      {!hasAnalysis && (
        <div style={{ marginBottom: 16 }}>
          <UploadAndProcess sessionId={id} hasRecording={hasRecording} />
        </div>
      )}

      {/* ── Tabs ── */}
      <DetailTabs
        tabs={[
          {
            id: "overview",
            label: "Summary",
            content: <SummaryTab session={session} analysis={analysis} actions={actions} sessionId={id} />
          },
          {
            id: "transcript",
            label: "Transcript",
            content: <TranscriptTab transcript={transcript} />
          },
          {
            id: "evidence",
            label: "Evidence",
            content: <EvidenceTab screenshots={screenshots} />
          },
          {
            id: "actions",
            label: "Actions",
            content: <ActionsTab actions={actions} sessionId={id} />
          }
        ]}
      />
    </>
  );
}

/* ─── Summary tab ───────────────────────────────────────── */
function SummaryTab({
  session,
  analysis,
  actions,
  sessionId
}: {
  session: NonNullable<Awaited<ReturnType<typeof getSessionById>>>;
  analysis: Awaited<ReturnType<typeof getAnalysisBySessionId>>;
  actions: Awaited<ReturnType<typeof listFollowUpActions>>;
  sessionId: string;
}) {
  return (
    <>
      {/* Video placeholder */}
      <div className="video-placeholder" style={{ marginBottom: 16 }}>
        <button type="button" className="video-play-btn">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="white"><polygon points="8,5 20,12 8,19" /></svg>
        </button>
      </div>

      {/* Score + summary */}
      {analysis ? (
        <div className="card" style={{ marginBottom: 12 }}>
          <div className="card-body" style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div className="score-ring">
              <span className="score-ring-value">{analysis.overallScore}</span>
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: "var(--slate-700)" }}>{analysis.summary}</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="card" style={{ marginBottom: 12 }}>
          <div className="card-body" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 13, color: "var(--slate-400)" }}>No analysis yet</span>
            <GenerateAnalysisButton sessionId={sessionId} />
          </div>
        </div>
      )}

      {/* Section scores */}
      {analysis && analysis.sectionScores.length > 0 && (
        <div className="card" style={{ marginBottom: 12 }}>
          <div className="card-header"><h2>Section Scores</h2></div>
          <div className="card-body">
            {analysis.sectionScores.map((sec) => (
              <div key={sec.section} className="section-score-row">
                <span className="section-score-label">{sec.section}</span>
                <div className="section-score-bar">
                  <div className="section-score-fill" style={{ width: `${sec.score}%` }} />
                </div>
                <span className="section-score-value">{sec.score}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Strengths + Opportunities */}
      {analysis && (
        <>
          <div className="card" style={{ marginBottom: 12 }}>
            <div className="card-header"><h2>Strengths</h2></div>
            <div className="card-body">
              <ul className="feedback-list strength-list">
                {analysis.strengths.map((s) => <li key={s}>{s}</li>)}
              </ul>
            </div>
          </div>
          <div className="card" style={{ marginBottom: 12 }}>
            <div className="card-header"><h2>Opportunities</h2></div>
            <div className="card-body">
              <ul className="feedback-list opportunity-list">
                {analysis.opportunities.map((o) => <li key={o}>{o}</li>)}
              </ul>
            </div>
          </div>
        </>
      )}

      {/* Key moments */}
      {analysis && analysis.exactMoments.length > 0 && (
        <div className="card" style={{ marginBottom: 12 }}>
          <div className="card-header"><h2>Key Moments</h2></div>
          <div className="card-body">
            {analysis.exactMoments.map((m) => (
              <div key={`${m.timestamp}-${m.transcriptQuote}`} className="moment-card">
                <div className="moment-timestamp">{m.timestamp}</div>
                <div className="moment-quote">&ldquo;{m.transcriptQuote}&rdquo;</div>
                <div className="moment-explanation">{m.explanation}</div>
                <div className="moment-suggestion">{m.suggestedImprovement}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Session info */}
      <div className="card">
        <div className="card-header"><h2>Details</h2></div>
        <div className="card-body">
          <div style={{ display: "grid", gap: 8 }}>
            <div className="detail-stat">
              <span className="detail-stat-label">Prospect</span>
              <span className="detail-stat-value">{session.prospectName ?? "—"}</span>
            </div>
            <div className="detail-stat">
              <span className="detail-stat-label">Location</span>
              <span className="detail-stat-value">{session.location ?? "—"}</span>
            </div>
            {session.notes && (
              <div className="detail-stat">
                <span className="detail-stat-label">Notes</span>
                <span className="detail-stat-value">{session.notes}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

/* ─── Transcript tab ────────────────────────────────────── */
function TranscriptTab({ transcript }: { transcript: ReturnType<typeof getTranscriptForSession> }) {
  return (
    <div className="card">
      <div className="card-header"><h2>Transcript</h2></div>
      <div className="card-body">
        {transcript.length === 0 ? (
          <div className="empty-state">No transcript available.</div>
        ) : (
          transcript.map((seg) => (
            <div key={seg.id} className="transcript-line">
              <span className="transcript-time">{fmtSec(seg.startTime)}</span>
              <span className="transcript-speaker">{seg.speaker}</span>
              <span className="transcript-text">{seg.text}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/* ─── Evidence tab ──────────────────────────────────────── */
function EvidenceTab({ screenshots }: { screenshots: ReturnType<typeof getScreenshotsForSession> }) {
  return (
    <div className="card">
      <div className="card-header"><h2>Screenshot Evidence</h2></div>
      <div className="card-body">
        {screenshots.length === 0 ? (
          <div className="empty-state">No screenshots extracted.</div>
        ) : (
          screenshots.map((s) => (
            <div key={s.id} className="screenshot-card">
              <div className="screenshot-card-info">
                <div className="screenshot-card-time">{fmtSec(s.timestamp)}</div>
                <div className="screenshot-card-reason">{s.reason.replace(/_/g, " ")}</div>
                <div className="screenshot-card-summary">{s.summary ?? "Evidence captured"}</div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/* ─── Actions tab ───────────────────────────────────────── */
function ActionsTab({ actions, sessionId }: { actions: Awaited<ReturnType<typeof listFollowUpActions>>; sessionId: string }) {
  return (
    <div className="card">
      <div className="card-header">
        <h2>Follow-Up Actions</h2>
        {actions.length > 0 && (
          <span className="badge badge-open">{actions.filter((a) => a.status === "open").length} open</span>
        )}
      </div>
      {actions.length === 0 ? (
        <div className="empty-state">No follow-up actions yet.</div>
      ) : (
        actions.map((a) => (
          <div key={a.id} className="action-row">
            <div className="action-row-info">
              <div className="action-row-title">{a.title}</div>
              <div className="action-row-desc">{a.description}</div>
              <div className="action-row-badges">
                <span className={`badge badge-priority-${a.priority}`}>{a.priority}</span>
                <span className={`badge badge-${a.status}`}>{a.status}</span>
              </div>
              {a.suggestedMessage && (
                <p style={{ fontSize: 11, color: "var(--slate-400)", marginTop: 4, fontStyle: "italic" }}>
                  &ldquo;{a.suggestedMessage}&rdquo;
                </p>
              )}
            </div>
            <ActionStatusButtons actionId={a.id} sessionId={sessionId} />
          </div>
        ))
      )}
    </div>
  );
}

function fmtSec(v: number) {
  const m = Math.floor(v / 60);
  const s = v % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
