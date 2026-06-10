"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  Bell,
  Bookmark,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  Circle,
  FileText,
  Filter,
  HelpCircle,
  Home,
  Link2,
  ListChecks,
  MessageSquare,
  Mic,
  MoreHorizontal,
  Pause,
  Pencil,
  Play,
  Plus,
  RotateCw,
  Search,
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

import { tourRidealongDemo, type TranscriptSegment } from "./demoData";

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
  const isRidealongPage = pathname.includes("tour-ridealong");
  const navItems = isRidealongPage
    ? [
        { label: "Tours", href: "/tour-new", active: false },
        { label: "Library", href: "/tour-dashboard-preview", active: false },
        { label: "Ridealongs", href: "/tour-ridealong", active: true },
        { label: "Team", href: "/tour-dashboard-preview", active: false },
        { label: "Reports", href: "/tour-dashboard-preview", active: false }
      ]
    : [
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
            {isRidealongPage ? "Tour" : "Tour.video"}
          </a>
          <nav className="hidden h-full items-center gap-7 text-sm font-semibold text-[#4b5563] md:flex">
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
          {isRidealongPage ? (
            <div className="flex min-w-0 items-center gap-4">
              <div className="hidden h-10 w-[21rem] items-center gap-2 rounded-xl border border-black/10 bg-white px-3 text-sm text-[#667085] shadow-sm lg:flex">
                <Search className="h-4 w-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate">Search tours, people, or notes...</span>
                <span className="rounded-md bg-[#f5f7fb] px-2 py-0.5 text-xs font-semibold text-[#667085]">⌘ K</span>
              </div>
              <button className="relative hidden h-10 w-10 place-items-center rounded-full border border-black/10 bg-white text-[#475467] shadow-sm sm:grid" type="button">
                <Bell className="h-4 w-4" />
                <span className="absolute right-1.5 top-1.5 grid h-4 w-4 place-items-center rounded-full bg-[#ef4444] text-[10px] font-bold text-white">
                  3
                </span>
              </button>
              <button className="inline-flex items-center gap-3 rounded-full bg-white py-1 pl-1 pr-2 text-sm font-semibold text-[#111827]" type="button">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-[#f0d7c5] text-xs">AJ</span>
                <span className="hidden text-left leading-tight sm:block">
                  <span className="block text-sm">Alex Johnson</span>
                  <span className="block text-xs font-medium text-[#667085]">Leasing Manager</span>
                </span>
                <ChevronDown className="h-4 w-4 text-[#6b7280]" />
              </button>
            </div>
          ) : (
            <button className="inline-flex items-center gap-2 rounded-full bg-[#f3f6fb] py-1 pl-1 pr-2 text-sm font-semibold text-[#111827]" type="button">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-[#e8edf6]">JD</span>
              <ChevronDown className="h-4 w-4 text-[#6b7280]" />
            </button>
          )}
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
  const [reviewTab, setReviewTab] = useState<"comments" | "rubric">("comments");
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("tab") === "rubric") {
      setReviewTab("rubric");
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
  const transcript = tourRidealongDemo.transcript.slice(0, 9);
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
  const highlights = [
    "Speaker 1 clarified the actual review use case before design continued.",
    "Transcript-level coaching was identified as the most important product moment.",
    "Rubric feedback needs evidence and suggested rewrites, not only a final score.",
    "The next implementation step should end with a sharper owner and boundary."
  ];
  const topics = ["Transcript review", "Rubric", "Comments", "AI feedback", "Tone", "Next steps"];
  const questions = [
    { label: "Should comments attach to a timestamp or full segment?", time: "2:53" },
    { label: "Should rubric evidence open the transcript line directly?", time: "3:33" }
  ];
  const nextSteps = [
    { label: "Move comments and rubric into the left review rail", status: "Completed" },
    { label: "Persist reviewer comments by transcript segment", status: "Pending" },
    { label: "Connect rubric evidence pills to saved highlights", status: "Pending" }
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
      <section className="mx-auto max-w-[92rem] px-5 py-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <a className="inline-flex items-center gap-2 text-sm font-semibold text-[#667085]" href="/tour-new">
              <ChevronRight className="h-4 w-4 rotate-180" />
              Ridealongs
            </a>
            <div className="mt-5 flex items-center gap-3">
              <h1 className="text-4xl font-semibold tracking-normal text-[#101828]">Tour ridealong</h1>
              <Pencil className="h-5 w-5 text-[#667085]" />
            </div>
            <p className="mt-3 text-sm font-medium text-[#667085]">
              Downtown leasing walkthrough <span className="px-2">•</span> May 29, 2025 <span className="px-2">•</span>
              10:00 AM <span className="px-2">•</span> {formatTime(tourRidealongDemo.recording.duration)}{" "}
              <span className="px-2">•</span> Emma Johnson
            </p>
          </div>
          <div className="flex gap-3">
            <button className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-black/10 bg-white px-4 text-sm font-semibold text-[#344054] shadow-sm" type="button">
              <Link2 className="h-4 w-4" />
              Share
            </button>
            <button className="grid h-11 w-11 place-items-center rounded-xl border border-black/10 bg-white text-[#344054] shadow-sm" type="button">
              <MoreHorizontal className="h-5 w-5" />
            </button>
          </div>
        </div>

        <section className="mt-6 grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)_360px]">
          <aside className="order-2 space-y-5 xl:order-1">
            <section className="rounded-[1.5rem] border border-black/10 bg-white p-4 shadow-sm">
              <div className="grid grid-cols-2 rounded-full bg-[#f5f7fb] p-1">
                {(["comments", "rubric"] as const).map((tab) => (
                  <button
                    className={`inline-flex h-10 items-center justify-center gap-2 rounded-full text-sm font-semibold capitalize transition ${
                      reviewTab === tab ? "bg-white text-[#101828] shadow-sm" : "text-[#667085] hover:text-[#101828]"
                    }`}
                    key={tab}
                    onClick={() => setReviewTab(tab)}
                    type="button"
                  >
                    {tab === "comments" ? <MessageSquare className="h-4 w-4" /> : <ClipboardCheck className="h-4 w-4" />}
                    {tab}
                  </button>
                ))}
              </div>

              {reviewTab === "comments" ? (
                <section className="mt-5">
                  <label className="text-sm font-semibold text-[#101828]" htmlFor="review-comment">
                    Add comment
                  </label>
                  <textarea
                    className="mt-3 min-h-28 w-full resize-none rounded-2xl border border-black/10 bg-[#f8fafc] p-3 text-sm leading-6 outline-none transition placeholder:text-[#98a2b3] focus:border-[#0071e3] focus:bg-white"
                    id="review-comment"
                    placeholder={`Comment on ${formatTime(activeSegment.start)}...`}
                  />
                  <button className="mt-3 inline-flex h-11 w-full items-center justify-center rounded-xl bg-[#0071e3] text-sm font-semibold text-white" type="button">
                    <Plus className="mr-2 h-4 w-4" />
                    Add to review
                  </button>

                  <div className="mt-5 space-y-3">
                    {comments.map((comment) => (
                      <article className="rounded-2xl bg-[#f5f7fb] p-4" key={comment.id}>
                        <div className="flex items-center justify-between gap-3">
                          <h3 className="text-sm font-semibold text-[#101828]">{comment.author}</h3>
                          <span className="text-xs font-semibold text-[#98a2b3]">{comment.time}</span>
                        </div>
                        <p className="mt-2 text-sm leading-6 text-[#475467]">{comment.text}</p>
                      </article>
                    ))}
                  </div>
                </section>
              ) : (
                <section className="mt-5 space-y-3">
                  {tourRidealongDemo.rubric.map((item) => (
                    <article className="rounded-2xl border border-black/10 p-4" key={item.id}>
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="text-sm font-semibold text-[#101828]">{item.label}</h3>
                        <span className="rounded-full bg-[#f5f7fb] px-2.5 py-1 text-xs font-bold text-[#101828]">
                          {item.score.toFixed(1)}
                        </span>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-[#667085]">{item.summary}</p>
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
            </section>
          </aside>

          <main className="order-1 min-w-0 space-y-5 xl:order-2">
            <section className="overflow-hidden rounded-[1.5rem] border border-black/10 bg-white shadow-sm">
              <div className="flex border-b border-black/10 px-5">
                <button className="h-14 border-b-2 border-[#0071e3] px-2 text-sm font-semibold text-[#0071e3]" type="button">
                  Review moments
                </button>
                <button className="ml-8 h-14 border-b-2 border-transparent px-2 text-sm font-semibold text-[#667085]" type="button">
                  Summary
                </button>
              </div>
              <audio
                onPause={() => setIsPlaying(false)}
                onPlay={() => setIsPlaying(true)}
                onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
                preload="metadata"
                ref={audioRef}
                src={tourRidealongDemo.recording.audioSrc}
              />
              <div className="flex items-center gap-5 p-5">
                <button
                  className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-[#0071e3] text-white shadow-[0_10px_24px_rgba(0,113,227,0.24)]"
                  onClick={togglePlayback}
                  type="button"
                >
                  {isPlaying ? <Pause className="h-5 w-5 fill-current" /> : <Play className="h-5 w-5 fill-current" />}
                </button>
                <span className="text-sm font-semibold text-[#475467]">{formatTime(currentTime || activeSegment.start)}</span>
                <div className="relative flex h-16 min-w-0 flex-1 items-center gap-1">
                  {Array.from({ length: 86 }).map((_, index) => (
                    <span
                      className={`w-0.5 rounded-full ${index < 42 ? "bg-[#0071e3]" : "bg-[#d7dee8]"}`}
                      key={index}
                      style={{ height: `${10 + ((index * 7) % 26)}px` }}
                    />
                  ))}
                  {["EJ", "PR", "EJ", "PR", "EJ"].map((label, index) => (
                    <span
                      className={`absolute top-0 grid h-6 w-6 place-items-center rounded-full text-[10px] font-bold ${
                        label === "EJ" ? "bg-[#dbeafe] text-[#0071e3]" : "bg-[#ede9fe] text-[#7c3aed]"
                      }`}
                      key={`${label}-${index}`}
                      style={{ left: `${18 + index * 17}%` }}
                    >
                      {label}
                    </span>
                  ))}
                </div>
                <span className="text-sm font-semibold text-[#475467]">{formatTime(tourRidealongDemo.recording.duration)}</span>
                <button className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm font-semibold text-[#344054]" type="button">
                  1x
                </button>
                <Volume2 className="h-5 w-5 text-[#667085]" />
              </div>
            </section>

            <section className="overflow-hidden rounded-[1.5rem] border border-black/10 bg-white shadow-sm">
              <div className="flex flex-col gap-4 border-b border-black/10 p-5 lg:flex-row lg:items-center lg:justify-between">
                <h2 className="text-xl font-semibold text-[#101828]">Transcript</h2>
                <div className="flex gap-3">
                  <div className="flex h-11 min-w-0 items-center gap-2 rounded-xl border border-black/10 bg-white px-3 text-sm text-[#667085] shadow-sm sm:w-64">
                    <Search className="h-4 w-4 shrink-0" />
                    <span className="truncate">Search transcript...</span>
                  </div>
                  <button className="inline-flex h-11 items-center gap-2 rounded-xl border border-black/10 bg-white px-3 text-sm font-semibold text-[#344054] shadow-sm" type="button">
                    <Filter className="h-4 w-4" />
                    Filters
                  </button>
                </div>
              </div>

              <div className="divide-y divide-black/10">
                {transcript.map((segment) => {
                  const active = segment.id === activeSegmentId;
                  const speaker = tourRidealongDemo.speakers[segment.speakerId];
                  const initials = speaker.name.replace("Speaker ", "S");
                  return (
                    <button
                      className={`grid w-full grid-cols-[4rem_9rem_minmax(0,1fr)_7rem_2rem] items-center gap-4 px-5 py-4 text-left transition ${
                        active ? "border-l-4 border-[#0071e3] bg-[#f3f8ff]" : "border-l-4 border-transparent hover:bg-[#fbfcfe]"
                      }`}
                      key={segment.id}
                      onClick={() => jumpTo(segment)}
                      type="button"
                    >
                      <span className="text-sm font-semibold text-[#475467]">{formatTime(segment.start)}</span>
                      <span className="flex items-center gap-3">
                        <span
                          className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-xs font-bold"
                          style={{ backgroundColor: speaker.softColor, color: speaker.color }}
                        >
                          {initials}
                        </span>
                        <span className="truncate text-sm font-semibold" style={{ color: speaker.color }}>
                          {speaker.name}
                        </span>
                      </span>
                      <span className="min-w-0 text-sm leading-6 text-[#344054]">{segment.text}</span>
                      <span className="justify-self-start rounded-lg bg-[#f5f7fb] px-2.5 py-1 text-xs font-semibold capitalize text-[#667085]">
                        {segment.kind || "Context"}
                      </span>
                      <Bookmark className="h-5 w-5 justify-self-end text-[#667085]" />
                    </button>
                  );
                })}
              </div>

              <div className="grid gap-4 border-t border-black/10 p-5 text-sm sm:grid-cols-3 lg:grid-cols-6">
                {[
                  ["Tour type", "On-site walkthrough"],
                  ["Property", "Downtown Lofts"],
                  ["Unit", "1203 (2BD)"],
                  ["Participants", "S0, S1"],
                  ["Tags", "+ Add tag"],
                  ["Created", "May 29, 2025"]
                ].map(([label, value]) => (
                  <div className="min-w-0" key={label}>
                    <p className="font-semibold text-[#667085]">{label}</p>
                    <p className="mt-1 truncate font-medium text-[#344054]">{value}</p>
                  </div>
                ))}
              </div>
            </section>
          </main>

          <aside className="order-3 space-y-5">
            <section className="flex items-center justify-between rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-[#101828]">Score</h2>
                <HelpCircle className="h-4 w-4 text-[#98a2b3]" />
              </div>
              <span className="rounded-xl bg-[#f5f7fb] px-3 py-2 text-sm font-semibold text-[#101828]">
                Score {tourRidealongDemo.recording.overallScore.toFixed(1)}
              </span>
            </section>

            <section className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-4">
                <div className="inline-flex items-center gap-2 text-base font-semibold text-[#4f46e5]">
                  <Sparkles className="h-5 w-5" />
                  AI note
                </div>
                <button className="inline-flex items-center gap-2 text-sm font-semibold text-[#0071e3]" type="button">
                  <RotateCw className="h-4 w-4" />
                  Regenerate
                </button>
              </div>
              <h3 className="mt-5 text-sm font-semibold text-[#101828]">Highlights</h3>
              <div className="mt-3 space-y-3">
                {highlights.map((highlight) => (
                  <div className="flex gap-3 text-sm leading-6 text-[#344054]" key={highlight}>
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#667085]" />
                    <span>{highlight}</span>
                  </div>
                ))}
              </div>
              <h3 className="mt-6 text-sm font-semibold text-[#101828]">Topics</h3>
              <div className="mt-3 flex flex-wrap gap-2">
                {topics.map((topic) => (
                  <span className="rounded-lg border border-[#d7e7ff] bg-[#f5f9ff] px-3 py-1.5 text-xs font-semibold text-[#0071e3]" key={topic}>
                    {topic}
                  </span>
                ))}
              </div>
              <div className="mt-5 rounded-xl bg-[#f8fafc] p-4">
                <p className="text-xs font-semibold uppercase tracking-normal text-[#98a2b3]">Selected feedback</p>
                <h3 className="mt-2 text-sm font-semibold text-[#101828]">{activeInsight.title}</h3>
                <p className="mt-2 text-sm leading-6 text-[#475467]">{activeInsight.whatHappened}</p>
              </div>
            </section>

            <section className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <HelpCircle className="h-5 w-5 text-[#7c3aed]" />
                <h2 className="text-lg font-semibold text-[#101828]">Questions</h2>
                <span className="rounded-full bg-[#eef5ff] px-2 py-0.5 text-xs font-bold text-[#0071e3]">{questions.length}</span>
              </div>
              <div className="mt-4 divide-y divide-black/10">
                {questions.map((question) => (
                  <button className="flex w-full items-center gap-3 py-3 text-left text-sm font-medium text-[#344054]" key={question.label} type="button">
                    <span className="min-w-0 flex-1">{question.label}</span>
                    <span className="text-[#667085]">{question.time}</span>
                    <ChevronRight className="h-4 w-4 text-[#667085]" />
                  </button>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <ListChecks className="h-5 w-5 text-[#0071e3]" />
                <h2 className="text-lg font-semibold text-[#101828]">Next steps</h2>
                <span className="rounded-full bg-[#eef5ff] px-2 py-0.5 text-xs font-bold text-[#0071e3]">{nextSteps.length}</span>
              </div>
              <div className="mt-4 space-y-3">
                {nextSteps.map((step) => (
                  <div className="flex items-center gap-3 text-sm" key={step.label}>
                    {step.status === "Completed" ? (
                      <CheckCircle2 className="h-5 w-5 shrink-0 text-[#16a34a]" />
                    ) : (
                      <Circle className="h-5 w-5 shrink-0 text-[#98a2b3]" />
                    )}
                    <span className="min-w-0 flex-1 font-medium text-[#344054]">{step.label}</span>
                    <span className={step.status === "Completed" ? "text-[#16a34a]" : "text-[#667085]"}>{step.status}</span>
                  </div>
                ))}
              </div>
            </section>

            <button className="inline-flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-[#0071e3] text-base font-semibold text-white shadow-[0_12px_30px_rgba(0,113,227,0.24)]" type="button">
              <Send className="h-5 w-5" />
              Send recap
            </button>
          </aside>
        </section>
      </section>
    </Shell>
  );
}
