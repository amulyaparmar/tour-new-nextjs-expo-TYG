import Link from "next/link";
import { Download, CheckCircle2, XCircle, ShieldCheck, ShieldAlert } from "lucide-react";

import { SESSION_STATUS_LABELS } from "@tour/shared";

import { getScreenshotsForSession, getTranscriptForSession, type SessionScreenshot } from "@/lib/evidence";
import { listVisibleMaterials } from "@/lib/materials";
import { getAnalysisBySessionId, getSessionById, listFollowUpActions } from "@/lib/sessions";
import { getRecordingUrl, isLegacyLocalUrl } from "@/lib/storage";
import { ActionStatusButtons } from "./ActionStatusButtons";
import { CommentsSection } from "./CommentsSection";
import { DeleteSessionButton } from "./DeleteSessionButton";
import { DetailTabs } from "./DetailTabs";
import { EditSessionForm } from "./EditSessionForm";
import { ReprocessButton } from "./ReprocessButton";
import { SessionNotesPanel } from "./SessionNotesPanel";
import { SessionReviewClient } from "./SessionReviewClient";
import { UploadAndProcess, type NoteAsset, type SessionDetailDefaults } from "./UploadAndProcess";

type Props = { params: Promise<{ id: string }> };

export default async function SessionDetailPage({ params }: Props) {
  const { id } = await params;
  const session = await getSessionById(id);

  if (!session) {
    return (
      <>
        <Link href="/sessions" className="back-link">&larr; Sessions</Link>
        <h1 style={{ fontSize: 20 }}>Session not found</h1>
      </>
    );
  }

  const analysis = await getAnalysisBySessionId(id);
  const actions = await listFollowUpActions(id);
  const transcript = await getTranscriptForSession(id);
  const screenshots = await getScreenshotsForSession(id);
  const noteAssets = await getNoteAssets();
  const defaults = getSessionDetailDefaults(session);

  const isScheduled = session.status === "scheduled" || session.status === "in_progress";
  const hasRecording = !isScheduled;
  const hasAnalysis = !!analysis;
  const isProcessing = ["uploaded", "transcribing", "extracting_screenshots", "analyzing"].includes(session.status);

  const recordingUrl = await resolveRecordingUrl(id, session.videoUrl, session.audioUrl);

  return (
    <>
      <Link href="/sessions" className="back-link">&larr; Back to Sessions</Link>

      {/* ── Page Header ── */}
      <div className="sd-header">
        <div className="sd-header-left">
          <h1 className="sd-title">{session.title}</h1>
          <p className="sd-meta">
            {session.scheduledAt
              ? new Date(session.scheduledAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
              : "Unscheduled"}
            {session.prospectName ? ` \u00B7 ${session.prospectName}` : ""}
            {session.location ? ` \u00B7 ${session.location}` : ""}
          </p>
        </div>
        <div className="sd-header-right">
          <span className={`badge badge-${session.status}`}>{SESSION_STATUS_LABELS[session.status]}</span>
          {hasAnalysis && session.status === "analysis_ready" && (
            <button type="button" className="btn btn-outline btn-sm sd-download-btn">
              <Download size={14} /> Export
            </button>
          )}
          <DeleteSessionButton sessionId={id} />
        </div>
      </div>

      {/* ── Pre-analysis: Upload / Process ── */}
      {!hasAnalysis && isScheduled && (
        <UploadAndProcess sessionId={id} hasRecording={false} variant="new-session" defaults={defaults} noteAssets={noteAssets} />
      )}

      {!hasAnalysis && !isScheduled && (
        <UploadAndProcess sessionId={id} hasRecording={hasRecording} defaults={defaults} noteAssets={noteAssets} />
      )}

      {/* ── Analysis Results ── */}
      {hasAnalysis && (
        <>
          {/* Score Hero Bar — always visible */}
          <ScoreHero analysis={analysis} />

          {/* Main content tabs */}
          <DetailTabs
            tabs={[
              {
                id: "overview",
                label: "Overview",
                content: (
                  <OverviewTab
                    session={session}
                    analysis={analysis}
                    actions={actions}
                    screenshots={screenshots}
                    transcript={transcript}
                    sessionId={id}
                    recordingUrl={recordingUrl}
                  />
                )
              },
              {
                id: "rubric",
                label: "Rubric Detail",
                content: <RubricTab analysis={analysis} sessionId={id} />
              },
              {
                id: "actions",
                label: `Next Steps${actions.length > 0 ? ` (${actions.filter(a => a.status === "open").length})` : ""}`,
                content: <ActionsTab actions={actions} sessionId={id} prospectName={session.prospectName} />
              },
              {
                id: "comments",
                label: "Comments",
                content: <CommentsSection sessionId={id} />
              },
            ]}
          />
        </>
      )}

      {!hasAnalysis && !isProcessing && hasRecording && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-header"><h2>Session Details</h2></div>
          <div className="card-body">
            <EditSessionForm sessionId={id} title={session.title} scheduledAt={session.scheduledAt} prospectName={session.prospectName} location={session.location} notes={session.notes} />
          </div>
        </div>
      )}
    </>
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
  const location = session.location || lead?.reason?.replace(/^Tour\s+/i, "") || "";
  const title = session.title || [location || "Tour", prospectName].filter(Boolean).join(" - ");

  return {
    title,
    prospectName,
    location
  };
}

/* ════════════════════════════════════════════════════════════
   Score Hero — persistent top bar showing overall + sections
   ════════════════════════════════════════════════════════════ */
function ScoreHero({ analysis }: { analysis: NonNullable<Awaited<ReturnType<typeof getAnalysisBySessionId>>> }) {
  const sc = scoreColor(analysis.overallScore);
  const totalPts = analysis.totalPointsEarned ?? Math.round(analysis.overallScore / 100 * (analysis.totalPointsPossible ?? 200));
  const totalMax = analysis.totalPointsPossible ?? 200;

  return (
    <div className="sa-hero">
      {/* Overall score */}
      <div className="sa-hero-score">
        <div className={`sa-ring sa-ring--${sc}`}>
          <svg viewBox="0 0 80 80">
            <circle cx="40" cy="40" r="34" fill="none" stroke="currentColor" strokeWidth="7" opacity=".1" />
            <circle cx="40" cy="40" r="34" fill="none" stroke="currentColor" strokeWidth="7" strokeLinecap="round"
              strokeDasharray={`${(analysis.overallScore / 100) * 214} 214`} transform="rotate(-90 40 40)" />
          </svg>
          <span className="sa-ring-num">{analysis.overallScore}<small>%</small></span>
        </div>
        <span className="sa-ring-pts">{totalPts}/{totalMax} pts</span>
      </div>

      {/* Section mini bars */}
      <div className="sa-hero-sections">
        {analysis.sectionScores.map((sec) => {
          const c = scoreColor(sec.score);
          const hasPts = sec.pointsPossible > 0;
          return (
            <div key={sec.section} className="sa-sec">
              <div className="sa-sec-head">
                <span className="sa-sec-name">{sec.section}</span>
                <span className={`sa-sec-val sa-sec-val--${c}`}>
                  {hasPts ? `${sec.pointsEarned}/${sec.pointsPossible}` : `${sec.score}%`}
                </span>
              </div>
              <div className="sa-sec-track">
                <div className={`sa-sec-fill sa-sec-fill--${c}`} style={{ width: `${sec.score}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   Overview Tab — player, summary, strengths/opportunities
   ════════════════════════════════════════════════════════════ */
function OverviewTab({
  session,
  analysis,
  actions,
  screenshots,
  transcript,
  sessionId,
  recordingUrl
}: {
  session: NonNullable<Awaited<ReturnType<typeof getSessionById>>>;
  analysis: NonNullable<Awaited<ReturnType<typeof getAnalysisBySessionId>>>;
  actions: Awaited<ReturnType<typeof listFollowUpActions>>;
  screenshots: SessionScreenshot[];
  transcript: Awaited<ReturnType<typeof getTranscriptForSession>>;
  sessionId: string;
  recordingUrl: string | null;
}) {
  const videoDuration = session.duration ?? estimateDuration(analysis.exactMoments);

  return (
    <div className="sa-overview">
      {/* Player + Timeline */}
      <SessionReviewClient
        sessionId={sessionId}
        videoUrl={session.videoUrl}
        audioUrl={session.audioUrl}
        recordingUrl={recordingUrl}
        duration={videoDuration}
        analysis={analysis}
        transcript={transcript}
        screenshots={screenshots}
      />

      <SessionNotesPanel analysis={analysis} />

      {/* Fair Housing */}
      <FairHousingBanner flags={analysis.fairHousingFlags} />
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   Rubric Detail Tab — full question-level breakdown
   ════════════════════════════════════════════════════════════ */
function RubricTab({ analysis, sessionId }: { analysis: NonNullable<Awaited<ReturnType<typeof getAnalysisBySessionId>>>; sessionId: string }) {
  const anyQuestions = analysis.sectionScores.some(s => s.questions && s.questions.length > 0);

  return (
    <div className="sa-rubric">
      {!anyQuestions && (
        <div style={{
          padding: "16px 20px",
          background: "var(--amber-50, #fffbeb)",
          border: "1px solid var(--amber-200, #fde68a)",
          borderRadius: 10,
          marginBottom: 16,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}>
          <div>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "var(--amber-800, #92400e)" }}>
              Legacy analysis — question-level detail not available
            </p>
            <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--amber-700, #b45309)" }}>
              Re-process this session to generate the full rubric breakdown with per-question scoring.
            </p>
          </div>
          <ReprocessButton sessionId={sessionId} />
        </div>
      )}

      {analysis.sectionScores.map((sec) => {
        const c = scoreColor(sec.score);
        const hasQuestions = sec.questions && sec.questions.length > 0;
        const passCount = hasQuestions ? sec.questions.filter(q => q.passed).length : 0;
        const totalQ = hasQuestions ? sec.questions.length : 0;

        return (
          <details key={sec.section} className="sa-rubric-section" open>
            <summary className="sa-rubric-header">
              <div className="sa-rubric-header-left">
                <h3 className="sa-rubric-title">{sec.section}</h3>
                {hasQuestions && (
                  <span className="sa-rubric-count">{passCount}/{totalQ} passed</span>
                )}
              </div>
              <div className="sa-rubric-header-right">
                {sec.pointsPossible > 0 && (
                  <span className="sa-rubric-pts">{sec.pointsEarned}/{sec.pointsPossible} pts</span>
                )}
                <span className={`sa-rubric-pct sa-rubric-pct--${c}`}>{sec.score}%</span>
              </div>
            </summary>

            {hasQuestions ? (
              <div className="sa-rubric-questions">
                {sec.questions.map((q) => (
                  <div key={q.id} className={`sa-q ${q.passed ? "sa-q--pass" : "sa-q--fail"}`}>
                    <div className={`sa-q-icon ${q.passed ? "sa-q-icon--pass" : "sa-q-icon--fail"}`}>
                      {q.passed ? "\u2713" : "\u2717"}
                    </div>
                    <div className="sa-q-content">
                      <div className="sa-q-row">
                        <span className="sa-q-id">{q.id}</span>
                        <span className="sa-q-text">{q.question}</span>
                        <span className={`sa-q-pts ${q.passed ? "sa-q-pts--pass" : "sa-q-pts--fail"}`}>
                          {q.earnedPoints}/{q.maxPoints}
                        </span>
                      </div>
                      {q.evidence && <p className="sa-q-evidence">{q.evidence}</p>}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ padding: "12px 16px", fontSize: 13, color: "var(--slate-500)" }}>
                <p style={{ margin: 0 }}>
                  <strong>{sec.section}</strong> scored <strong>{sec.score}%</strong>
                  {sec.pointsPossible > 0 && <> ({sec.pointsEarned}/{sec.pointsPossible} pts)</>}.
                  Re-process to see individual question scores.
                </p>
              </div>
            )}
          </details>
        );
      })}

      <FairHousingBanner flags={analysis.fairHousingFlags} />
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   Fair Housing Banner
   ════════════════════════════════════════════════════════════ */
function FairHousingBanner({ flags }: { flags?: string[] }) {
  if (!flags) return null;
  const clean = flags.length === 0;

  return (
    <div className={`sa-fh ${clean ? "sa-fh--pass" : "sa-fh--fail"}`}>
      {clean ? <ShieldCheck size={18} /> : <ShieldAlert size={18} />}
      <div>
        <strong>{clean ? "Fair Housing: Compliant" : "Fair Housing Flags"}</strong>
        {clean
          ? <p className="sa-fh-text">No evidence of steering, segregation, or discrimination.</p>
          : (
            <ul className="sa-fh-list">
              {flags.map((f, i) => <li key={i}>{f}</li>)}
            </ul>
          )}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   Actions / Next Steps Tab
   ════════════════════════════════════════════════════════════ */
function ActionsTab({ actions, sessionId, prospectName }: { actions: Awaited<ReturnType<typeof listFollowUpActions>>; sessionId: string; prospectName: string | null }) {
  if (actions.length === 0) {
    return <div className="sa-empty">No follow-up actions generated yet.</div>;
  }

  return (
    <div className="sa-actions">
      <p className="sa-actions-intro">
        Next steps to move <strong>{prospectName || "the prospect"}</strong> toward signing.
      </p>
      {actions.map((a) => (
        <div key={a.id} className="sa-action">
          <div className="sa-action-head">
            <span className="sa-action-title">{a.title}</span>
            <div className="sa-action-badges">
              <span className={`badge badge-priority-${a.priority} badge-sm`}>{a.priority}</span>
              <ActionStatusButtons actionId={a.id} sessionId={sessionId} />
            </div>
          </div>
          <p className="sa-action-desc">{a.description}</p>
          {a.suggestedMessage && (
            <div className="sa-action-msg">
              <span className="sa-action-msg-label">Ready-to-send message</span>
              <p>&ldquo;{a.suggestedMessage}&rdquo;</p>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}


/* ── Helpers ─────────────────────────────────────────────── */

function scoreColor(score: number) {
  return score >= 75 ? "green" : score >= 50 ? "amber" : "red";
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
