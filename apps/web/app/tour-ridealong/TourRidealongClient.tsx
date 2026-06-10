"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowUpRight,
  Bot,
  Building2,
  CheckCircle2,
  CircleDot,
  ClipboardCheck,
  Clock3,
  FileAudio,
  MessageSquareText,
  Mic2,
  Play,
  Radio,
  SearchCheck,
  Sparkles,
  Square,
  Target,
  Users,
  Volume2,
} from "lucide-react";

import {
  buildMockRidealongPreview,
  getRidealongMode,
  mysteryShopRuns,
  recordWorkflowSteps,
  ridealongModes,
  rolePlayScenarios,
  tourRidealongDemo,
  type CoachingInsight,
  type RidealongModeId,
  type TranscriptSegment,
} from "./demoData";

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function formatTime(seconds: number) {
  const wholeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(wholeSeconds / 60);
  const remainingSeconds = wholeSeconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

function getImpactClasses(impact: CoachingInsight["scoreImpact"]) {
  if (impact === "gained") {
    return "border-emerald-400/40 bg-emerald-400/10 text-emerald-100";
  }

  if (impact === "lost") {
    return "border-amber-300/50 bg-amber-300/10 text-amber-100";
  }

  return "border-sky-300/40 bg-sky-300/10 text-sky-100";
}

function getSegmentClasses(segment: TranscriptSegment, active: boolean) {
  if (active) {
    return "border-yellow-300 bg-yellow-300/15 shadow-[0_0_0_1px_rgba(250,204,21,0.35)]";
  }

  if (segment.kind === "gain") {
    return "border-emerald-400/25 bg-emerald-400/5 hover:border-emerald-300/50";
  }

  if (segment.kind === "loss") {
    return "border-amber-300/30 bg-amber-300/5 hover:border-amber-200/60";
  }

  if (segment.kind === "tone") {
    return "border-sky-300/25 bg-sky-300/5 hover:border-sky-200/50";
  }

  return "border-white/10 bg-white/[0.03] hover:border-white/20";
}

function getModeIcon(modeId: RidealongModeId) {
  if (modeId === "record") {
    return <Radio className="h-4 w-4" />;
  }

  if (modeId === "review") {
    return <ClipboardCheck className="h-4 w-4" />;
  }

  if (modeId === "roleplay") {
    return <Bot className="h-4 w-4" />;
  }

  return <SearchCheck className="h-4 w-4" />;
}

export function TourRidealongClient() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const segmentRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [activeModeId, setActiveModeId] = useState<RidealongModeId>("record");
  const [isRecording, setIsRecording] = useState(false);
  const [activeSegmentId, setActiveSegmentId] = useState<string>(tourRidealongDemo.transcript[0]?.id || "");
  const [currentTime, setCurrentTime] = useState(0);

  const activeMode = getRidealongMode(activeModeId);
  const preview = buildMockRidealongPreview(activeModeId);

  const activeInsight = useMemo(() => {
    const activeSegment = tourRidealongDemo.transcript.find((segment) => segment.id === activeSegmentId);
    return tourRidealongDemo.insights.find((insight) => insight.id === activeSegment?.insightId)
      || tourRidealongDemo.insights.find((insight) => insight.segmentId === activeSegmentId)
      || tourRidealongDemo.insights[0];
  }, [activeSegmentId]);

  const jumpTo = (segmentId: string, play = false) => {
    const segment = tourRidealongDemo.transcript.find((item) => item.id === segmentId);
    if (!segment) {
      return;
    }

    setActiveModeId("review");
    setActiveSegmentId(segment.id);
    setCurrentTime(segment.start);

    if (audioRef.current) {
      audioRef.current.currentTime = segment.start;
      if (play) {
        void audioRef.current.play().catch(() => undefined);
      }
    }

    segmentRefs.current[segment.id]?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  };

  const duration = tourRidealongDemo.recording.duration;
  const progress = duration ? Math.min(100, (currentTime / duration) * 100) : 0;

  return (
    <main className="min-h-screen bg-[#10110f] text-neutral-100">
      <div className="mx-auto flex min-h-screen w-full max-w-[1500px] flex-col px-4 py-4 sm:px-6 lg:px-8">
        <header className="border-b border-white/10 pb-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-yellow-200/80">
                <span>Tour.video Ridealong</span>
                <span className="h-1 w-1 rounded-full bg-yellow-200/50" />
                <span>Mock product preview</span>
              </div>
              <h1 className="mt-2 text-2xl font-semibold tracking-normal text-white sm:text-3xl">
                Record, review, role play, and mystery shop leasing conversations.
              </h1>
              <p className="mt-2 max-w-4xl text-sm leading-6 text-neutral-300">
                This mock shows what the feature could become: one capture flow for real tour audio,
                a coaching review layer, AI practice scenarios, and QA workflows for shopper calls.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2 sm:flex sm:items-center">
              <Metric label="Modes" value={String(ridealongModes.length)} />
              <Metric label="Review" value={tourRidealongDemo.recording.overallScore.toFixed(1)} />
              <Metric label="Moments" value={String(tourRidealongDemo.insights.length)} />
            </div>
          </div>

          <div className="mt-5 grid gap-2 md:grid-cols-4">
            {ridealongModes.map((mode) => {
              const active = mode.id === activeModeId;
              return (
                <button
                  className={cn(
                    "rounded-lg border p-3 text-left transition-colors",
                    active
                      ? "border-yellow-300 bg-yellow-300/12 text-white"
                      : "border-white/10 bg-white/[0.035] text-neutral-300 hover:border-white/25",
                  )}
                  key={mode.id}
                  onClick={() => setActiveModeId(mode.id)}
                  type="button"
                >
                  <span className="flex items-center justify-between gap-3">
                    <span className="inline-flex items-center gap-2 text-sm font-semibold">
                      <span className={active ? "text-yellow-100" : "text-neutral-400"}>{getModeIcon(mode.id)}</span>
                      {mode.label}
                    </span>
                    <span className="text-xs text-neutral-500">{mode.primaryMetric}</span>
                  </span>
                  <span className="mt-2 block text-xs leading-5 text-neutral-400">{mode.eyebrow}</span>
                </button>
              );
            })}
          </div>
        </header>

        <section className="grid gap-4 py-4 xl:grid-cols-[410px_minmax(0,1fr)_390px]">
          <ModePreviewPanel
            activeModeId={activeModeId}
            isRecording={isRecording}
            onRecordingToggle={() => setIsRecording((value) => !value)}
          />

          <div className="min-h-0 overflow-hidden rounded-lg border border-white/10 bg-[#171815]">
            <div className="flex flex-col gap-3 border-b border-white/10 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-neutral-500">{activeMode.eyebrow}</p>
                <h2 className="mt-1 text-base font-semibold text-white">{activeMode.headline}</h2>
                <p className="mt-1 text-xs leading-5 text-neutral-400">{activeMode.summary}</p>
              </div>
              <div className="rounded-md border border-yellow-300/30 bg-yellow-300/10 px-3 py-2 text-center">
                <div className="text-xl font-semibold text-yellow-100">{activeMode.primaryMetric}</div>
                <div className="text-[10px] uppercase tracking-[0.12em] text-yellow-100/70">{activeMode.metricLabel}</div>
              </div>
            </div>

            {activeModeId === "review" ? (
              <TranscriptReview activeSegmentId={activeSegmentId} jumpTo={jumpTo} segmentRefs={segmentRefs} />
            ) : (
              <MockModeCanvas activeModeId={activeModeId} />
            )}
          </div>

          <aside className="grid gap-4 xl:max-h-[calc(100vh-225px)] xl:overflow-y-auto">
            <section className="rounded-lg border border-yellow-300/30 bg-yellow-300/10 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-yellow-100/80">
                    Recommended action
                  </p>
                  <h2 className="mt-2 text-lg font-semibold text-white">{activeMode.actionLabel}</h2>
                </div>
                <Sparkles className="mt-1 h-5 w-5 shrink-0 text-yellow-200" />
              </div>
              <p className="mt-3 text-sm leading-6 text-neutral-100">{preview.recommendedNextAction}</p>
            </section>

            {activeModeId === "review" ? (
              <ReviewSidebar activeInsight={activeInsight} jumpTo={jumpTo} />
            ) : (
              <ModeSidebar activeModeId={activeModeId} />
            )}
          </aside>
        </section>

        <section className="sticky bottom-0 z-10 -mx-4 border-t border-white/10 bg-[#10110f]/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
          <div className="mx-auto grid max-w-[1500px] gap-3 rounded-lg border border-white/10 bg-[#171815] p-3 lg:grid-cols-[340px_minmax(0,1fr)] lg:items-center">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <Volume2 className="h-4 w-4 text-yellow-200" />
                Conversation Audio
              </div>
              <audio
                className="mt-2 w-full"
                controls
                onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
                preload="metadata"
                ref={audioRef}
                src={tourRidealongDemo.recording.audioSrc}
              />
            </div>

            <div className="min-w-0">
              <div className="mb-2 flex items-center justify-between gap-3 text-xs text-neutral-400">
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(duration)}</span>
              </div>
              <div className="relative h-1 rounded-full bg-white/10">
                <div className="absolute inset-y-0 left-0 rounded-full bg-yellow-200" style={{ width: `${progress}%` }} />
              </div>

              <div className="mt-3 grid gap-2">
                {tourRidealongDemo.speakerTracks.map((track) => {
                  const speaker = tourRidealongDemo.speakers[track.speakerId];
                  return (
                    <div className="grid grid-cols-[82px_minmax(0,1fr)] items-center gap-3" key={track.speakerId}>
                      <div className="min-w-0 text-xs">
                        <div className="truncate font-semibold text-neutral-100">{speaker.name}</div>
                        <div className="text-neutral-500">{speaker.talkTimePercent}% talk</div>
                      </div>
                      <div className="relative h-5 rounded-full bg-black/40">
                        {track.segments.map((segment) => (
                          <button
                            aria-label={`${speaker.name} at ${formatTime(segment.start)}`}
                            className="absolute top-1 h-3 rounded-full transition-transform hover:scale-y-125 focus:outline-none focus:ring-2 focus:ring-yellow-200"
                            key={segment.id}
                            onClick={() => jumpTo(segment.segmentId, true)}
                            style={{
                              backgroundColor: speaker.color,
                              left: `${(segment.start / duration) * 100}%`,
                              width: `${Math.max(0.8, ((segment.end - segment.start) / duration) * 100)}%`,
                            }}
                            type="button"
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function ModePreviewPanel({
  activeModeId,
  isRecording,
  onRecordingToggle,
}: {
  activeModeId: RidealongModeId;
  isRecording: boolean;
  onRecordingToggle: () => void;
}) {
  return (
    <section className="rounded-lg border border-white/10 bg-[#171815] p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-neutral-500">Capture app</p>
          <h2 className="mt-1 text-lg font-semibold text-white">One-button tour recorder</h2>
        </div>
        <FileAudio className="h-5 w-5 text-yellow-200" />
      </div>

      <div className="mt-4 rounded-lg border border-white/10 bg-black/20 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-white">Leasing tour ridealong</p>
            <p className="mt-1 text-xs text-neutral-400">Guest card, audio, notes, and review queue.</p>
          </div>
          <span className={cn("rounded-full px-2 py-1 text-xs font-semibold", isRecording ? "bg-red-400/15 text-red-100" : "bg-emerald-400/10 text-emerald-100")}>
            {isRecording ? "Recording" : "Ready"}
          </span>
        </div>

        <button
          className={cn(
            "mt-5 flex min-h-24 w-full items-center justify-center gap-3 rounded-lg border text-lg font-semibold transition-colors",
            isRecording
              ? "border-red-300/40 bg-red-400/15 text-red-50 hover:bg-red-400/20"
              : "border-yellow-300/40 bg-yellow-300/15 text-yellow-50 hover:bg-yellow-300/20",
          )}
          onClick={onRecordingToggle}
          type="button"
        >
          {isRecording ? <Square className="h-5 w-5 fill-current" /> : <Mic2 className="h-5 w-5" />}
          {isRecording ? "Stop recording" : "Hit record"}
        </button>

        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <MiniStat label="Mode" value={getRidealongMode(activeModeId).label} />
          <MiniStat label="Timer" value={isRecording ? "2:14" : "0:00"} />
          <MiniStat label="Speakers" value="2" />
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {recordWorkflowSteps.map((step) => (
          <div className="rounded-md border border-white/10 bg-white/[0.03] p-3" key={step.id}>
            <div className="flex items-center gap-2">
              <span className={cn(
                "inline-flex h-6 w-6 items-center justify-center rounded-full border",
                step.status === "complete" && "border-emerald-300/50 bg-emerald-400/10 text-emerald-100",
                step.status === "active" && "border-yellow-300/50 bg-yellow-300/10 text-yellow-100",
                step.status === "ready" && "border-white/15 bg-black/20 text-neutral-400",
              )}>
                {step.status === "complete" ? <CheckCircle2 className="h-3.5 w-3.5" /> : <CircleDot className="h-3.5 w-3.5" />}
              </span>
              <span className="text-sm font-semibold text-white">{step.label}</span>
            </div>
            <p className="mt-2 text-xs leading-5 text-neutral-400">{step.detail}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function MockModeCanvas({ activeModeId }: { activeModeId: RidealongModeId }) {
  if (activeModeId === "record") {
    return (
      <div className="min-h-[520px] p-4">
        <div className="grid gap-3 lg:grid-cols-2">
          <CanvasCard title="What gets saved" icon={<FileAudio className="h-4 w-4" />}>
            <DataRows rows={[
              ["Audio file", "M4A or room recording"],
              ["Transcript", "Speaker-separated segments"],
              ["Context", "Property, prospect, tour type"],
              ["Review queue", "AI and human notes"],
            ]} />
          </CanvasCard>
          <CanvasCard title="After recording" icon={<Sparkles className="h-4 w-4" />}>
            <DataRows rows={[
              ["0-2 min", "Upload and normalize audio"],
              ["2-4 min", "Transcript and speaker labels"],
              ["4-6 min", "Rubric scoring and moments"],
              ["Next", "Manager review and coaching"],
            ]} />
          </CanvasCard>
        </div>
        <div className="mt-4 rounded-lg border border-white/10 bg-black/20 p-4">
          <p className="text-sm font-semibold text-white">Mock capture payload</p>
          <pre className="mt-3 overflow-x-auto rounded-md bg-[#0b0c0a] p-3 text-xs leading-5 text-neutral-300">
{`{
  "source": "tour_ridealong",
  "property": "Arden Square",
  "capture": "mobile_audio",
  "rubric": "leasing_tour_v1",
  "reviewers": ["manager", "ai_coach"]
}`}
          </pre>
        </div>
      </div>
    );
  }

  if (activeModeId === "roleplay") {
    return (
      <div className="min-h-[520px] p-4">
        <div className="grid gap-3">
          {rolePlayScenarios.map((scenario) => (
            <div className="rounded-lg border border-white/10 bg-black/20 p-4" key={scenario.id}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-neutral-500">{scenario.persona}</p>
                  <h3 className="mt-1 text-base font-semibold text-white">{scenario.objection}</h3>
                </div>
                <span className="rounded-full border border-sky-300/30 bg-sky-300/10 px-2 py-1 text-xs font-semibold text-sky-100">
                  {scenario.difficulty}
                </span>
              </div>
              <p className="mt-3 text-sm leading-6 text-neutral-300">{scenario.goal}</p>
              <div className="mt-3 rounded-md border border-yellow-300/20 bg-yellow-300/10 p-3 text-sm leading-6 text-yellow-50">
                {scenario.coachPrompt}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[520px] p-4">
      <div className="grid gap-3">
        {mysteryShopRuns.map((run) => (
          <div className="rounded-lg border border-white/10 bg-black/20 p-4" key={run.id}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-neutral-500">{run.shopperPersona}</p>
                <h3 className="mt-1 flex items-center gap-2 text-base font-semibold text-white">
                  <Building2 className="h-4 w-4 text-yellow-200" />
                  {run.property}
                </h3>
              </div>
              <span className="rounded-md border border-emerald-300/30 bg-emerald-300/10 px-3 py-2 text-sm font-semibold text-emerald-100">
                {run.score}
              </span>
            </div>
            <p className="mt-3 text-sm leading-6 text-neutral-300">{run.finding}</p>
            <p className="mt-2 text-xs leading-5 text-neutral-500">{run.followUp}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function TranscriptReview({
  activeSegmentId,
  jumpTo,
  segmentRefs,
}: {
  activeSegmentId: string;
  jumpTo: (segmentId: string, play?: boolean) => void;
  segmentRefs: React.MutableRefObject<Record<string, HTMLDivElement | null>>;
}) {
  return (
    <>
      <div className="flex flex-wrap gap-2 border-b border-white/10 p-4 text-xs">
        <LegendDot color="#34d399" label="Point gained" />
        <LegendDot color="#facc15" label="Improve" />
        <LegendDot color="#7dd3fc" label="Tone" />
      </div>
      <div className="max-h-[calc(100vh-380px)] min-h-[520px] overflow-y-auto p-3 sm:p-4">
        <div className="space-y-3">
          {tourRidealongDemo.transcript.map((segment) => {
            const speaker = tourRidealongDemo.speakers[segment.speakerId];
            const active = segment.id === activeSegmentId;
            const insight = segment.insightId
              ? tourRidealongDemo.insights.find((item) => item.id === segment.insightId)
              : null;

            return (
              <div
                className={cn("group rounded-lg border p-3 transition-colors", getSegmentClasses(segment, active))}
                key={segment.id}
                ref={(node) => {
                  segmentRefs.current[segment.id] = node;
                }}
              >
                <button
                  className="grid w-full grid-cols-[44px_minmax(0,1fr)] gap-3 text-left"
                  onClick={() => jumpTo(segment.id, true)}
                  type="button"
                >
                  <span className="mt-0.5 rounded-md border border-white/10 bg-black/20 px-2 py-1 text-center text-xs font-semibold text-neutral-300">
                    {formatTime(segment.start)}
                  </span>
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2">
                      <span
                        className="inline-flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-xs font-bold text-neutral-950"
                        style={{ backgroundColor: speaker.softColor }}
                      >
                        {speaker.name.replace("Speaker ", "S")}
                      </span>
                      <span className="text-sm font-semibold text-white">{speaker.name}</span>
                      <span className="text-xs text-neutral-400">{speaker.role}</span>
                      {insight ? (
                        <span className={cn("rounded-full border px-2 py-0.5 text-[11px] font-semibold", getImpactClasses(insight.scoreImpact))}>
                          {insight.scoreImpact === "gained" ? "point gained" : insight.scoreImpact === "lost" ? "coaching moment" : "tone note"}
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-2 block text-sm leading-6 text-neutral-100 sm:text-[15px]">{segment.text}</span>
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

function ReviewSidebar({
  activeInsight,
  jumpTo,
}: {
  activeInsight: CoachingInsight;
  jumpTo: (segmentId: string, play?: boolean) => void;
}) {
  return (
    <>
      <section className="rounded-lg border border-white/10 bg-[#171815] p-4">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
          <MessageSquareText className="h-5 w-5 text-yellow-200" />
          Active AI Comment
        </h2>
        <InsightBody insight={activeInsight} onJump={jumpTo} />
      </section>

      <section className="rounded-lg border border-white/10 bg-[#171815] p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-neutral-500">Rubric</p>
            <h2 className="mt-1 text-lg font-semibold text-white">Collaborative solution design</h2>
          </div>
          <div className="rounded-md border border-emerald-300/30 bg-emerald-300/10 px-3 py-2 text-center">
            <div className="text-xl font-semibold text-emerald-100">
              {tourRidealongDemo.recording.overallScore.toFixed(1)}
            </div>
            <div className="text-[10px] uppercase tracking-[0.12em] text-emerald-100/70">overall</div>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {tourRidealongDemo.rubric.map((item) => (
            <div className="rounded-md border border-white/10 bg-black/20 p-3" key={item.id}>
              <div className="flex items-center justify-between gap-3">
                <button
                  className="min-w-0 text-left text-sm font-semibold text-white hover:text-yellow-100"
                  onClick={() => jumpTo(item.evidenceSegmentIds[0])}
                  type="button"
                >
                  {item.label}
                </button>
                <span className="text-sm font-semibold text-neutral-100">{item.score.toFixed(1)}</span>
              </div>
              <div className="mt-2 h-2 rounded-full bg-white/10">
                <div
                  className="h-2 rounded-full bg-gradient-to-r from-emerald-300 to-yellow-200"
                  style={{ width: `${Math.min(100, item.score * 10)}%` }}
                />
              </div>
              <p className="mt-2 text-xs leading-5 text-neutral-400">{item.summary}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

function ModeSidebar({ activeModeId }: { activeModeId: RidealongModeId }) {
  if (activeModeId === "record") {
    return (
      <section className="rounded-lg border border-white/10 bg-[#171815] p-4">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
          <Target className="h-5 w-5 text-yellow-200" />
          Recording checklist
        </h2>
        <Checklist items={["Confirm consent", "Attach property context", "Capture all speakers", "Send to review queue"]} />
      </section>
    );
  }

  if (activeModeId === "roleplay") {
    return (
      <section className="rounded-lg border border-white/10 bg-[#171815] p-4">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
          <Users className="h-5 w-5 text-yellow-200" />
          Role play loop
        </h2>
        <Checklist items={["Pick persona", "Practice objection", "Score the response", "Save the best wording"]} />
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-white/10 bg-[#171815] p-4">
      <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
        <SearchCheck className="h-5 w-5 text-yellow-200" />
        QA review logic
      </h2>
      <Checklist items={["Run shopper scenario", "Compare team behavior", "Flag missed steps", "Assign coaching follow-up"]} />
    </section>
  );
}

function Checklist({ items }: { items: string[] }) {
  return (
    <div className="mt-4 space-y-2">
      {items.map((item) => (
        <div className="flex items-center gap-2 rounded-md border border-white/10 bg-black/20 p-3 text-sm text-neutral-200" key={item}>
          <CheckCircle2 className="h-4 w-4 text-emerald-200" />
          {item}
        </div>
      ))}
    </div>
  );
}

function DataRows({ rows }: { rows: Array<[string, string]> }) {
  return (
    <div className="mt-3 divide-y divide-white/10">
      {rows.map(([label, value]) => (
        <div className="flex items-center justify-between gap-3 py-2 text-sm" key={label}>
          <span className="text-neutral-500">{label}</span>
          <span className="text-right font-medium text-neutral-100">{value}</span>
        </div>
      ))}
    </div>
  );
}

function CanvasCard({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-white/10 bg-black/20 p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
        <span className="text-yellow-200">{icon}</span>
        {title}
      </h3>
      {children}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-center sm:min-w-[96px]">
      <div className="text-lg font-semibold text-white">{value}</div>
      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-500">{label}</div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-2">
      <div className="truncate text-sm font-semibold text-white">{value}</div>
      <div className="mt-1 text-[10px] uppercase tracking-[0.12em] text-neutral-500">{label}</div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/20 px-2 py-1 text-neutral-300">
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

function InsightBody({
  insight,
  onJump,
}: {
  insight: CoachingInsight;
  onJump: (segmentId: string, play?: boolean) => void;
}) {
  return (
    <div className="mt-4 space-y-3">
      <InsightLine icon={<Target className="h-4 w-4" />} label="What happened" text={insight.whatHappened} />
      <InsightLine icon={<CheckCircle2 className="h-4 w-4" />} label="Why it matters" text={insight.whyItMatters} />
      {insight.suggestedWording ? (
        <div className="rounded-md border border-white/10 bg-black/20 p-3">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-yellow-100/80">
            <Sparkles className="h-4 w-4" />
            Suggested wording
          </div>
          <p className="mt-2 text-sm leading-6 text-neutral-100">{insight.suggestedWording}</p>
        </div>
      ) : null}
      <button
        className="inline-flex min-h-10 items-center gap-2 rounded-md bg-yellow-200 px-3 text-sm font-semibold text-neutral-950 hover:bg-yellow-100"
        onClick={() => onJump(insight.segmentId, true)}
        type="button"
      >
        <Play className="h-4 w-4" />
        Play moment
        <ArrowUpRight className="h-4 w-4" />
      </button>
    </div>
  );
}

function InsightLine({
  icon,
  label,
  text,
}: {
  icon: ReactNode;
  label: string;
  text: string;
}) {
  return (
    <div className="rounded-md border border-white/10 bg-black/20 p-3">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-neutral-400">
        {icon}
        {label}
      </div>
      <p className="mt-2 text-sm leading-6 text-neutral-100">{text}</p>
    </div>
  );
}

export function TourRidealongSummary() {
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      <SummaryPill icon={<Clock3 className="h-4 w-4" />} label="one-click recording" />
      <SummaryPill icon={<Mic2 className="h-4 w-4" />} label="review and role play" />
      <SummaryPill icon={<Sparkles className="h-4 w-4" />} label="mystery shop QA" />
    </div>
  );
}

function SummaryPill({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-neutral-200">
      <span className="text-yellow-200">{icon}</span>
      {label}
    </div>
  );
}
