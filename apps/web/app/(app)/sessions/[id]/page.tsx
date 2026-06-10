import Link from "next/link";
import { Download, ArrowRight } from "lucide-react";

import { SESSION_STATUS_LABELS } from "@tour/shared";

import { getScreenshotsForSession, getTranscriptForSession, type SessionScreenshot } from "@/lib/evidence";
import { getAnalysisBySessionId, getSessionById, listFollowUpActions } from "@/lib/sessions";
import { ActionStatusButtons } from "./ActionStatusButtons";
import { DetailTabs } from "./DetailTabs";
import { EditSessionForm } from "./EditSessionForm";
import { UploadAndProcess } from "./UploadAndProcess";

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
  const transcript = getTranscriptForSession(id);
  const screenshots = await getScreenshotsForSession(id);

  const hasRecording = session.status !== "scheduled";
  const hasAnalysis = !!analysis;
  const isProcessing = ["uploaded", "transcribing", "extracting_screenshots", "analyzing"].includes(session.status);

  return (
    <>
      <Link href="/sessions" className="back-link">&larr; Back to Sessions</Link>

      <div className="sd-header">
        <div className="sd-header-left">
          <h1 className="sd-title">{session.title}</h1>
          <p className="sd-meta">
            {session.scheduledAt
              ? new Date(session.scheduledAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
              : "Unscheduled"}
            {session.prospectName ? ` \u00B7 ${session.prospectName}` : ""}
          </p>
        </div>
        <div className="sd-header-right">
          <span className={`badge badge-${session.status}`}>{SESSION_STATUS_LABELS[session.status]}</span>
          {hasAnalysis && session.status === "analysis_ready" && (
            <button type="button" className="btn btn-outline btn-sm sd-download-btn">
              <Download size={14} /> Download Report
            </button>
          )}
        </div>
      </div>

      {!hasAnalysis && (
        <UploadAndProcess sessionId={id} hasRecording={hasRecording} />
      )}

      {hasAnalysis && (
        <DetailTabs
          tabs={[
            { id: "overview", label: "Overview", content: <OverviewTab session={session} analysis={analysis} actions={actions} screenshots={screenshots} sessionId={id} /> },
            { id: "transcript", label: "Transcript", content: <TranscriptTab transcript={transcript} /> },
            { id: "evidence", label: "Evidence", content: <EvidenceTab screenshots={screenshots} /> },
            { id: "actions", label: "Actions", content: <ActionsTab actions={actions} sessionId={id} /> }
          ]}
        />
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

/* ── color helper for 0-100 scores ── */
function scoreColor(score: number) {
  return score >= 75 ? "green" : score >= 50 ? "amber" : "red";
}

/* ─── Overview tab ─────────────────────────────────────── */
function OverviewTab({
  session,
  analysis,
  actions,
  screenshots,
  sessionId
}: {
  session: NonNullable<Awaited<ReturnType<typeof getSessionById>>>;
  analysis: NonNullable<Awaited<ReturnType<typeof getAnalysisBySessionId>>>;
  actions: Awaited<ReturnType<typeof listFollowUpActions>>;
  screenshots: SessionScreenshot[];
  sessionId: string;
}) {
  const sc = scoreColor(analysis.overallScore);
  const scoreLabel = analysis.overallScore >= 75 ? "Great job!" : analysis.overallScore >= 50 ? "Good effort" : "Needs work";
  const topOpportunity = analysis.opportunities[0] ?? null;
  const topMoment = analysis.exactMoments[0] ?? null;
  const videoDuration = session.duration ?? estimateDuration(analysis.exactMoments);

  return (
    <>
      {/* ── Video + Timeline ── */}
      <div className="ov-video-section">
        <VideoPreview sessionId={sessionId} videoUrl={session.videoUrl} audioUrl={session.audioUrl} />

        {videoDuration > 0 && (
          <VideoTimeline
            duration={videoDuration}
            moments={analysis.exactMoments}
            sectionScores={analysis.sectionScores}
            screenshots={screenshots}
          />
        )}

        {/* Highlight thumbnails */}
        {(screenshots.length > 0 || analysis.exactMoments.length > 0) && (
          <div className="ov-highlights">
            <div className="ov-highlights-head">
              <span className="ov-highlights-title">{screenshots.length > 0 ? "Highlights" : "Key Moments"}</span>
              {screenshots.length > 0 && <Link href={`/sessions/${sessionId}#evidence`} className="view-link">View all</Link>}
            </div>
            <div className="ov-highlights-scroll">
              {screenshots.length > 0
                ? screenshots.slice(0, 8).map((s) => (
                    <div key={s.id} className="ov-thumb">
                      <img src={s.imageUrl} alt={s.label} />
                      <span className="ov-thumb-time">{fmtSec(s.timestamp)}</span>
                    </div>
                  ))
                : analysis.exactMoments.slice(0, 6).map((m, i) => (
                    <div key={i} className="ov-thumb ov-thumb--placeholder">
                      <span className="ov-thumb-time">{m.timestamp}</span>
                    </div>
                  ))
              }
            </div>
          </div>
        )}
      </div>

      {/* ── Scores + Feedback + Actions in responsive grid ── */}
      <div className="ov-body">
        {/* Score card */}
        <div className="ov-card">
          <h3 className="ov-heading">Overall Score</h3>
          <div className={`ov-ring ov-ring--${sc}`}>
            <svg viewBox="0 0 120 120" className="ov-ring-svg">
              <circle cx="60" cy="60" r="52" fill="none" stroke="currentColor" strokeWidth="10" opacity=".12" />
              <circle cx="60" cy="60" r="52" fill="none" stroke="currentColor" strokeWidth="10" strokeLinecap="round" strokeDasharray={`${(analysis.overallScore / 100) * 327} 327`} transform="rotate(-90 60 60)" />
            </svg>
            <div className="ov-ring-val">
              <span className="ov-ring-num">{analysis.overallScore}</span>
              <span className="ov-ring-label">/100</span>
            </div>
          </div>
          <p className={`ov-ring-verdict ov-ring-verdict--${sc}`}>{scoreLabel}</p>
          <p className="ov-summary">{analysis.summary}</p>

          <h3 className="ov-heading" style={{ marginTop: 16 }}>Section Scores</h3>
          <div className="ov-sections">
            {analysis.sectionScores.map((sec) => {
              const c = scoreColor(sec.score);
              return (
                <div key={sec.section} className="ov-sec-row">
                  <span className="ov-sec-name">{sec.section}</span>
                  <div className="ov-sec-bar"><div className={`ov-sec-fill ov-sec-fill--${c}`} style={{ width: `${sec.score}%` }} /></div>
                  <span className={`ov-sec-val ov-sec-val--${c}`}>{Math.round(sec.score / 10)}/10</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Feedback card */}
        <div className="ov-card">
          <h3 className="ov-heading">Feedback</h3>
          <h4 className="ov-sub-heading ov-sub-heading--green">Strengths</h4>
          <ul className="feedback-list strength-list">
            {analysis.strengths.map((s, i) => <li key={i}>{s}</li>)}
          </ul>

          {topOpportunity && (
            <div className="ov-opportunity">
              <h4 className="ov-sub-heading ov-sub-heading--amber">Top Opportunity</h4>
              <p>{topOpportunity}</p>
            </div>
          )}

          {topMoment && (
            <div style={{ marginTop: 14 }}>
              <h4 className="ov-sub-heading">Moment in Video</h4>
              <div className="ov-moment-chip">
                <span className="ov-moment-ts">{topMoment.timestamp}</span>
                <span className="ov-moment-quote">&ldquo;{topMoment.transcriptQuote}&rdquo;</span>
              </div>
              <Link href={`/sessions/${sessionId}#transcript`} className="view-link">View in transcript</Link>
            </div>
          )}
        </div>

        {/* Actions card */}
        <div className="ov-card">
          <h3 className="ov-heading">Follow-up Actions</h3>
          {actions.length === 0 ? (
            <p className="empty-state">No actions yet.</p>
          ) : (
            <>
              {actions.slice(0, 5).map((a) => (
                <div key={a.id} className="ov-action">
                  <div className="ov-action-head">
                    <span className="ov-action-title">{a.title}</span>
                    <span className={`badge badge-priority-${a.priority} badge-sm`}>{a.priority}</span>
                  </div>
                  <p className="ov-action-desc">{a.description}</p>
                  {a.suggestedMessage && (
                    <p className="ov-action-msg">&ldquo;{a.suggestedMessage}&rdquo;</p>
                  )}
                </div>
              ))}
              {actions.length > 5 && (
                <Link href={`/sessions/${sessionId}#actions`} className="view-link" style={{ marginTop: 8, display: "inline-flex", alignItems: "center", gap: 4 }}>
                  View all actions <ArrowRight size={12} />
                </Link>
              )}
            </>
          )}

          {analysis.suggestedRewrite && (
            <>
              <h4 className="ov-sub-heading" style={{ marginTop: 16 }}>Suggested Script</h4>
              <div className="ov-rewrite">
                <p>&ldquo;{analysis.suggestedRewrite}&rdquo;</p>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

/* ─── Video preview ────────────────────────────────────── */
function VideoPreview({ sessionId, videoUrl, audioUrl }: { sessionId: string; videoUrl: string | null; audioUrl: string | null }) {
  const src = videoUrl || audioUrl || `/api/local-uploads/${sessionId}.webm`;
  const isVideo = !audioUrl || videoUrl || src.match(/\.(mp4|webm|mov)$/i);

  return (
    <div className="video-preview-wrap">
      {isVideo ? (
        <video controls playsInline className="video-preview-player" src={src}>
          <track kind="captions" />
        </video>
      ) : (
        <audio controls className="audio-preview-player" src={src} />
      )}
    </div>
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
function EvidenceTab({ screenshots }: { screenshots: SessionScreenshot[] }) {
  return (
    <div className="card">
      <div className="card-header"><h2>Screenshot Evidence</h2></div>
      <div className="card-body">
        {screenshots.length === 0 ? (
          <div className="empty-state">No screenshots extracted yet. Screenshots are captured automatically during video processing.</div>
        ) : (
          <div className="evidence-grid">
            {screenshots.map((s) => (
              <div key={s.id} className="evidence-card">
                <div className="evidence-card-img">
                  <img src={s.imageUrl} alt={s.label} />
                  <span className="evidence-card-badge">{fmtSec(s.timestamp)}</span>
                </div>
                <div className="evidence-card-info">
                  <span className={`evidence-card-reason evidence-card-reason--${s.reason}`}>
                    {s.reason === "key_moment" ? "Key Moment" : "Interval"}
                  </span>
                  <p className="evidence-card-label">{s.label}</p>
                </div>
              </div>
            ))}
          </div>
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

/* ─── Video timeline bar ───────────────────────────────── */
function VideoTimeline({
  duration,
  moments,
  sectionScores,
  screenshots
}: {
  duration: number;
  moments: NonNullable<Awaited<ReturnType<typeof getAnalysisBySessionId>>>["exactMoments"];
  sectionScores: NonNullable<Awaited<ReturnType<typeof getAnalysisBySessionId>>>["sectionScores"];
  screenshots: SessionScreenshot[];
}) {
  const sectionCount = sectionScores.length || 1;

  return (
    <div className="vtl">
      <div className="vtl-sections">
        {sectionScores.map((sec, i) => {
          const c = scoreColor(sec.score);
          return (
            <div key={sec.section} className={`vtl-sec vtl-sec--${c}`} title={`${sec.section}: ${Math.round(sec.score / 10)}/10`}>
              <span className="vtl-sec-label">{abbreviate(sec.section)}</span>
            </div>
          );
        })}
      </div>

      <div className="vtl-bar">
        <div className="vtl-track" />
        {screenshots.map((s) => (
          <div key={s.id} className={`vtl-dot ${s.reason === "key_moment" ? "vtl-dot--key" : "vtl-dot--shot"}`} style={{ left: `${clampPct(s.timestamp, duration)}%` }} title={`${fmtSec(s.timestamp)} - ${s.label}`} />
        ))}
        {moments.map((m, i) => {
          const sec = parseTimestampToSeconds(m.timestamp);
          if (sec < 0) return null;
          const covered = screenshots.some((s) => Math.abs(s.timestamp - sec) < 5);
          if (covered) return null;
          return <div key={i} className="vtl-dot vtl-dot--moment" style={{ left: `${clampPct(sec, duration)}%` }} title={`${m.timestamp} - ${m.explanation}`} />;
        })}
      </div>

      <div className="vtl-times">
        <span>0:00</span>
        <span>{fmtSec(Math.floor(duration / 2))}</span>
        <span>{fmtSec(Math.floor(duration))}</span>
      </div>

      <div className="vtl-legend">
        <span><span className="vtl-legend-dot vtl-legend-dot--key" /> Key moment</span>
        <span><span className="vtl-legend-dot vtl-legend-dot--shot" /> Screenshot</span>
        <span><span className="vtl-legend-dot vtl-legend-dot--green" /> Good</span>
        <span><span className="vtl-legend-dot vtl-legend-dot--amber" /> Fair</span>
        <span><span className="vtl-legend-dot vtl-legend-dot--red" /> Needs work</span>
      </div>
    </div>
  );
}

function abbreviate(name: string): string {
  const map: Record<string, string> = {
    "Greeting & Introduction": "Greeting",
    "Greeting": "Greeting",
    "Needs Discovery": "Discovery",
    "Tour & Demonstration": "Tour",
    "Personalization": "Personal.",
    "Objection Handling": "Objection",
    "Closing": "Closing",
    "Follow-Up": "Follow-Up",
    "Compliance / Fair Housing": "Compliance"
  };
  return map[name] ?? name.split(" ")[0];
}

function clampPct(time: number, duration: number) {
  return Math.min(Math.max((time / duration) * 100, 0), 100);
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
  if (parts.length === 2 && parts.every((n) => !isNaN(n))) return parts[0] * 60 + parts[1];
  if (parts.length === 3 && parts.every((n) => !isNaN(n))) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return -1;
}

function fmtSec(v: number) {
  const m = Math.floor(v / 60);
  const s = v % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
