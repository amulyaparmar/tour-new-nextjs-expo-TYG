"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Circle,
  Download,
  HelpCircle,
  Link2,
  MoreHorizontal,
  RotateCw,
  Search
} from "lucide-react";
import type { AnalysisResult, FollowUpAction, SessionDetail } from "@tour/shared";
import type { SessionScreenshot, TranscriptSegment } from "@/lib/evidence";
import { UploadAndProcess } from "./UploadAndProcess";

type ReviewAction = FollowUpAction["status"];

type Props = {
  session: SessionDetail;
  analysis: AnalysisResult | null;
  initialActions: FollowUpAction[];
  transcript: TranscriptSegment[];
  screenshots: SessionScreenshot[];
};

function fmtSec(v: number) {
  const m = Math.floor(v / 60);
  const s = v % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function scoreTone(score: number) {
  if (score >= 75) return "text-[#16a34a]";
  if (score >= 50) return "text-[#d97706]";
  return "text-[#b91c1c]";
}

export function SessionRidealongClient({
  session,
  analysis,
  initialActions,
  transcript,
  screenshots
}: Props) {
  const [reviewTab, setReviewTab] = useState<"comments" | "rubric">("comments");
  const [actions, setActions] = useState(initialActions);
  const [updatingActionId, setUpdatingActionId] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);

  const hasAnalysis = Boolean(analysis);
  const hasRecording = session.status !== "scheduled";
  const openActions = actions.filter((a) => a.status === "open");

  const derivedTranscript = useMemo(() => {
    if (transcript.length > 0) return transcript;
    if (!analysis) return [];
    return (analysis?.exactMoments ?? []).map((m, idx) => {
      const parts = m.timestamp.split(":").map(Number);
      const mm = parts[0]; const ss = parts[1];
      const start = mm != null && ss != null && Number.isFinite(mm) && Number.isFinite(ss) ? mm * 60 + ss : idx * 30;
      return {
        id: `moment-${idx}`,
        sessionId: session.id,
        speaker: "Speaker",
        startTime: start,
        endTime: start + 8,
        text: m.transcriptQuote
      };
    });
  }, [analysis, session.id, transcript]);

  async function updateActionStatus(actionId: string, status: ReviewAction) {
    setUpdatingActionId(actionId);
    try {
      const res = await fetch(`/api/sessions/${session.id}/actions`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actionId, status })
      });
      if (!res.ok) throw new Error("Failed to update action");
      setActions((prev) => prev.map((a) => (a.id === actionId ? { ...a, status } : a)));
    } finally {
      setUpdatingActionId(null);
    }
  }

  async function regenerateAnalysis() {
    setRegenerating(true);
    try {
      await fetch(`/api/sessions/${session.id}/analysis`, { method: "POST" });
      window.location.reload();
    } finally {
      setRegenerating(false);
    }
  }

  return (
    <section>
      <Link href="/sessions" className="inline-flex items-center gap-2 text-sm font-semibold text-[#667085]">
        <ArrowRight size={14} style={{ transform: "rotate(180deg)" }} />
        Sessions
      </Link>

      <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-4xl font-semibold tracking-normal text-[#101828]">{session.title}</h1>
          <p className="mt-2 text-sm font-medium text-[#667085]">
            {session.scheduledAt
              ? new Date(session.scheduledAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
              : "Unscheduled"}
            {session.prospectName ? ` • ${session.prospectName}` : ""}
          </p>
        </div>
        <div className="flex gap-3">
          <button className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-black/10 bg-white px-4 text-sm font-semibold text-[#344054] shadow-sm" type="button">
            <Link2 className="h-4 w-4" />
            Share
          </button>
          {hasAnalysis && (
            <button className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-black/10 bg-white px-4 text-sm font-semibold text-[#344054] shadow-sm" type="button">
              <Download className="h-4 w-4" />
              Report
            </button>
          )}
          <button className="grid h-11 w-11 place-items-center rounded-xl border border-black/10 bg-white text-[#344054] shadow-sm" type="button">
            <MoreHorizontal className="h-5 w-5" />
          </button>
        </div>
      </div>

      {!hasAnalysis ? (
        <div className="mt-6">
          <UploadAndProcess sessionId={session.id} hasRecording={hasRecording} />
        </div>
      ) : (
        <section className="mt-6 grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)_360px]">
          <aside className="space-y-5">
            <section className="rounded-[1.5rem] border border-black/10 bg-white p-4 shadow-sm">
              <div className="grid grid-cols-2 rounded-full bg-[#f5f7fb] p-1">
                <button
                  type="button"
                  onClick={() => setReviewTab("comments")}
                  className={`h-10 rounded-full text-sm font-semibold ${reviewTab === "comments" ? "bg-white text-[#101828] shadow-sm" : "text-[#667085]"}`}
                >
                  Comments
                </button>
                <button
                  type="button"
                  onClick={() => setReviewTab("rubric")}
                  className={`h-10 rounded-full text-sm font-semibold ${reviewTab === "rubric" ? "bg-white text-[#101828] shadow-sm" : "text-[#667085]"}`}
                >
                  Rubric
                </button>
              </div>

              {reviewTab === "comments" ? (
                <div className="mt-5 space-y-3">
                  {openActions.length === 0 ? (
                    <p className="text-sm text-[#667085]">No open reviewer comments.</p>
                  ) : (
                    openActions.map((a) => (
                      <article key={a.id} className="rounded-2xl bg-[#f5f7fb] p-4">
                        <h3 className="text-sm font-semibold text-[#101828]">{a.title}</h3>
                        <p className="mt-2 text-sm leading-6 text-[#475467]">{a.description}</p>
                      </article>
                    ))
                  )}
                </div>
              ) : (
                <div className="mt-5 space-y-3">
                  {analysis?.sectionScores.map((sec) => (
                    <article key={sec.section} className="rounded-2xl border border-black/10 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="text-sm font-semibold text-[#101828]">{sec.section}</h3>
                        <span className="rounded-full bg-[#f5f7fb] px-2.5 py-1 text-xs font-bold text-[#101828]">
                          {Math.round(sec.score / 10)}/10
                        </span>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </aside>

          <main className="min-w-0 space-y-5">
            <section className="overflow-hidden rounded-[1.5rem] border border-black/10 bg-white shadow-sm">
              <div className="flex border-b border-black/10 px-5">
                <button className="h-14 border-b-2 border-[#0071e3] px-2 text-sm font-semibold text-[#0071e3]" type="button">
                  Review moments
                </button>
              </div>
              <div className="p-5">
                {session.videoUrl || session.audioUrl ? (
                  session.videoUrl ? (
                    <video controls playsInline src={session.videoUrl} className="aspect-video w-full rounded-xl border border-black/10 bg-black" />
                  ) : (
                    <audio controls src={session.audioUrl ?? undefined} className="w-full" />
                  )
                ) : (
                  <div className="grid aspect-video w-full place-items-center rounded-xl border border-dashed border-black/20 bg-[#f8fafc] text-sm font-medium text-[#667085]">
                    Recording will appear here after upload.
                  </div>
                )}

                {screenshots.length > 0 && (
                  <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
                    {screenshots.map((s) => (
                      <div key={s.id} className="relative h-20 w-36 shrink-0 overflow-hidden rounded-lg border border-black/10">
                        <img src={s.imageUrl} alt={s.label} className="h-full w-full object-cover" />
                        <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                          {fmtSec(s.timestamp)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>

            <section className="overflow-hidden rounded-[1.5rem] border border-black/10 bg-white shadow-sm">
              <div className="flex flex-col gap-4 border-b border-black/10 p-5 lg:flex-row lg:items-center lg:justify-between">
                <h2 className="text-xl font-semibold text-[#101828]">Transcript</h2>
                <div className="flex h-11 min-w-0 items-center gap-2 rounded-xl border border-black/10 bg-white px-3 text-sm text-[#667085] shadow-sm sm:w-64">
                  <Search className="h-4 w-4 shrink-0" />
                  <span className="truncate">Search transcript...</span>
                </div>
              </div>

              <div className="divide-y divide-black/10">
                {derivedTranscript.length === 0 ? (
                  <div className="px-5 py-8 text-sm text-[#667085]">No transcript available yet.</div>
                ) : (
                  derivedTranscript.map((seg) => (
                    <div key={seg.id} className="grid grid-cols-[4rem_8rem_minmax(0,1fr)] items-start gap-4 px-5 py-4">
                      <span className="text-sm font-semibold text-[#475467]">{fmtSec(seg.startTime)}</span>
                      <span className="truncate text-sm font-semibold text-[#667085]">{seg.speaker}</span>
                      <span className="text-sm leading-6 text-[#344054]">{seg.text}</span>
                    </div>
                  ))
                )}
              </div>
            </section>
          </main>

          <aside className="space-y-5">
            <section className="flex items-center justify-between rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-[#101828]">Score</h2>
                <HelpCircle className="h-4 w-4 text-[#98a2b3]" />
              </div>
              <span className={`rounded-xl bg-[#f5f7fb] px-3 py-2 text-sm font-semibold ${scoreTone(analysis?.overallScore ?? 0)}`}>
                {analysis?.overallScore ?? 0}/100
              </span>
            </section>

            <section className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-4">
                <h3 className="text-base font-semibold text-[#101828]">AI summary</h3>
                <button
                  className="inline-flex items-center gap-2 text-sm font-semibold text-[#0071e3]"
                  type="button"
                  onClick={regenerateAnalysis}
                  disabled={regenerating}
                >
                  <RotateCw className={`h-4 w-4 ${regenerating ? "animate-spin" : ""}`} />
                  Regenerate
                </button>
              </div>
              <p className="mt-3 text-sm leading-6 text-[#475467]">{analysis?.summary}</p>
              <h4 className="mt-5 text-sm font-semibold text-[#101828]">Strengths</h4>
              <ul className="mt-2 space-y-2 text-sm text-[#344054]">
                {(analysis?.strengths ?? []).slice(0, 4).map((s) => (
                  <li key={s} className="flex gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#16a34a]" />
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-[#101828]">Follow-up actions</h2>
              <div className="mt-4 space-y-3">
                {actions.length === 0 ? (
                  <p className="text-sm text-[#667085]">No actions generated yet.</p>
                ) : (
                  actions.map((a) => (
                    <div key={a.id} className="rounded-xl border border-black/10 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-[#101828]">{a.title}</p>
                        <span className="text-xs font-semibold capitalize text-[#667085]">{a.priority}</span>
                      </div>
                      <p className="mt-1 text-sm text-[#475467]">{a.description}</p>
                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          className="inline-flex h-8 items-center justify-center rounded-lg border border-black/10 bg-white px-3 text-xs font-semibold text-[#344054]"
                          disabled={updatingActionId === a.id}
                          onClick={() => updateActionStatus(a.id, "completed")}
                        >
                          Complete
                        </button>
                        <button
                          type="button"
                          className="inline-flex h-8 items-center justify-center rounded-lg border border-black/10 bg-white px-3 text-xs font-semibold text-[#667085]"
                          disabled={updatingActionId === a.id}
                          onClick={() => updateActionStatus(a.id, "dismissed")}
                        >
                          Dismiss
                        </button>
                        {a.status !== "open" && (
                          <button
                            type="button"
                            className="inline-flex h-8 items-center justify-center rounded-lg border border-black/10 bg-white px-3 text-xs font-semibold text-[#0071e3]"
                            disabled={updatingActionId === a.id}
                            onClick={() => updateActionStatus(a.id, "open")}
                          >
                            Reopen
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          </aside>
        </section>
      )}

      {!hasAnalysis && hasRecording && (
        <div className="mt-5 rounded-xl border border-black/10 bg-white p-4 text-sm text-[#667085]">
          Once processing completes, this page switches to full ridealong review mode automatically.
        </div>
      )}

      {!hasAnalysis && !hasRecording && (
        <div className="mt-5 rounded-xl border border-black/10 bg-white p-4 text-sm text-[#667085]">
          Upload or record a session first, then run processing to generate transcript, screenshots, AI analysis, and actions.
        </div>
      )}
    </section>
  );
}
