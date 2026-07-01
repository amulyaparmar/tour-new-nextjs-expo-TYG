import { useState, useEffect, useRef } from "react";
import { motion } from "motion/react";
import {
  Mic,
  MicOff,
  Square,
  ChevronLeft,
  Clock,
  Pause,
  Play,
  Volume2,
  CheckCircle2,
} from "lucide-react";

function useTimer(running: boolean) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [running]);
  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

function WaveformBar({ active, height }: { active: boolean; height: number }) {
  return (
    <motion.div
      className="w-1 rounded-full"
      style={{ background: active ? "#4f46e5" : "#e4e4e7" }}
      animate={{ height: active ? height : 4 }}
      transition={{ duration: 0.15, ease: "easeOut" }}
    />
  );
}

const CHECKLIST = [
  "Greet prospect by name",
  "Ask about move-in timeline",
  "Learn lifestyle preferences",
  "Highlight at least 3 amenities",
  "Review pricing and specials",
  "Address objections",
  "Confirm next steps / follow-up",
];

type RecordingState = "idle" | "recording" | "paused" | "done";

export function Recording({ onBack, onFinish }: {
  onBack: () => void;
  onFinish: () => void;
}) {
  const [state, setState] = useState<RecordingState>("idle");
  const [bars, setBars] = useState<number[]>(Array(40).fill(4));
  const [checked, setChecked] = useState<boolean[]>(CHECKLIST.map(() => false));
  const [prospectName, setProspectName] = useState("");
  const [unit, setUnit] = useState("");
  const timer = useTimer(state === "recording");
  const animRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (state === "recording") {
      animRef.current = setInterval(() => {
        setBars(
          Array(40)
            .fill(0)
            .map(() => Math.random() * 36 + 4)
        );
      }, 120);
    } else {
      if (animRef.current) clearInterval(animRef.current);
      setBars(Array(40).fill(4));
    }
    return () => {
      if (animRef.current) clearInterval(animRef.current);
    };
  }, [state]);

  const completedCount = checked.filter(Boolean).length;

  return (
    <div className="min-h-screen bg-background flex flex-col" style={{ fontFamily: "'Inter', sans-serif" }}>
      {/* Header */}
      <header className="border-b border-border bg-white sticky top-0 z-20">
        <div className="max-w-3xl mx-auto px-6 h-14 flex items-center justify-between">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            Back
          </button>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-primary flex items-center justify-center">
              <Play className="w-3 h-3 fill-white text-white" />
            </div>
            <span className="font-bold text-sm tracking-tight">Tour</span>
            <span className="text-muted-foreground text-sm font-normal">leasing</span>
          </div>
          <div className="w-16" />
        </div>
      </header>

      <div className="flex-1 max-w-3xl mx-auto w-full px-6 py-8">
        <div className="mb-6">
          <h2 className="text-foreground" style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.025em" }}>
            New tour recording
          </h2>
          <p className="text-muted-foreground text-sm mt-1">
            Record your leasing tour to get an AI performance score.
          </p>
        </div>

        {/* Prospect info */}
        {state === "idle" && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-border bg-card p-5 mb-5"
          >
            <h3 className="font-semibold text-sm text-foreground mb-4">Session details</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Prospect name</label>
                <input
                  value={prospectName}
                  onChange={(e) => setProspectName(e.target.value)}
                  placeholder="e.g. Jordan Mitchell"
                  className="w-full px-3 py-2.5 rounded-xl border border-border bg-input-background text-sm focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Unit / floor plan</label>
                <input
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  placeholder="e.g. 2B – 850 sqft"
                  className="w-full px-3 py-2.5 rounded-xl border border-border bg-input-background text-sm focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground"
                />
              </div>
            </div>
          </motion.div>
        )}

        {/* Waveform visualizer */}
        <div className="rounded-2xl border border-border bg-card p-6 mb-5">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              {state === "recording" && (
                <motion.span
                  animate={{ opacity: [1, 0, 1] }}
                  transition={{ repeat: Infinity, duration: 1.2 }}
                  className="w-2 h-2 rounded-full bg-red-500"
                />
              )}
              <span className="text-sm font-semibold text-foreground">
                {state === "idle" ? "Ready to record" : state === "paused" ? "Paused" : state === "done" ? "Recording complete" : "Recording…"}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-sm font-mono text-foreground">
              <Clock className="w-3.5 h-3.5 text-muted-foreground" />
              {timer}
            </div>
          </div>

          {/* Waveform */}
          <div className="flex items-center justify-center gap-[3px] h-12 mb-6">
            {bars.map((h, i) => (
              <WaveformBar key={i} active={state === "recording"} height={h} />
            ))}
          </div>

          {/* Controls */}
          <div className="flex items-center justify-center gap-4">
            {state === "idle" && (
              <button
                onClick={() => setState("recording")}
                disabled={!prospectName}
                className="flex items-center gap-2.5 px-8 py-3 rounded-full bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Mic className="w-4 h-4" />
                Start recording
              </button>
            )}
            {state === "recording" && (
              <>
                <button
                  onClick={() => setState("paused")}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-full border border-border bg-secondary text-sm font-semibold text-foreground hover:bg-accent transition-colors"
                >
                  <Pause className="w-4 h-4" />
                  Pause
                </button>
                <button
                  onClick={() => setState("done")}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-red-500 text-white text-sm font-semibold hover:bg-red-600 active:scale-95 transition-all"
                >
                  <Square className="w-3.5 h-3.5 fill-white" />
                  Stop
                </button>
              </>
            )}
            {state === "paused" && (
              <>
                <button
                  onClick={() => setState("recording")}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-all"
                >
                  <Mic className="w-4 h-4" />
                  Resume
                </button>
                <button
                  onClick={() => setState("done")}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-full border border-border text-sm font-semibold text-foreground hover:bg-secondary transition-colors"
                >
                  <Square className="w-3.5 h-3.5" />
                  Finish
                </button>
              </>
            )}
            {state === "done" && (
              <motion.button
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                onClick={onFinish}
                className="flex items-center gap-2 px-8 py-3 rounded-full bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 active:scale-95 transition-all"
              >
                <CheckCircle2 className="w-4 h-4" />
                Submit for AI scoring
              </motion.button>
            )}
          </div>
        </div>

        {/* Tour checklist */}
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-sm text-foreground">Tour checklist</h3>
            <span className="text-xs font-semibold text-primary">
              {completedCount}/{CHECKLIST.length}
            </span>
          </div>
          <div className="space-y-2">
            {CHECKLIST.map((item, i) => (
              <label key={item} className="flex items-center gap-3 cursor-pointer group">
                <button
                  onClick={() => {
                    const next = [...checked];
                    next[i] = !next[i];
                    setChecked(next);
                  }}
                  className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all ${
                    checked[i]
                      ? "bg-primary border-primary"
                      : "border-border group-hover:border-primary/50"
                  }`}
                >
                  {checked[i] && (
                    <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none">
                      <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
                <span className={`text-sm transition-colors ${checked[i] ? "line-through text-muted-foreground" : "text-foreground"}`}>
                  {item}
                </span>
              </label>
            ))}
          </div>
          {/* Progress bar */}
          <div className="mt-4 h-1.5 rounded-full bg-secondary overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-primary"
              animate={{ width: `${(completedCount / CHECKLIST.length) * 100}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
