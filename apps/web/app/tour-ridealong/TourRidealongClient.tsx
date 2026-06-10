"use client";

import { useMemo, useRef, useState, type MutableRefObject, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import {
  ArrowUpRight,
  Bell,
  Bot,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  Folder,
  Gift,
  Home,
  Import,
  MessageSquareText,
  Mic2,
  Play,
  Radio,
  Search,
  SearchCheck,
  Sparkles,
  Square,
  UploadCloud,
  Video,
  Volume2
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
  type TranscriptSegment
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

function getModeIcon(modeId: RidealongModeId) {
  if (modeId === "record") {
    return <Radio className="h-5 w-5" />;
  }

  if (modeId === "review") {
    return <ClipboardCheck className="h-5 w-5" />;
  }

  if (modeId === "roleplay") {
    return <Bot className="h-5 w-5" />;
  }

  return <SearchCheck className="h-5 w-5" />;
}

function getInsightTone(impact: CoachingInsight["scoreImpact"]) {
  if (impact === "gained") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (impact === "lost") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  return "border-blue-200 bg-blue-50 text-blue-700";
}

function getSegmentTone(segment: TranscriptSegment, active: boolean) {
  if (active) {
    return "border-blue-300 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.06)]";
  }

  if (segment.kind === "gain") {
    return "border-emerald-100 bg-white hover:border-emerald-200";
  }

  if (segment.kind === "loss") {
    return "border-amber-100 bg-white hover:border-amber-200";
  }

  if (segment.kind === "tone") {
    return "border-sky-100 bg-white hover:border-sky-200";
  }

  return "border-slate-200 bg-white hover:border-slate-300";
}

export function TourRidealongClient() {
  const pathname = usePathname();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const segmentRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [activeModeId, setActiveModeId] = useState<RidealongModeId>(
    pathname.includes("tour-ridealong") ? "review" : "record"
  );
  const [isRecording, setIsRecording] = useState(false);
  const [activeSegmentId, setActiveSegmentId] = useState<string>(tourRidealongDemo.transcript[0]?.id || "");
  const [currentTime, setCurrentTime] = useState(0);

  const activeMode = getRidealongMode(activeModeId);
  const preview = buildMockRidealongPreview(activeModeId);

  const activeInsight = useMemo(() => {
    const activeSegment = tourRidealongDemo.transcript.find((segment) => segment.id === activeSegmentId);
    return tourRidealongDemo.insights.find((insight) => insight.id === activeSegment?.insightId)
      || tourRidealongDemo.insights.find((insight) => insight.segmentId === activeSegmentId)
      || tourRidealongDemo.insights[0]!;
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
      block: "center"
    });
  };

  const duration = tourRidealongDemo.recording.duration;
  const progress = duration ? Math.min(100, (currentTime / duration) * 100) : 0;

  return (
    <main className="min-h-screen bg-white text-[#232832]">
      <div className="grid min-h-screen lg:grid-cols-[280px_minmax(0,1fr)]">
        <Sidebar activeModeId={activeModeId} pathname={pathname} setActiveModeId={setActiveModeId} />

        <section className="min-w-0 bg-white">
          <Topbar isRecording={isRecording} onRecordingToggle={() => setIsRecording((value) => !value)} />

          <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-7 px-5 py-8 sm:px-8">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <button
                className="inline-flex w-fit items-center gap-2 rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-200"
                type="button"
              >
                Wednesday, Jun 10, 2026
                <ChevronDown className="h-4 w-4 text-slate-500" />
              </button>
              <button
                className="inline-flex w-fit items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-800 ring-1 ring-slate-200 hover:bg-slate-50"
                type="button"
              >
                For you
                <ChevronDown className="h-4 w-4 text-slate-500" />
              </button>
            </div>

            <section className="grid gap-5 rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.06)] lg:grid-cols-[minmax(0,1fr)_320px] lg:p-7">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-blue-700">
                  <span className="rounded-full bg-blue-50 px-3 py-1">Tour.video</span>
                  <span className="rounded-full bg-slate-100 px-3 py-1">Ridealong workspace</span>
                </div>
                <h1 className="mt-4 max-w-3xl text-3xl font-semibold tracking-normal text-slate-950 sm:text-4xl">
                  Record, review, role play, and mystery shop leasing conversations.
                </h1>
                <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600">
                  A cleaner workspace for tour audio, timestamped coaching, role-play scenarios, and QA review.
                </p>
                <div className="mt-6 grid gap-2 sm:grid-cols-3">
                  <Metric label="Modes" value={String(ridealongModes.length)} />
                  <Metric label="Review" value={tourRidealongDemo.recording.overallScore.toFixed(1)} />
                  <Metric label="Moments" value={String(tourRidealongDemo.insights.length)} />
                </div>
              </div>

              <RecordCard isRecording={isRecording} onRecordingToggle={() => setIsRecording((value) => !value)} />
            </section>

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
              <div className="min-w-0 space-y-5">
                <ModeTabs activeModeId={activeModeId} setActiveModeId={setActiveModeId} />

                <section className="rounded-[24px] border border-slate-200 bg-white shadow-[0_12px_36px_rgba(15,23,42,0.05)]">
                  <div className="flex flex-col gap-3 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase text-slate-400">{activeMode.eyebrow}</p>
                      <h2 className="mt-1 text-xl font-semibold text-slate-950">{activeMode.headline}</h2>
                      <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">{activeMode.summary}</p>
                    </div>
                    <div className="w-fit rounded-2xl border border-slate-200 bg-white px-4 py-3 text-center">
                      <div className="text-2xl font-semibold text-blue-700">{activeMode.primaryMetric}</div>
                      <div className="text-[11px] font-semibold uppercase text-slate-500">{activeMode.metricLabel}</div>
                    </div>
                  </div>

                  {activeModeId === "review" ? (
                    <TranscriptReview activeSegmentId={activeSegmentId} jumpTo={jumpTo} segmentRefs={segmentRefs} />
                  ) : (
                    <ModeCanvas activeModeId={activeModeId} />
                  )}
                </section>
              </div>

              <aside className="space-y-5">
                <ActionCard actionLabel={activeMode.actionLabel} nextAction={preview.recommendedNextAction} />

                {activeModeId === "review" ? (
                  <ReviewPanel activeInsight={activeInsight} jumpTo={jumpTo} />
                ) : (
                  <ModePanel activeModeId={activeModeId} />
                )}
              </aside>
            </div>
          </div>

          <AudioDock
            audioRef={audioRef}
            currentTime={currentTime}
            duration={duration}
            jumpTo={jumpTo}
            progress={progress}
            setCurrentTime={setCurrentTime}
          />
        </section>
      </div>
    </main>
  );
}

function Sidebar({
  activeModeId,
  pathname,
  setActiveModeId
}: {
  activeModeId: RidealongModeId;
  pathname: string;
  setActiveModeId: (modeId: RidealongModeId) => void;
}) {
  return (
    <aside className="hidden min-h-screen border-r border-slate-200 bg-white px-5 py-5 lg:flex lg:flex-col">
      <div className="flex items-center justify-between">
        <a className="flex items-center gap-3" href="/">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-600 text-white">
            <Play className="ml-0.5 h-5 w-5 fill-current" />
          </span>
          <span className="text-2xl font-semibold tracking-normal text-slate-950">Tour</span>
        </a>
        <button className="rounded-full bg-white p-2 text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50" type="button">
          <Bell className="h-5 w-5" />
        </button>
      </div>

      <div className="mt-7 overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="flex items-center gap-3 p-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-900 text-sm font-semibold text-white">
            AP
          </span>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-slate-950">Amulya Parmar</div>
            <div className="truncate text-xs text-slate-500">tour workspace</div>
          </div>
          <ChevronDown className="ml-auto h-4 w-4 text-slate-500" />
        </div>
        <div className="flex items-center gap-2 border-t border-slate-100 px-3 py-2 text-sm font-semibold text-slate-800">
          <Gift className="h-5 w-5" />
          Get Pro For Free
        </div>
      </div>

      <nav className="mt-6 space-y-1">
        <NavLink active={pathname === "/"} href="/" icon={<Home className="h-5 w-5" />} label="Home" />
        <NavLink active={pathname === "/tour-record"} href="/tour-record" icon={<Mic2 className="h-5 w-5" />} label="Tour Record" />
        <NavLink active={pathname === "/tour-ridealong"} href="/tour-ridealong" icon={<MessageSquareText className="h-5 w-5" />} label="Ridealong" />
      </nav>

      <div className="mt-6 space-y-2">
        <SidebarLabel>Modes</SidebarLabel>
        {ridealongModes.map((mode) => {
          const active = mode.id === activeModeId;
          return (
            <button
              className={cn(
                "flex min-h-10 w-full items-center gap-3 rounded-full border px-4 text-left text-sm font-semibold transition-colors",
                active ? "border-blue-300 bg-white text-blue-700" : "border-transparent bg-white text-slate-600 hover:border-slate-200 hover:bg-white"
              )}
              key={mode.id}
              onClick={() => setActiveModeId(mode.id)}
              type="button"
            >
              {getModeIcon(mode.id)}
              {mode.label}
            </button>
          );
        })}
      </div>

      <div className="mt-6 space-y-2">
        <SidebarLabel>Folders</SidebarLabel>
        <NavLink href="/" icon={<Folder className="h-5 w-5" />} label="TYG" />
      </div>

      <div className="mt-auto space-y-4">
        <div className="rounded-2xl bg-slate-50 p-4">
          <h3 className="text-sm font-semibold text-slate-950">Get the desktop app</h3>
          <p className="mt-2 text-sm leading-6 text-slate-500">Local, reliable, bot-free recording</p>
          <a className="mt-3 inline-flex text-sm font-semibold text-blue-700" href="/tour-record">
            Download <ArrowUpRight className="ml-1 h-4 w-4" />
          </a>
        </div>
        <div className="rounded-2xl bg-slate-50 p-4">
          <div className="flex items-center justify-between text-sm font-semibold text-slate-950">
            Basic <span className="h-px flex-1 bg-blue-100 ml-3" />
          </div>
          <p className="mt-3 text-sm text-slate-600">0 of 300 monthly mins used</p>
          <button className="mt-4 min-h-10 w-full rounded-full border border-blue-600 bg-white px-4 text-sm font-semibold text-blue-700 hover:bg-blue-50" type="button">
            Get Tour Pro
          </button>
        </div>
      </div>
    </aside>
  );
}

function Topbar({
  isRecording,
  onRecordingToggle
}: {
  isRecording: boolean;
  onRecordingToggle: () => void;
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur sm:px-8">
      <div className="flex items-center gap-3">
        <div className="flex min-h-11 flex-1 items-center gap-3 rounded-2xl border border-slate-300 bg-white px-4 text-slate-500 shadow-sm sm:max-w-[420px]">
          <Search className="h-5 w-5 text-slate-700" />
          <span className="text-sm sm:text-base">Ask or search</span>
          <span className="ml-auto hidden text-sm text-slate-400 sm:inline">⌘K</span>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <IconButton label="Video" icon={<Video className="h-5 w-5" />} />
          <button className="hidden min-h-11 items-center gap-2 rounded-2xl bg-slate-100 px-4 text-sm font-semibold text-slate-900 hover:bg-slate-200 sm:inline-flex" type="button">
            <UploadCloud className="h-5 w-5" />
            Import
          </button>
          <button
            className={cn(
              "inline-flex min-h-11 items-center gap-2 rounded-2xl px-4 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(37,99,235,0.22)]",
              isRecording ? "bg-red-500 hover:bg-red-600" : "bg-blue-600 hover:bg-blue-700"
            )}
            onClick={onRecordingToggle}
            type="button"
          >
            {isRecording ? <Square className="h-5 w-5 fill-current" /> : <Mic2 className="h-5 w-5" />}
            {isRecording ? "Stop" : "Record"}
          </button>
          <IconButton label="Calendar" icon={<CalendarDays className="h-5 w-5" />} />
        </div>
      </div>
    </header>
  );
}

function ModeTabs({
  activeModeId,
  setActiveModeId
}: {
  activeModeId: RidealongModeId;
  setActiveModeId: (modeId: RidealongModeId) => void;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
      {ridealongModes.map((mode) => {
        const active = mode.id === activeModeId;
        return (
          <button
            className={cn(
              "min-h-[86px] rounded-2xl border bg-white p-4 text-left transition-colors",
              active
                ? "border-blue-300 text-blue-800 shadow-[0_8px_24px_rgba(15,23,42,0.04)]"
                : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
            )}
            key={mode.id}
            onClick={() => setActiveModeId(mode.id)}
            type="button"
          >
            <span className="flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-2 text-sm font-semibold">
                {getModeIcon(mode.id)}
                {mode.label}
              </span>
              <span className="text-xs font-semibold text-slate-500">{mode.primaryMetric}</span>
            </span>
            <span className="mt-2 block text-xs leading-5 text-slate-500">{mode.eyebrow}</span>
          </button>
        );
      })}
    </div>
  );
}

function RecordCard({
  isRecording,
  onRecordingToggle
}: {
  isRecording: boolean;
  onRecordingToggle: () => void;
}) {
  return (
    <div className="rounded-[24px] bg-slate-50 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-950">Leasing tour ridealong</p>
          <p className="mt-1 text-xs text-slate-500">Guest card, audio, notes, and review queue.</p>
        </div>
        <span className={cn("rounded-full px-3 py-1 text-xs font-semibold", isRecording ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-700")}>
          {isRecording ? "Recording" : "Ready"}
        </span>
      </div>

      <button
        className={cn(
          "mt-5 flex min-h-28 w-full items-center justify-center gap-3 rounded-[24px] border text-lg font-semibold transition-colors",
          isRecording
            ? "border-red-300 bg-white text-red-600 hover:bg-red-50"
            : "border-blue-300 bg-white text-blue-700 hover:bg-slate-50"
        )}
        onClick={onRecordingToggle}
        type="button"
      >
        {isRecording ? <Square className="h-5 w-5 fill-current" /> : <Mic2 className="h-5 w-5" />}
        {isRecording ? "Stop recording" : "Hit record"}
      </button>

      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <MiniStat label="Mode" value="Field" />
        <MiniStat label="Timer" value={isRecording ? "2:14" : "0:00"} />
        <MiniStat label="Speakers" value="2" />
      </div>
    </div>
  );
}

function ModeCanvas({ activeModeId }: { activeModeId: RidealongModeId }) {
  if (activeModeId === "record") {
    return (
      <div className="grid gap-4 p-5 lg:grid-cols-2">
        <CleanCard title="What gets saved" icon={<Import className="h-5 w-5" />}>
          <DataRows rows={[
            ["Audio file", "M4A or room recording"],
            ["Transcript", "Speaker-separated segments"],
            ["Context", "Property, prospect, tour type"],
            ["Review queue", "AI and human notes"]
          ]} />
        </CleanCard>
        <CleanCard title="After recording" icon={<Sparkles className="h-5 w-5" />}>
          <DataRows rows={[
            ["0-2 min", "Upload and normalize audio"],
            ["2-4 min", "Transcript and speaker labels"],
            ["4-6 min", "Rubric scoring and moments"],
            ["Next", "Manager review and coaching"]
          ]} />
        </CleanCard>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 lg:col-span-2">
          <p className="text-sm font-semibold text-slate-950">Mock capture payload</p>
          <pre className="mt-3 overflow-x-auto rounded-2xl bg-white p-4 text-xs leading-6 text-slate-600 ring-1 ring-slate-200">
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
      <div className="grid gap-3 p-5">
        {rolePlayScenarios.map((scenario) => (
          <article className="rounded-2xl border border-slate-200 bg-white p-4 hover:bg-slate-50" key={scenario.id}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase text-slate-400">{scenario.persona}</p>
                <h3 className="mt-1 text-lg font-semibold text-slate-950">{scenario.objection}</h3>
              </div>
              <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">{scenario.difficulty}</span>
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-600">{scenario.goal}</p>
            <p className="mt-3 rounded-2xl bg-slate-50 p-3 text-sm leading-6 text-slate-700">{scenario.coachPrompt}</p>
          </article>
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-3 p-5">
      {mysteryShopRuns.map((run) => (
        <article className="rounded-2xl border border-slate-200 bg-white p-4 hover:bg-slate-50" key={run.id}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase text-slate-400">{run.shopperPersona}</p>
              <h3 className="mt-1 text-lg font-semibold text-slate-950">{run.property}</h3>
            </div>
            <span className="rounded-2xl bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700">{run.score}</span>
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-600">{run.finding}</p>
          <p className="mt-2 text-xs leading-5 text-slate-500">{run.followUp}</p>
        </article>
      ))}
    </div>
  );
}

function TranscriptReview({
  activeSegmentId,
  jumpTo,
  segmentRefs
}: {
  activeSegmentId: string;
  jumpTo: (segmentId: string, play?: boolean) => void;
  segmentRefs: MutableRefObject<Record<string, HTMLDivElement | null>>;
}) {
  return (
    <div className="max-h-[680px] overflow-y-auto p-5">
      <div className="space-y-3">
        {tourRidealongDemo.transcript.map((segment) => {
          const speaker = tourRidealongDemo.speakers[segment.speakerId];
          const active = segment.id === activeSegmentId;
          const insight = segment.insightId
            ? tourRidealongDemo.insights.find((item) => item.id === segment.insightId)
            : null;

          return (
            <div
              className={cn("rounded-2xl border p-4 transition-colors", getSegmentTone(segment, active))}
              key={segment.id}
              ref={(node) => {
                segmentRefs.current[segment.id] = node;
              }}
            >
              <button className="grid w-full grid-cols-[52px_minmax(0,1fr)] gap-3 text-left" onClick={() => jumpTo(segment.id, true)} type="button">
                <span className="rounded-xl bg-slate-100 px-2 py-2 text-center text-xs font-semibold text-slate-600">
                  {formatTime(segment.start)}
                </span>
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex h-8 min-w-8 items-center justify-center rounded-full px-2 text-xs font-bold text-slate-950" style={{ backgroundColor: speaker.softColor }}>
                      {speaker.name.replace("Speaker ", "S")}
                    </span>
                    <span className="text-sm font-semibold text-slate-950">{speaker.name}</span>
                    <span className="text-xs text-slate-500">{speaker.role}</span>
                    {insight ? (
                      <span className={cn("rounded-full border px-2 py-0.5 text-[11px] font-semibold", getInsightTone(insight.scoreImpact))}>
                        {insight.scoreImpact === "gained" ? "point gained" : insight.scoreImpact === "lost" ? "coaching moment" : "tone note"}
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-2 block text-sm leading-6 text-slate-700 sm:text-[15px]">{segment.text}</span>
                </span>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ActionCard({ actionLabel, nextAction }: { actionLabel: string; nextAction: string }) {
  return (
    <section className="rounded-[24px] border border-slate-200 bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase text-blue-700">Recommended action</p>
          <h2 className="mt-2 text-lg font-semibold text-slate-950">{actionLabel}</h2>
        </div>
        <Sparkles className="mt-1 h-5 w-5 shrink-0 text-blue-600" />
      </div>
      <p className="mt-3 text-sm leading-6 text-slate-700">{nextAction}</p>
    </section>
  );
}

function ReviewPanel({
  activeInsight,
  jumpTo
}: {
  activeInsight: CoachingInsight;
  jumpTo: (segmentId: string, play?: boolean) => void;
}) {
  return (
    <>
      <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_12px_36px_rgba(15,23,42,0.05)]">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-950">
          <MessageSquareText className="h-5 w-5 text-blue-600" />
          Active AI Comment
        </h2>
        <InsightBody insight={activeInsight} onJump={jumpTo} />
      </section>

      <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_12px_36px_rgba(15,23,42,0.05)]">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase text-slate-400">Rubric</p>
            <h2 className="mt-1 text-lg font-semibold text-slate-950">Collaborative solution design</h2>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-center">
            <div className="text-2xl font-semibold text-blue-700">{tourRidealongDemo.recording.overallScore.toFixed(1)}</div>
            <div className="text-[11px] font-semibold uppercase text-slate-500">overall</div>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {tourRidealongDemo.rubric.map((item) => (
            <button
              className="w-full rounded-2xl border border-slate-200 bg-white p-3 text-left hover:bg-slate-50"
              key={item.id}
              onClick={() => jumpTo(item.evidenceSegmentIds[0]!)}
              type="button"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="min-w-0 text-sm font-semibold text-slate-950">{item.label}</span>
                <span className="text-sm font-semibold text-slate-700">{item.score.toFixed(1)}</span>
              </div>
              <div className="mt-2 h-2 rounded-full bg-slate-100">
                <div className="h-2 rounded-full bg-blue-600" style={{ width: `${Math.min(100, item.score * 10)}%` }} />
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-500">{item.summary}</p>
            </button>
          ))}
        </div>
      </section>
    </>
  );
}

function ModePanel({ activeModeId }: { activeModeId: RidealongModeId }) {
  const items = activeModeId === "record"
    ? ["Confirm consent", "Attach property context", "Capture all speakers", "Send to review queue"]
    : activeModeId === "roleplay"
      ? ["Pick persona", "Practice objection", "Score the response", "Save the best wording"]
      : ["Run shopper scenario", "Compare team behavior", "Flag missed steps", "Assign coaching follow-up"];

  return (
    <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_12px_36px_rgba(15,23,42,0.05)]">
      <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-950">
        <CheckCircle2 className="h-5 w-5 text-blue-600" />
        Workflow checklist
      </h2>
      <div className="mt-4 space-y-2">
        {items.map((item) => (
          <div className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3 text-sm font-medium text-slate-700" key={item}>
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            {item}
          </div>
        ))}
      </div>

      <div className="mt-5 space-y-2">
        {recordWorkflowSteps.map((step) => (
          <div className="rounded-2xl border border-slate-200 bg-white p-3" key={step.id}>
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
              <span className={cn("h-2.5 w-2.5 rounded-full", step.status === "complete" ? "bg-emerald-500" : step.status === "active" ? "bg-blue-600" : "bg-slate-300")} />
              {step.label}
            </div>
            <p className="mt-1 text-xs leading-5 text-slate-500">{step.detail}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function AudioDock({
  audioRef,
  currentTime,
  duration,
  jumpTo,
  progress,
  setCurrentTime
}: {
  audioRef: MutableRefObject<HTMLAudioElement | null>;
  currentTime: number;
  duration: number;
  jumpTo: (segmentId: string, play?: boolean) => void;
  progress: number;
  setCurrentTime: (time: number) => void;
}) {
  return (
    <section className="sticky bottom-0 z-20 border-t border-slate-200 bg-white/95 px-5 py-4 backdrop-blur sm:px-8">
      <div className="mx-auto grid max-w-[1180px] gap-4 rounded-[24px] border border-slate-200 bg-white p-4 shadow-[0_12px_36px_rgba(15,23,42,0.08)] lg:grid-cols-[340px_minmax(0,1fr)] lg:items-center">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
            <Volume2 className="h-4 w-4 text-blue-600" />
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
          <div className="mb-2 flex items-center justify-between gap-3 text-xs text-slate-500">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
          <div className="relative h-2 rounded-full bg-slate-100">
            <div className="absolute inset-y-0 left-0 rounded-full bg-blue-600" style={{ width: `${progress}%` }} />
          </div>

          <div className="mt-3 grid gap-2">
            {tourRidealongDemo.speakerTracks.map((track) => {
              const speaker = tourRidealongDemo.speakers[track.speakerId];
              return (
                <div className="grid grid-cols-[88px_minmax(0,1fr)] items-center gap-3" key={track.speakerId}>
                  <div className="min-w-0 text-xs">
                    <div className="truncate font-semibold text-slate-950">{speaker.name}</div>
                    <div className="text-slate-500">{speaker.talkTimePercent}% talk</div>
                  </div>
                  <div className="relative h-5 rounded-full bg-slate-100">
                    {track.segments.map((segment) => (
                      <button
                        aria-label={`${speaker.name} at ${formatTime(segment.start)}`}
                        className="absolute top-1 h-3 rounded-full transition-transform hover:scale-y-125 focus:outline-none focus:ring-2 focus:ring-blue-300"
                        key={segment.id}
                        onClick={() => jumpTo(segment.segmentId, true)}
                        style={{
                          backgroundColor: speaker.color,
                          left: `${(segment.start / duration) * 100}%`,
                          width: `${Math.max(0.8, ((segment.end - segment.start) / duration) * 100)}%`
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
  );
}

function InsightBody({
  insight,
  onJump
}: {
  insight: CoachingInsight;
  onJump: (segmentId: string, play?: boolean) => void;
}) {
  return (
    <div className="mt-4 space-y-3">
      <InsightLine label="What happened" text={insight.whatHappened} />
      <InsightLine label="Why it matters" text={insight.whyItMatters} />
      {insight.suggestedWording ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-3">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase text-blue-600">
            <Sparkles className="h-4 w-4" />
            Suggested wording
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-700">{insight.suggestedWording}</p>
        </div>
      ) : null}
      <button
        className="inline-flex min-h-10 items-center gap-2 rounded-full border border-blue-300 bg-white px-4 text-sm font-semibold text-blue-700 hover:bg-slate-50"
        onClick={() => onJump(insight.segmentId, true)}
        type="button"
      >
        <Play className="h-4 w-4 fill-current" />
        Play moment
      </button>
    </div>
  );
}

function InsightLine({ label, text }: { label: string; text: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3">
      <div className="text-xs font-semibold uppercase text-slate-400">{label}</div>
      <p className="mt-2 text-sm leading-6 text-slate-700">{text}</p>
    </div>
  );
}

function DataRows({ rows }: { rows: Array<[string, string]> }) {
  return (
    <div className="mt-3 divide-y divide-slate-100">
      {rows.map(([label, value]) => (
        <div className="flex items-center justify-between gap-3 py-2 text-sm" key={label}>
          <span className="text-slate-500">{label}</span>
          <span className="text-right font-medium text-slate-950">{value}</span>
        </div>
      ))}
    </div>
  );
}

function CleanCard({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-950">
        <span className="text-blue-600">{icon}</span>
        {title}
      </h3>
      {children}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 px-4 py-3">
      <div className="text-2xl font-semibold text-slate-950">{value}</div>
      <div className="text-xs font-semibold uppercase text-slate-500">{label}</div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white px-3 py-3 ring-1 ring-slate-200">
      <div className="truncate text-sm font-semibold text-slate-950">{value}</div>
      <div className="mt-1 text-[10px] font-semibold uppercase text-slate-400">{label}</div>
    </div>
  );
}

function IconButton({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <button aria-label={label} className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-800 hover:bg-slate-200" type="button">
      {icon}
    </button>
  );
}

function NavLink({ active, href, icon, label }: { active?: boolean; href: string; icon: ReactNode; label: string }) {
  return (
    <a
      className={cn(
        "flex min-h-11 items-center gap-3 rounded-full px-4 text-sm font-semibold",
        active ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-100"
      )}
      href={href}
    >
      {icon}
      {label}
    </a>
  );
}

function SidebarLabel({ children }: { children: ReactNode }) {
  return <div className="px-4 text-xs font-semibold uppercase text-slate-400">{children}</div>;
}
