import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useAdminData } from "../data/AdminDataContext";
import {
  ChevronLeft,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  MessageSquare,
  Star,
  Send,
  Clock,
  ChevronDown,
  ChevronUp,
  TrendingUp,
  TrendingDown,
  Minus,
  Lightbulb,
  CheckCircle2,
  AlertCircle,
  Zap,
} from "lucide-react";
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer } from "recharts";

const SESSION = {
  id: 1,
  prospect: "Jordan Mitchell",
  unit: "2B – 850 sqft",
  property: "The Meridian",
  date: "Jun 12, 2026",
  duration: "24:18",
  agent: "Sarah K.",
  score: 91,
};

const TRANSCRIPT = [
  { time: 12, speaker: "Agent", text: "Hey Jordan, great to meet you! I'm Sarah, your leasing specialist today. Before we head up, can I ask — what's bringing you to The Meridian?" },
  { time: 38, speaker: "Prospect", text: "Yeah, we're thinking a spring move, maybe April or May. My partner and I both work from home so we really need a second bedroom." },
  { time: 52, speaker: "Agent", text: "Perfect timing, and that's actually ideal for what I want to show you. The 2B units on floors 8–12 have this south-facing corner layout — you'd both have a real work setup with natural light all day." },
  { time: 78, speaker: "Prospect", text: "Oh nice, that sounds ideal. What's the view like?" },
  { time: 89, speaker: "Agent", text: "It overlooks Riverside Park — you can actually see the water in the mornings. Let me show you the layout first, then we'll head up." },
  { time: 115, speaker: "Agent", text: "So the building also has a dedicated co-working lounge on the 4th floor — about 20 seats, standing desks, private call booths. Residents have said it's basically killed their WeWork subscriptions." },
  { time: 148, speaker: "Prospect", text: "That's actually huge. What about parking? We have two cars." },
  { time: 163, speaker: "Agent", text: "Yes, we have a two-car bundle available — it's $180 per month for both spots. Right now we're running a special where you get the first month of parking free with a 13-month lease." },
  { time: 195, speaker: "Prospect", text: "Interesting. What's the rent on the 2B?" },
  { time: 204, speaker: "Agent", text: "For the floor range we'd be looking at, starting at $2,850. With the move-in special we're running through June — one month free on a 13-month — that nets out to around $2,630 effective monthly." },
  { time: 236, speaker: "Prospect", text: "That's a bit over what we budgeted. We were thinking closer to $2,500." },
  { time: 251, speaker: "Agent", text: "Totally fair. The 1B+ on 7 is $2,480 and has a flex room that many residents use as a home office. It's smaller, but the layout is really efficient. Want to compare both while we're here today?" },
  { time: 285, speaker: "Prospect", text: "Yeah that makes sense actually." },
  { time: 294, speaker: "Agent", text: "Great. I'll set up the comparison side-by-side. And just so I can follow up — what's your ideal move-in window exactly, and is there anything on the checklist that's an absolute must-have vs nice-to-have?" },
];

const RUBRIC = [
  { category: "Opening & Rapport", score: 95, max: 100, trend: "up", insight: "Strong personalized greeting, prospect's name used 4 times. Excellent listening in first 90 seconds." },
  { category: "Needs Discovery", score: 88, max: 100, trend: "up", insight: "Identified WFH requirement and timeline unprompted. Could probe deeper on lifestyle priorities." },
  { category: "Property Showcase", score: 93, max: 100, trend: "flat", insight: "3 of 5 key amenities highlighted with specific benefits. Co-working lounge framing was excellent." },
  { category: "Objection Handling", score: 85, max: 100, trend: "up", insight: "Budget objection handled well — pivoted to 1B+ without being dismissive. Offered comparison viewing." },
  { category: "Closing", score: 90, max: 100, trend: "up", insight: "Strong close attempt: confirmed timeline, asked about must-haves vs nice-to-haves." },
  { category: "Follow-up Setup", score: 84, max: 100, trend: "down", insight: "Move-in window captured but no specific follow-up date locked. Set a call or tour for next steps." },
];

const COMMENTS = [
  { id: 1, author: "Manager – Rachel P.", time: 52, text: "Great pivot to the WFH angle here — you listened and responded directly. This is exactly the needs discovery we trained on.", type: "praise" },
  { id: 2, author: "Manager – Rachel P.", time: 236, text: "Good instinct to not drop price but offer an alternative. Next time, validate the objection first before jumping to a solution — 'I totally hear you, let me show you both options' lands better.", type: "coaching" },
  { id: 3, author: "Manager – Rachel P.", time: 294, text: "Strong close question. One addition: lock in a specific follow-up date right here before they leave the tour.", type: "coaching" },
];

const FOLLOWUP = [
  "Send Jordan a side-by-side comparison of 2B and 1B+ floor plans with photos.",
  "Share the move-in special details for both units in writing.",
  "Schedule a follow-up call within 48 hours — Jordan mentioned April/May move-in, so urgency is moderate.",
  "Add Jordan to the WFH lifestyle newsletter (co-working features).",
];

const fallbackRadarData = RUBRIC.map((r) => ({ axis: r.category.split(" ")[0], score: r.score }));

function formatTime(s: number) {
  const total = Math.max(0, Math.round(Number.isFinite(s) ? s : 0));
  const m = Math.floor(total / 60);
  return `${m}:${String(total % 60).padStart(2, "0")}`;
}

function parseDuration(value: string | null | undefined) {
  if (!value) return 0;
  const parts = value.split(":").map((part) => parseInt(part, 10));
  if (parts.some((part) => Number.isNaN(part))) return 0;
  if (parts.length === 2) return parts[0]! * 60 + parts[1]!;
  if (parts.length === 3) return parts[0]! * 3600 + parts[1]! * 60 + parts[2]!;
  return 0;
}

function playbackErrorMessage(error: unknown) {
  if (error instanceof DOMException && error.name === "NotAllowedError") {
    return "Playback was blocked until the browser receives a direct media interaction. Use the audio controls or try Play again.";
  }
  if (error instanceof DOMException && error.message) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return "Could not play this recording.";
}

function TrendIcon({ trend }: { trend: string }) {
  if (trend === "up") return <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />;
  if (trend === "down") return <TrendingDown className="w-3.5 h-3.5 text-red-500" />;
  return <Minus className="w-3.5 h-3.5 text-muted-foreground" />;
}

type TranscriptLine = { time: number; speaker: string; text: string };
type CommentLine = { id: string | number; author: string; time: number; text: string; type: string };

function apiUrl(path: string) {
  if (/^https?:\/\//i.test(path)) return path;
  const base = import.meta.env.VITE_API_BASE_URL ?? "";
  return `${base}${path}`;
}

export function SessionDetail({ sessionId, onBack, onNavigate }: { sessionId: string | null; onBack: () => void; onNavigate?: (view: string) => void }) {
  const { sessions } = useAdminData();
  const selected = sessions.find((session) => session.id === sessionId) ?? sessions[0];
  const session = selected
    ? {
      id: selected.id,
      prospect: selected.prospect,
      unit: selected.unit,
      property: selected.property,
      date: selected.date,
      duration: selected.duration,
      agent: selected.agent,
      score: selected.score ?? 0,
    }
    : SESSION;
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [newComment, setNewComment] = useState("");
  const [activeTab, setActiveTab] = useState<"transcript" | "score" | "followup">("transcript");
  const [expandedRubric, setExpandedRubric] = useState<number | null>(0);
  const [transcript, setTranscript] = useState<TranscriptLine[]>(TRANSCRIPT);
  const [comments, setComments] = useState<CommentLine[]>(COMMENTS);
  const [followUp, setFollowUp] = useState<string[]>(FOLLOWUP);
  const [rubricRows, setRubricRows] = useState(RUBRIC);
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  const [playbackSrc, setPlaybackSrc] = useState<string | null>(null);
  const [mediaDuration, setMediaDuration] = useState(0);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [mediaLoading, setMediaLoading] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fallbackDuration = parseDuration(session.duration) || 24 * 60 + 18;
  const totalDuration = mediaDuration || fallbackDuration;

  useEffect(() => {
    if (!sessionId) return;
    setCurrentTime(0);
    setPlaying(false);
    setRecordingUrl(null);
    setPlaybackSrc(null);
    setMediaError(null);
    setMediaLoading(false);
    setMediaDuration(0);
    void Promise.all([
      fetch(apiUrl(`/api/sessions/${sessionId}`))
        .then((res) => res.ok ? res.json() : null)
        .then((data) => {
          const nextUrl = data?.session?.audioUrl ?? data?.session?.videoUrl ?? null;
          if (nextUrl) {
            setRecordingUrl(nextUrl);
            setMediaLoading(true);
          }
          if (typeof data?.session?.duration === "number" && data.session.duration > 0) {
            setMediaDuration(data.session.duration);
          }
        })
        .catch(() => {}),
      fetch(apiUrl(`/api/sessions/${sessionId}/transcript`))
        .then((res) => res.ok ? res.json() : null)
        .then((data) => {
          const lines = data?.transcript?.map((line: { startTime: number; speaker: string; text: string }) => ({
            time: Math.round(line.startTime ?? 0),
            speaker: line.speaker || "Speaker",
            text: line.text || "",
          })).filter((line: TranscriptLine) => line.text);
          if (lines?.length) setTranscript(lines);
        })
        .catch(() => {}),
      fetch(apiUrl(`/api/sessions/${sessionId}/comments`))
        .then((res) => res.ok ? res.json() : null)
        .then((data) => {
          const next = data?.comments?.map((comment: { id: string; authorName: string; timestampSec: number | null; body: string }) => ({
            id: comment.id,
            author: comment.authorName,
            time: comment.timestampSec ?? 0,
            text: comment.body,
            type: "coaching",
          }));
          if (next?.length) setComments(next);
        })
        .catch(() => {}),
      fetch(apiUrl(`/api/sessions/${sessionId}/actions`))
        .then((res) => res.ok ? res.json() : null)
        .then((data) => {
          const next = data?.actions?.map((action: { title: string; description: string }) => `${action.title}: ${action.description}`);
          if (next?.length) setFollowUp(next);
        })
        .catch(() => {}),
      fetch(apiUrl(`/api/sessions/${sessionId}/analysis`))
        .then((res) => res.ok ? res.json() : null)
        .then((data) => {
          const sections = data?.analysis?.sectionScores?.map((section: { section: string; score: number; questions?: Array<{ evidence?: string }> }) => ({
            category: section.section,
            score: Math.round(section.score ?? 0),
            max: 100,
            trend: "flat",
            insight: section.questions?.find((question) => question.evidence)?.evidence ?? "No evidence summary available.",
          }));
          if (sections?.length) setRubricRows(sections);
        })
        .catch(() => {}),
    ]);
  }, [sessionId]);

  useEffect(() => {
    if (recordingUrl) return;
    if (playing) {
      timerRef.current = setInterval(() => {
        setCurrentTime((t) => {
          if (t >= totalDuration) { setPlaying(false); return totalDuration; }
          return t + 1;
        });
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [playing, recordingUrl, totalDuration]);

  useEffect(() => {
    if (!audioRef.current) return;
    audioRef.current.pause();
    audioRef.current.currentTime = 0;
  }, [recordingUrl]);

  useEffect(() => {
    if (!recordingUrl) return;
    let cancelled = false;
    let objectUrl: string | null = null;

    setMediaLoading(true);
    fetch(apiUrl(recordingUrl))
      .then((response) => {
        if (!response.ok) throw new Error("Recording could not be loaded.");
        return response.blob();
      })
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setPlaybackSrc(objectUrl);
        setMediaError(null);
      })
      .catch(() => {
        if (!cancelled) {
          setPlaybackSrc(null);
          setMediaLoading(false);
          setMediaError("Recording could not be loaded.");
        }
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [recordingUrl]);

  const seekTo = (seconds: number, shouldPlay = playing) => {
    const nextTime = Math.max(0, Math.min(totalDuration, Math.round(seconds)));
    setCurrentTime(nextTime);
    if (audioRef.current) {
      audioRef.current.currentTime = nextTime;
      if (shouldPlay) {
        void audioRef.current.play().catch((error) => {
          setPlaying(false);
          setMediaError(playbackErrorMessage(error));
        });
      }
    }
  };

  const togglePlayback = () => {
    if (recordingUrl && !playbackSrc) {
      setMediaError("Recording is still loading.");
      return;
    }

    if (!recordingUrl || !audioRef.current) {
      setPlaying((p) => !p);
      return;
    }

    if (audioRef.current.paused) {
      setMediaLoading(audioRef.current.readyState < HTMLMediaElement.HAVE_FUTURE_DATA);
      void audioRef.current.play()
        .then(() => {
          setPlaying(true);
          setMediaError(null);
          setMediaLoading(false);
        })
        .catch((error) => {
          setPlaying(false);
          setMediaLoading(false);
          setMediaError(playbackErrorMessage(error));
        });
      return;
    }

    audioRef.current.pause();
    setPlaying(false);
  };

  const activeTranscriptIndex = transcript.reduce((best, line, i) => {
    return line.time <= currentTime ? i : best;
  }, 0);

  const scoreColor = session.score >= 85 ? "text-emerald-600" : session.score >= 70 ? "text-blue-600" : "text-red-500";
  const scoreBg = session.score >= 85 ? "bg-emerald-50 border-emerald-200" : session.score >= 70 ? "bg-blue-50 border-blue-200" : "bg-red-50 border-red-200";
  const radarData = rubricRows.map((r) => ({ axis: r.category.split(" ")[0], score: r.score }));

  return (
    <div className="min-h-screen bg-background" style={{ fontFamily: "'Inter', sans-serif" }}>
      {/* Header */}
      <header className="border-b border-border bg-white sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            All sessions
          </button>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded bg-primary flex items-center justify-center">
                <Play className="w-3 h-3 fill-white text-white" />
              </div>
              <span className="font-bold text-sm tracking-tight">Tour</span>
              <span className="text-muted-foreground text-sm font-normal">admin</span>
            </div>
          </div>
          <div className={`px-3 py-1 rounded-full border text-sm font-bold ${scoreBg} ${scoreColor}`}>
            {session.score} / 100
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-6">
        {/* Session meta */}
        <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
          <div>
            <h2 className="text-foreground" style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.025em" }}>
              {session.prospect}
            </h2>
            <p className="text-muted-foreground text-sm mt-0.5">
              {session.property} · {session.unit} · {session.agent} · {session.date}
            </p>
          </div>
        </div>

        {/* Audio player */}
        <div className="rounded-2xl border border-border bg-card p-5 mb-6">
          {playbackSrc && (
            <audio
              ref={audioRef}
              preload="auto"
              src={playbackSrc}
              onLoadStart={() => setMediaLoading(true)}
              onLoadedMetadata={(event) => {
                const duration = event.currentTarget.duration;
                if (Number.isFinite(duration) && duration > 0) setMediaDuration(duration);
              }}
              onCanPlay={() => {
                setMediaLoading(false);
                setMediaError(null);
              }}
              onWaiting={() => setMediaLoading(true)}
              onPlaying={() => setMediaLoading(false)}
              onTimeUpdate={(event) => setCurrentTime(Math.round(event.currentTarget.currentTime))}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onEnded={() => {
                setPlaying(false);
                setCurrentTime(totalDuration);
              }}
              onError={() => {
                setPlaying(false);
                setMediaLoading(false);
                setMediaError("Recording could not be loaded.");
              }}
              className="absolute h-px w-px opacity-0 pointer-events-none"
            />
          )}
          {/* Waveform / progress bar */}
          <div className="relative h-12 bg-secondary rounded-xl overflow-hidden mb-4 cursor-pointer"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              seekTo(((e.clientX - rect.left) / rect.width) * totalDuration);
            }}
          >
            <div
              className="absolute inset-y-0 left-0 bg-primary/20 transition-all"
              style={{ width: `${(currentTime / totalDuration) * 100}%` }}
            />
            {/* Fake waveform bars */}
            <div className="absolute inset-0 flex items-center gap-[2px] px-2">
              {Array.from({ length: 80 }).map((_, i) => {
                const h = [28, 20, 36, 16, 40, 22, 32, 18, 38, 24][i % 10] ?? 24;
                const active = (i / 80) * totalDuration <= currentTime;
                return (
                  <div
                    key={i}
                    className="flex-1 rounded-full"
                    style={{
                      height: h * 0.8,
                      background: active ? "#4f46e5" : "#d1d5db",
                      opacity: active ? 1 : 0.5,
                    }}
                  />
                );
              })}
            </div>
            {/* Comment markers */}
            {comments.map((c) => (
              <div
                key={c.id}
                className="absolute top-1 w-1 h-1.5 rounded-full bg-amber-400 shadow"
                style={{ left: `${(c.time / totalDuration) * 100}%` }}
                title={c.text}
              />
            ))}
          </div>

          {/* Controls */}
          <div className="flex items-center gap-4">
            <button onClick={() => seekTo(currentTime - 10)} aria-label="Skip back 10 seconds" className="text-muted-foreground hover:text-foreground transition-colors">
              <SkipBack className="w-4 h-4" />
            </button>
            <button
              onClick={togglePlayback}
              aria-label={playing ? "Pause recording" : "Play recording"}
              disabled={Boolean(recordingUrl && !playbackSrc)}
              className="w-9 h-9 rounded-full bg-primary flex items-center justify-center hover:opacity-90 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              {playing ? <Pause className="w-4 h-4 text-white" /> : <Play className="w-4 h-4 text-white fill-white" />}
            </button>
            <button onClick={() => seekTo(currentTime + 10)} aria-label="Skip forward 10 seconds" className="text-muted-foreground hover:text-foreground transition-colors">
              <SkipForward className="w-4 h-4" />
            </button>
            <span className="text-xs font-mono text-foreground">
              {formatTime(currentTime)} / {formatTime(totalDuration)}
            </span>
            <div className="ml-auto flex items-center gap-1.5 text-muted-foreground">
              <Volume2 className="w-4 h-4" />
              <div className="w-16 h-1 bg-secondary rounded-full">
                <div className="h-full w-3/4 bg-primary/60 rounded-full" />
              </div>
            </div>
          </div>
          {recordingUrl && (
            <a
              href={apiUrl(recordingUrl)}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex text-xs font-medium text-primary hover:opacity-80 transition-opacity"
            >
              Open recording
            </a>
          )}
          {mediaLoading && <p className="text-xs text-muted-foreground mt-3">Loading recording…</p>}
          {mediaError && <p className="text-xs text-red-500 mt-3">{mediaError}</p>}
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 p-1 rounded-xl bg-secondary border border-border w-fit mb-6">
          {(["transcript", "score", "followup"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium capitalize transition-all ${
                activeTab === tab ? "bg-white shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab === "followup" ? "Follow-up" : tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6">
          {/* Main panel */}
          <div>
            <AnimatePresence mode="wait">
              {activeTab === "transcript" && (
                <motion.div key="transcript" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <div className="space-y-2">
                    {transcript.map((line, i) => {
                      const isActive = i === activeTranscriptIndex;
                      const isAgent = line.speaker === "Agent";
                      return (
                        <motion.div
                          key={i}
                          animate={{ opacity: isActive ? 1 : 0.7 }}
                          className={`flex gap-3 p-3 rounded-xl cursor-pointer transition-colors ${
                            isActive ? "bg-primary/5 border border-primary/20" : "hover:bg-secondary/50"
                          }`}
                          onClick={() => seekTo(line.time)}
                        >
                          <button className="shrink-0 mt-0.5 text-muted-foreground hover:text-primary transition-colors">
                            <span className="font-mono text-xs">{formatTime(line.time)}</span>
                          </button>
                          <div className="flex-1 min-w-0">
                            <span className={`text-xs font-semibold mr-2 ${isAgent ? "text-primary" : "text-muted-foreground"}`}>
                              {line.speaker}
                            </span>
                            <span className="text-sm text-foreground">{line.text}</span>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                </motion.div>
              )}

              {activeTab === "score" && (
                <motion.div key="score" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  {/* Overall score hero */}
                  <div className="rounded-2xl border border-border bg-card p-6 mb-4 flex items-center gap-6">
                    <div className="flex-1">
                      <div className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1">Overall score</div>
                      <div className={`text-5xl font-black tracking-tight ${scoreColor}`} style={{ fontFamily: "'Inter', sans-serif" }}>
                        {session.score}
                      </div>
                      <div className="text-sm text-muted-foreground mt-1">out of 100 · Excellent</div>
                      <button
                        onClick={() => onNavigate?.("rubrics")}
                        className="mt-2 inline-flex items-center gap-1.5 text-xs text-primary hover:opacity-80 transition-opacity font-medium"
                      >
                        Standard Leasing Rubric v2 →
                      </button>
                      <div className="mt-3 text-xs text-muted-foreground leading-relaxed">
                        Sarah delivered a strong, prospect-centric tour. Excellent rapport-building, sharp needs discovery, and a well-handled budget objection. Follow-up lock-in is the primary growth area.
                      </div>
                    </div>
                    <ResponsiveContainer width={160} height={160}>
                      <RadarChart data={radarData.length ? radarData : fallbackRadarData} margin={{ top: 10, right: 20, bottom: 10, left: 20 }}>
                        <PolarGrid stroke="#e4e4e7" />
                        <PolarAngleAxis dataKey="axis" tick={{ fontSize: 9, fill: "#71717a" }} />
                        <Radar dataKey="score" stroke="#4f46e5" fill="#4f46e5" fillOpacity={0.2} strokeWidth={2} />
                      </RadarChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Rubric breakdown */}
                  <div className="space-y-2">
                    {rubricRows.map((r, i) => (
                      <div key={r.category} className="rounded-2xl border border-border bg-card overflow-hidden">
                        <button
                          onClick={() => setExpandedRubric(expandedRubric === i ? null : i)}
                          className="w-full flex items-center gap-4 px-5 py-3.5 hover:bg-secondary/50 transition-colors"
                        >
                          <div className="flex-1 text-left">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-foreground">{r.category}</span>
                              <TrendIcon trend={r.trend} />
                            </div>
                            <div className="mt-1.5 flex items-center gap-2">
                              <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-primary"
                                  style={{ width: `${r.score}%` }}
                                />
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className={`text-sm font-bold ${r.score >= 85 ? "text-emerald-600" : r.score >= 70 ? "text-blue-600" : "text-red-500"}`}>
                              {r.score}
                            </span>
                            {expandedRubric === i ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                          </div>
                        </button>
                        <AnimatePresence>
                          {expandedRubric === i && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.2 }}
                              className="overflow-hidden"
                            >
                              <div className="px-5 pb-4 pt-1 border-t border-border">
                                <div className="flex items-start gap-2 text-sm text-muted-foreground">
                                  <Lightbulb className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                                  <span>{r.insight}</span>
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}

              {activeTab === "followup" && (
                <motion.div key="followup" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <div className="rounded-2xl border border-border bg-card p-5 mb-4">
                    <div className="flex items-center gap-2 mb-4">
                      <Zap className="w-4 h-4 text-primary" />
                      <h3 className="font-semibold text-sm text-foreground">AI-generated follow-up actions</h3>
                    </div>
                    <p className="text-xs text-muted-foreground mb-4">
                      Based on the tour transcript and Jordan's stated preferences. Review and send from your CRM.
                    </p>
                    <div className="space-y-3">
                      {followUp.map((action, i) => (
                        <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-secondary/50 border border-border">
                          <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                            <span className="text-xs font-bold text-primary">{i + 1}</span>
                          </div>
                          <span className="text-sm text-foreground">{action}</span>
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={() => onNavigate?.("settings")}
                      className="mt-4 w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-all flex items-center justify-center gap-2"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none"><rect width="24" height="24" rx="4" fill="white" fillOpacity="0.2"/><text x="4" y="17" fontSize="11" fontWeight="bold" fill="white">Ent</text></svg>
                      Push to Entrata
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Coaching comments sidebar */}
          <div>
            <div className="rounded-2xl border border-border bg-card p-5">
              <div className="flex items-center gap-2 mb-4">
                <MessageSquare className="w-4 h-4 text-primary" />
                <h3 className="font-semibold text-sm text-foreground">Coaching notes</h3>
                <span className="ml-auto text-xs text-muted-foreground">{comments.length} notes</span>
              </div>

              <div className="space-y-3 mb-4">
                {comments.map((comment) => (
                  <button
                    key={comment.id}
                    onClick={() => seekTo(comment.time)}
                    className="w-full text-left p-3 rounded-xl border border-border hover:border-primary/30 hover:bg-primary/5 transition-all group"
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <div className={`w-1.5 h-1.5 rounded-full ${comment.type === "praise" ? "bg-emerald-500" : "bg-amber-500"}`} />
                      <span className="text-xs text-muted-foreground font-mono">{formatTime(comment.time)}</span>
                      {comment.type === "praise"
                        ? <CheckCircle2 className="w-3 h-3 text-emerald-500 ml-auto" />
                        : <AlertCircle className="w-3 h-3 text-amber-500 ml-auto" />
                      }
                    </div>
                    <p className="text-xs text-foreground leading-relaxed">{comment.text}</p>
                    <p className="text-xs text-muted-foreground mt-1.5">— {comment.author}</p>
                  </button>
                ))}
              </div>

              {/* Add comment */}
              <div className="border-t border-border pt-4">
                <div className="relative">
                  <textarea
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    placeholder={`Add a note at ${formatTime(currentTime)}…`}
                    rows={3}
                    className="w-full px-3 py-2.5 rounded-xl border border-border bg-input-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground"
                  />
                  <button
                    disabled={!newComment.trim()}
                    onClick={async () => {
                      if (!newComment.trim() || !sessionId) return;
                      const body = newComment.trim();
                      setNewComment("");
                      const optimistic = { id: `local-${Date.now()}`, author: "Reviewer", time: currentTime, text: body, type: "coaching" };
                      setComments((items) => [...items, optimistic]);
                      await fetch(apiUrl(`/api/sessions/${sessionId}/comments`), {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ body, timestampSec: currentTime, authorName: "Reviewer" }),
                      }).catch(() => {});
                    }}
                    className="mt-2 w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-40 hover:opacity-90 transition-all"
                  >
                    <Send className="w-3.5 h-3.5" />
                    Add note
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
