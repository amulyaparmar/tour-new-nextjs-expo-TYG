"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  Circle,
  FileText,
  Home,
  MessageSquare,
  Mic,
  Pause,
  Pencil,
  Play,
  Plus,
  Send,
  Settings2,
  Sparkles,
  Square,
  Triangle,
  UploadCloud,
  UserRound,
  UsersRound,
  Volume2
} from "lucide-react";

import { tourRidealongDemo, type SpeakerId, type TranscriptSegment } from "./demoData";

function formatTime(seconds: number) {
  const wholeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(wholeSeconds / 60);
  const remainingSeconds = wholeSeconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

export function TourRidealongClient() {
  const pathname = usePathname();
  const isRecordPage = pathname.includes("tour-record");

  if (isRecordPage) {
    return <TourRecordView />;
  }

  return <TourReviewView />;
}

function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const navItems = [
    { label: "Record", href: "/tour-record", active: pathname.includes("tour-record") },
    { label: "Review", href: "/tour-ridealong", active: pathname.includes("tour-ridealong") },
    { label: "Activity", href: "/tour-dashboard-preview", active: pathname.includes("activity") }
  ];

  return (
    <main className="min-h-screen bg-[#fbfbfd] text-[#111827]">
      <header className="sticky top-0 z-30 border-b border-black/[0.06] bg-white/92 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[92rem] items-center justify-between px-5">
          <a className="inline-flex items-center gap-3 text-lg font-semibold tracking-normal text-[#111827]" href="/">
            <span className="grid h-6 w-6 place-items-center rounded-md text-[#006ce5]">
              <Triangle className="h-5 w-5 rotate-90 fill-current stroke-current" />
            </span>
            Tour.video
          </a>
          <nav className="hidden h-full items-center gap-7 text-sm font-semibold text-[#4b5563] sm:flex">
            {navItems.map((item) => (
              <a
                className={`flex h-full items-center border-b-2 transition ${
                  item.active ? "border-[#006ce5] text-[#111827]" : "border-transparent hover:text-[#111827]"
                }`}
                href={item.href}
                key={item.label}
              >
                {item.label}
              </a>
            ))}
          </nav>
          <button className="inline-flex items-center gap-2 rounded-full bg-[#f3f6fb] py-1 pl-1 pr-2 text-sm font-semibold text-[#111827]" type="button">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-[#e8edf6]">JD</span>
            <ChevronDown className="h-4 w-4 text-[#6b7280]" />
          </button>
        </div>
      </header>
      {children}
    </main>
  );
}

function TourRecordView() {
  const [isRecording, setIsRecording] = useState(false);
  const tourDetails = [
    { label: "Tour type", value: "In-person", icon: UsersRound, tone: "text-[#006ce5] bg-[#eef5ff]" },
    { label: "Property", value: "Downtown Lofts", icon: Home, tone: "text-[#1f9d55] bg-[#edf9f1]" },
    { label: "Prospect", value: "Emma Johnson", icon: UserRound, tone: "text-[#7c3aed] bg-[#f4efff]" },
    { label: "Tour time", value: "Today, 10:00 AM", icon: CalendarDays, tone: "text-[#0071e3] bg-[#eef7ff]" }
  ];
  const features = [
    {
      title: "One button recording",
      detail: "Capture high-quality audio of the tour.",
      icon: Mic,
      tone: "text-[#16a34a]"
    },
    {
      title: "AI-ready context",
      detail: "Transcripts, notes, and highlights-ready to review.",
      icon: FileText,
      tone: "text-[#0071e3]"
    },
    {
      title: "Share & follow up",
      detail: "Send recaps and next steps to your team.",
      icon: UsersRound,
      tone: "text-[#7c3aed]"
    }
  ];
  const steps = [
    { title: "Confirm consent", detail: "Let the prospect know the tour will be recorded.", done: true },
    { title: "Start recording", detail: "Tap the microphone to begin.", done: isRecording },
    { title: "Capture the tour conversation", detail: "We'll capture audio and keep the context.", done: false },
    { title: "Send to review", detail: "Transcripts and AI notes will be ready.", done: false }
  ];

  return (
    <Shell>
      <section className="mx-auto grid max-w-[86rem] gap-10 px-5 py-10 lg:grid-cols-[0.78fr_1.22fr] lg:gap-16 lg:py-20">
        <div className="flex flex-col justify-center">
          <span className="inline-flex w-fit items-center gap-2 rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-semibold text-[#111827] shadow-sm">
            <span className="h-2 w-2 rounded-full bg-[#006ce5]" />
            Tour recorder
          </span>
          <h1 className="mt-7 max-w-xl text-[clamp(4rem,8vw,7rem)] font-semibold leading-[0.96] tracking-normal text-[#081226]">
            Capture the tour<span className="text-[#006ce5]">.</span>
          </h1>
          <p className="mt-7 max-w-lg text-xl font-medium leading-8 text-[#667085]">
            Record the conversation, keep the context, and prepare it for AI review.
          </p>

          <div className="mt-9 max-w-lg divide-y divide-black/[0.07]">
            {features.map((feature) => {
              const Icon = feature.icon;
              return (
                <div className="flex gap-5 py-5 first:pt-0" key={feature.title}>
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-black/10 bg-white shadow-sm">
                    <Icon className={`h-5 w-5 ${feature.tone}`} />
                  </span>
                  <div>
                    <h2 className="text-base font-semibold text-[#111827]">{feature.title}</h2>
                    <p className="mt-1 text-sm font-medium leading-6 text-[#667085]">{feature.detail}</p>
                  </div>
                </div>
              );
            })}
          </div>

          <section className="mt-10 max-w-lg rounded-[1.35rem] border border-black/10 bg-white p-4 shadow-sm">
            <p className="text-sm font-medium text-[#667085]">Current tour</p>
            <div className="mt-4 flex items-center gap-4">
              <div className="grid h-16 w-16 shrink-0 place-items-end overflow-hidden rounded-xl bg-[linear-gradient(135deg,#bfd4ee,#eef4fb)] p-2">
                <div className="grid h-12 w-10 grid-cols-3 gap-0.5 rounded-t-lg bg-white/90 p-1 shadow-sm">
                  {Array.from({ length: 12 }).map((_, index) => (
                    <span className="rounded-sm bg-[#9fb3c8]" key={index} />
                  ))}
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-base font-semibold text-[#111827]">Downtown Lofts</h2>
                <p className="mt-1 truncate text-sm font-medium text-[#667085]">123 Main St, Austin, TX 78701</p>
              </div>
              <button className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl border border-black/10 bg-white px-3 text-xs font-semibold text-[#344054] shadow-sm" type="button">
                <Pencil className="h-3.5 w-3.5" />
                Change tour
              </button>
            </div>
          </section>
        </div>

        <section className="self-center rounded-[1.75rem] border border-black/[0.06] bg-white p-6 shadow-[0_28px_80px_rgba(16,24,40,0.08)] sm:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="inline-flex items-center gap-3 text-lg font-medium text-[#344054]">
              <span className={`h-2.5 w-2.5 rounded-full ${isRecording ? "bg-[#ff3b30]" : "bg-[#0f9f5e]"}`} />
              {isRecording ? "Recording" : "Ready"}
            </div>
            <button className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-black/10 bg-white px-4 text-sm font-semibold text-[#344054] shadow-sm" type="button">
              <Settings2 className="h-4 w-4" />
              Recording settings
            </button>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {tourDetails.map((item) => {
              const Icon = item.icon;
              return (
                <div className="flex min-w-0 items-center gap-3 rounded-xl border border-black/10 bg-white p-3 shadow-sm" key={item.label}>
                  <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${item.tone}`}>
                    <Icon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[#344054]">{item.label}</p>
                    <p className="text-[11px] font-medium leading-4 text-[#667085]">{item.value}</p>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="py-14 text-center sm:py-16">
            <button
              className={`mx-auto grid h-36 w-36 place-items-center rounded-full transition ${
                isRecording
                  ? "bg-[#ff3b30] text-white shadow-[0_0_0_18px_rgba(255,59,48,0.10),0_0_0_36px_rgba(255,59,48,0.06)]"
                  : "bg-[#006ce5] text-white shadow-[0_0_0_18px_rgba(0,108,229,0.10),0_0_0_36px_rgba(0,108,229,0.06)] hover:bg-[#0576f6]"
              }`}
              onClick={() => setIsRecording((value) => !value)}
              type="button"
            >
              {isRecording ? <Square className="h-12 w-12 fill-current" /> : <Mic className="h-14 w-14" />}
            </button>
            <h2 className="mt-9 text-xl font-semibold text-[#111827]">
              {isRecording ? "Recording tour audio" : "Tap to start recording"}
            </h2>
            <div className="mx-auto mt-3 flex h-5 w-44 items-center justify-center gap-1">
              {Array.from({ length: 28 }).map((_, index) => (
                <span
                  className="w-0.5 rounded-full bg-[#98a2b3]"
                  key={index}
                  style={{ height: `${6 + (index % 6) * 2}px` }}
                />
              ))}
            </div>
            <p className="mt-2 text-sm font-medium text-[#667085]">
              {isRecording ? "00:03:48 elapsed" : "Audio only - High quality"}
            </p>
          </div>

          <div className="overflow-hidden rounded-xl border border-black/10">
            {steps.map((step) => (
              <div className="flex items-center gap-4 border-b border-black/10 p-4 last:border-b-0" key={step.title}>
                {step.done ? (
                  <CheckCircle2 className="h-6 w-6 shrink-0 text-[#16a34a]" />
                ) : (
                  <Circle className="h-6 w-6 shrink-0 text-[#98a2b3]" />
                )}
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold text-[#111827]">{step.title}</h3>
                  <p className="mt-0.5 text-xs font-medium text-[#667085]">{step.detail}</p>
                </div>
                {step.done && step.title === "Confirm consent" ? (
                  <span className="text-xs font-semibold text-[#16a34a]">Confirmed</span>
                ) : (
                  <ChevronRight className="h-4 w-4 shrink-0 text-[#667085]" />
                )}
              </div>
            ))}
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <button className="inline-flex h-14 items-center justify-center gap-2 rounded-xl border border-[#006ce5] bg-white text-base font-semibold text-[#006ce5]" type="button">
              <UploadCloud className="h-5 w-5" />
              Upload recording
            </button>
            <a className="inline-flex h-14 items-center justify-center gap-2 rounded-xl bg-[#006ce5] text-base font-semibold text-white shadow-[0_12px_30px_rgba(0,108,229,0.22)]" href="/tour-ridealong">
              <Send className="h-5 w-5" />
              Send to review
            </a>
          </div>
        </section>
      </section>
    </Shell>
  );
}

function TourReviewView() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const defaultSegment = tourRidealongDemo.transcript[0]!;
  const defaultInsight = tourRidealongDemo.insights[0]!;
  const [activeSegmentId, setActiveSegmentId] = useState(defaultSegment.id);
  const [rightPanelTab, setRightPanelTab] = useState<"comments" | "rubric">("comments");
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("tab") === "rubric") {
      setRightPanelTab("rubric");
    }
  }, []);

  const activeSegment = useMemo(
    () => tourRidealongDemo.transcript.find((segment) => segment.id === activeSegmentId) || defaultSegment,
    [activeSegmentId, defaultSegment]
  );
  const activeInsight = useMemo(() => {
    return tourRidealongDemo.insights.find((insight) => insight.segmentId === activeSegment?.id)
      || defaultInsight;
  }, [activeSegment?.id, defaultInsight]);
  const transcript = tourRidealongDemo.transcript.slice(0, 12);
  const speakerEntries = Object.entries(tourRidealongDemo.speakers) as Array<
    [SpeakerId, (typeof tourRidealongDemo.speakers)[SpeakerId]]
  >;
  const comments = [
    {
      id: "comment-1",
      author: "Reviewer",
      time: "3:53",
      text: "This is the key product moment. Keep the transcript-level coaching, not only the final score."
    },
    {
      id: "comment-2",
      author: "AI draft",
      time: "6:06",
      text: "Close the meeting with one concrete owner and implementation boundary."
    }
  ];

  const jumpTo = (segment: TranscriptSegment) => {
    setActiveSegmentId(segment.id);
    setCurrentTime(segment.start);
    if (audioRef.current) {
      audioRef.current.currentTime = segment.start;
      void audioRef.current.play().then(() => setIsPlaying(true)).catch(() => undefined);
    }
  };

  const togglePlayback = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (audio.paused) {
      void audio.play().then(() => setIsPlaying(true)).catch(() => undefined);
      return;
    }

    audio.pause();
    setIsPlaying(false);
  };

  return (
    <Shell>
      <section className="mx-auto max-w-[92rem] px-5 py-10 lg:py-12">
        <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-end">
          <div>
            <p className="text-sm font-semibold text-[#86868b]">Tour ridealong</p>
            <h1 className="mt-4 text-[clamp(2.75rem,5.5vw,5.75rem)] font-semibold leading-[0.95] tracking-normal">
              Review every voice clearly.
            </h1>
          </div>
          <p className="max-w-2xl text-xl font-medium leading-8 text-[#6e6e73]">
            Split the conversation by speaker, read the AI summary in context, and keep comments and rubric review open beside the recording.
          </p>
        </div>

        <section className="mt-9 grid gap-5 xl:grid-cols-[minmax(0,1.12fr)_minmax(320px,0.8fr)_340px]">
          <div className="rounded-[2rem] bg-white p-5 shadow-[0_28px_80px_rgba(0,0,0,0.08)] sm:p-6">
            <div className="flex flex-col gap-5 border-b border-black/10 pb-6 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium text-[#86868b]">{tourRidealongDemo.recording.dateLabel}</p>
                <h2 className="mt-1 text-2xl font-semibold tracking-normal">{tourRidealongDemo.recording.title}</h2>
              </div>
              <div className="rounded-full bg-[#f5f5f7] px-4 py-2 text-sm font-semibold text-[#1d1d1f]">
                Score {tourRidealongDemo.recording.overallScore.toFixed(1)}
              </div>
            </div>

            <div className="mt-6 rounded-[1.5rem] bg-[#111113] p-5 text-white">
              <audio
                onPause={() => setIsPlaying(false)}
                onPlay={() => setIsPlaying(true)}
                onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
                preload="metadata"
                ref={audioRef}
                src={tourRidealongDemo.recording.audioSrc}
              />
              <div className="flex items-center gap-4">
                <button
                  className="grid h-14 w-14 place-items-center rounded-full bg-white text-black"
                  onClick={togglePlayback}
                  type="button"
                >
                  {isPlaying ? <Pause className="h-5 w-5 fill-current" /> : <Play className="h-5 w-5 fill-current" />}
                </button>
                <div className="min-w-0 flex-1">
                  <div className="mb-2 flex justify-between text-xs font-medium text-white/50">
                    <span>{formatTime(currentTime)}</span>
                    <span>{formatTime(tourRidealongDemo.recording.duration)}</span>
                  </div>
                  <div className="h-2 rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-[#0071e3]"
                      style={{
                        width: `${Math.min(100, (currentTime / tourRidealongDemo.recording.duration) * 100)}%`
                      }}
                    />
                  </div>
                </div>
                <Volume2 className="hidden h-5 w-5 text-white/50 sm:block" />
              </div>
            </div>

            <div className="mt-6">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-base font-semibold tracking-normal">Speaker view</h3>
                <span className="rounded-full bg-[#f5f5f7] px-3 py-1 text-xs font-semibold text-[#6e6e73]">
                  Split conversation
                </span>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                {speakerEntries.map(([speakerId, speaker]) => {
                  const speakerTranscript = transcript.filter((segment) => segment.speakerId === speakerId);
                  return (
                    <section className="min-w-0 rounded-[1.5rem] bg-[#f5f5f7] p-4" key={speakerId}>
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <span
                            className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-bold text-[#1d1d1f]"
                            style={{ backgroundColor: speaker.softColor }}
                          >
                            {speaker.name.replace("Speaker ", "S")}
                          </span>
                          <div className="min-w-0">
                            <h4 className="truncate text-sm font-semibold text-[#1d1d1f]">{speaker.name}</h4>
                            <p className="truncate text-xs font-medium text-[#86868b]">{speaker.role}</p>
                          </div>
                        </div>
                        <span className="shrink-0 text-xs font-semibold text-[#86868b]">
                          {speaker.talkTimePercent}% talk
                        </span>
                      </div>

                      <div className="max-h-[34rem] space-y-3 overflow-y-auto pr-1">
                        {speakerTranscript.map((segment) => {
                          const active = segment.id === activeSegmentId;
                          return (
                            <button
                              className={`w-full rounded-2xl p-3 text-left transition ${
                                active
                                  ? "bg-white text-[#0071e3] shadow-[0_10px_30px_rgba(0,0,0,0.06)]"
                                  : "bg-white/60 text-[#1d1d1f] hover:bg-white"
                              }`}
                              key={segment.id}
                              onClick={() => jumpTo(segment)}
                              type="button"
                            >
                              <span className="flex items-center justify-between gap-3 text-xs font-semibold">
                                <span>{formatTime(segment.start)}</span>
                                {segment.kind ? (
                                  <span className="rounded-full bg-black/[0.04] px-2 py-0.5 text-[0.68rem] uppercase tracking-normal text-[#6e6e73]">
                                    {segment.kind}
                                  </span>
                                ) : null}
                              </span>
                              <span className="mt-2 block text-sm leading-6 text-[#424245]">{segment.text}</span>
                            </button>
                          );
                        })}
                      </div>
                    </section>
                  );
                })}
              </div>
            </div>
          </div>

          <section className="rounded-[2rem] bg-white p-5 shadow-[0_28px_80px_rgba(0,0,0,0.08)] sm:p-6">
            <div className="flex items-center justify-between gap-4 border-b border-black/10 pb-5">
              <div>
                <p className="text-sm font-semibold text-[#86868b]">AI review</p>
                <h2 className="mt-1 text-2xl font-semibold tracking-normal">Summary and feedback</h2>
              </div>
              <span className="rounded-full bg-[#f5f5f7] px-3 py-1 text-sm font-semibold text-[#1d1d1f]">
                Score {tourRidealongDemo.recording.overallScore.toFixed(1)}
              </span>
            </div>

            <section className="mt-5 rounded-[1.5rem] bg-[#f5f5f7] p-5">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#0071e3]">
                <Sparkles className="h-4 w-4" />
                Summary
              </div>
              <p className="mt-4 text-base leading-7 text-[#424245]">
                This recording is a collaborative product review for tour recording, ridealong feedback, transcript review,
                and rubric-based coaching. The strongest product direction is speaker-separated transcript evidence with
                human comments beside AI-generated coaching.
              </p>
            </section>

            <section className="mt-4 rounded-[1.5rem] border border-black/10 p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[#86868b]">Selected moment</p>
                  <h3 className="mt-1 text-xl font-semibold tracking-normal">{activeInsight.title}</h3>
                </div>
                <span className="shrink-0 rounded-full bg-[#f5f5f7] px-3 py-1 text-xs font-semibold capitalize text-[#6e6e73]">
                  {activeInsight.scoreImpact}
                </span>
              </div>

              <p className="mt-4 text-base leading-7 text-[#424245]">{activeInsight.whatHappened}</p>
              <div className="mt-4 rounded-2xl bg-[#f5f5f7] p-4">
                <p className="text-xs font-semibold uppercase tracking-normal text-[#86868b]">Why it matters</p>
                <p className="mt-2 text-sm leading-6 text-[#424245]">{activeInsight.whyItMatters}</p>
              </div>
              {activeInsight.suggestedWording ? (
                <div className="mt-4 rounded-2xl bg-[#eef5ff] p-4 text-sm leading-6 text-[#1d1d1f]">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-normal text-[#0071e3]">Suggested rewrite</p>
                  {activeInsight.suggestedWording}
                </div>
              ) : null}
            </section>

            <button className="mt-5 inline-flex h-12 w-full items-center justify-center rounded-full bg-[#1d1d1f] text-sm font-semibold text-white">
              <Send className="mr-2 h-4 w-4" />
              Create follow-up from review
            </button>
          </section>

          <aside className="rounded-[2rem] bg-white p-5 shadow-[0_28px_80px_rgba(0,0,0,0.08)] sm:p-6">
            <div className="grid grid-cols-2 rounded-full bg-[#f5f5f7] p-1">
              {(["comments", "rubric"] as const).map((tab) => (
                <button
                  className={`inline-flex h-10 items-center justify-center gap-2 rounded-full text-sm font-semibold capitalize transition ${
                    rightPanelTab === tab ? "bg-white text-[#1d1d1f] shadow-sm" : "text-[#6e6e73] hover:text-[#1d1d1f]"
                  }`}
                  key={tab}
                  onClick={() => setRightPanelTab(tab)}
                  type="button"
                >
                  {tab === "comments" ? <MessageSquare className="h-4 w-4" /> : <ClipboardCheck className="h-4 w-4" />}
                  {tab}
                </button>
              ))}
            </div>

            {rightPanelTab === "comments" ? (
              <section className="mt-5">
                <div className="rounded-[1.5rem] border border-black/10 p-4">
                  <label className="text-sm font-semibold text-[#1d1d1f]" htmlFor="review-comment">
                    Add comment
                  </label>
                  <textarea
                    className="mt-3 min-h-24 w-full resize-none rounded-2xl border border-black/10 bg-[#f5f5f7] p-3 text-sm leading-6 outline-none transition placeholder:text-[#86868b] focus:border-[#0071e3] focus:bg-white"
                    id="review-comment"
                    placeholder={`Comment on ${formatTime(activeSegment.start)}...`}
                  />
                  <button className="mt-3 inline-flex h-10 w-full items-center justify-center rounded-full bg-[#0071e3] text-sm font-semibold text-white" type="button">
                    <Plus className="mr-2 h-4 w-4" />
                    Add to review
                  </button>
                </div>

                <div className="mt-5 space-y-3">
                  {comments.map((comment) => (
                    <article className="rounded-[1.35rem] bg-[#f5f5f7] p-4" key={comment.id}>
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="text-sm font-semibold text-[#1d1d1f]">{comment.author}</h3>
                        <span className="text-xs font-semibold text-[#86868b]">{comment.time}</span>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-[#424245]">{comment.text}</p>
                    </article>
                  ))}
                </div>
              </section>
            ) : (
              <section className="mt-5 space-y-3">
                {tourRidealongDemo.rubric.map((item) => (
                  <article className="rounded-[1.35rem] border border-black/10 p-4" key={item.id}>
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="text-sm font-semibold text-[#1d1d1f]">{item.label}</h3>
                      <span className="rounded-full bg-[#f5f5f7] px-2.5 py-1 text-xs font-bold text-[#1d1d1f]">
                        {item.score.toFixed(1)}
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-[#6e6e73]">{item.summary}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {item.evidenceSegmentIds.map((segmentId) => (
                        <button
                          className="rounded-full bg-[#eef5ff] px-2.5 py-1 text-xs font-semibold text-[#0071e3]"
                          key={segmentId}
                          onClick={() => setActiveSegmentId(segmentId)}
                          type="button"
                        >
                          {segmentId.replace("seg-", "#")}
                        </button>
                      ))}
                    </div>
                  </article>
                ))}
              </section>
            )}
          </aside>
        </section>
      </section>
    </Shell>
  );
}
