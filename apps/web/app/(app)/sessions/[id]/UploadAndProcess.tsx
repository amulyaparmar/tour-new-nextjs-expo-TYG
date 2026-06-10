"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Video, Upload, Mic, Square, CheckCircle2, XCircle, Brain, Sparkles, Image as ImageIcon, FileText } from "lucide-react";

type Phase = "choose" | "recording" | "details" | "processing";
type Step = "idle" | "uploading" | "uploaded" | "transcribing" | "extracting_screenshots" | "analyzing" | "generating_actions" | "done" | "error";

const PIPELINE_STEPS: Array<{ key: Step; label: string; description: string; icon: "upload" | "mic" | "brain" | "image" | "sparkles" | "check" }> = [
  { key: "uploading", label: "Uploading", description: "Sending recording to server", icon: "upload" },
  { key: "transcribing", label: "Transcribing", description: "Converting speech to text with speaker detection", icon: "mic" },
  { key: "analyzing", label: "Analyzing", description: "AI scoring against the rubric", icon: "brain" },
  { key: "extracting_screenshots", label: "Extracting Frames", description: "Capturing key moments from video", icon: "image" },
  { key: "generating_actions", label: "Follow-Up Actions", description: "Creating next steps for this prospect", icon: "sparkles" },
  { key: "done", label: "Complete", description: "Analysis ready", icon: "check" },
];

const STEP_ICONS = {
  upload: Upload,
  mic: Mic,
  brain: Brain,
  image: ImageIcon,
  sparkles: Sparkles,
  check: CheckCircle2,
};

function stepIndex(step: Step): number {
  const idx = PIPELINE_STEPS.findIndex((s) => s.key === step);
  return idx >= 0 ? idx : -1;
}

export function UploadAndProcess({ sessionId, hasRecording }: { sessionId: string; hasRecording: boolean }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [phase, setPhase] = useState<Phase>("choose");
  const [step, setStep] = useState<Step>("idle");
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [processingElapsed, setProcessingElapsed] = useState(0);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  useEffect(() => {
    if (phase !== "processing" || step === "done" || step === "error") return;
    const t = setInterval(() => setProcessingElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [phase, step]);

  useEffect(() => {
    if (step === "done") {
      const timeout = setTimeout(() => router.refresh(), 800);
      return () => clearTimeout(timeout);
    }
  }, [step, router]);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, "0");
    const s = (secs % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.muted = true;
        videoRef.current.play();
      }
      chunksRef.current = [];

      const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
        ? "video/webm;codecs=vp9,opus"
        : MediaRecorder.isTypeSupported("video/webm")
          ? "video/webm"
          : "video/mp4";

      const recorder = new MediaRecorder(stream, { mimeType });
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      };

      mediaRecorderRef.current = recorder;
      recorder.start(1000);
      setPhase("recording");
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    } catch {
      setErrorMsg("Camera/microphone access denied. Please allow access and try again.");
      setStep("error");
    }
  }

  function stopRecording() {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state !== "recording") return;

    const prev = recorder.onstop;
    recorder.onstop = (e) => {
      if (typeof prev === "function") prev.call(recorder, e);
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
      setRecordedBlob(blob);
      setPhase("details");
    };
    recorder.stop();
  }

  const uploadBlob = useCallback(async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/sessions/${sessionId}/upload`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
    };
    await new Promise<void>((resolve, reject) => {
      xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error("Upload failed")));
      xhr.onerror = () => reject(new Error("Network error"));
      xhr.send(formData);
    });
  }, [sessionId]);

  async function processFile(file: File) {
    setPhase("processing");
    setStep("uploading");
    setProgress(0);
    setProcessingElapsed(0);
    setErrorMsg(null);
    try {
      await uploadBlob(file);
      setStep("uploaded");
      setProgress(100);
      setStep("transcribing");

      const res = await fetch(`/api/sessions/${sessionId}/process`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => null) as { error?: string } | null;
        throw new Error(body?.error ?? "Processing failed");
      }
      setStep("done");
    } catch (err) {
      setStep("error");
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  async function handleDetailsSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const body: Record<string, string> = {};
    const title = String(fd.get("title") ?? "").trim();
    if (title) body.title = title;
    const pn = String(fd.get("prospectName") ?? "").trim();
    if (pn) body.prospectName = pn;
    const loc = String(fd.get("location") ?? "").trim();
    if (loc) body.location = loc;
    const notes = String(fd.get("notes") ?? "").trim();
    if (notes) body.notes = notes;

    if (Object.keys(body).length > 0) {
      await fetch(`/api/sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
    }

    const blob = recordedBlob;
    if (blob) {
      const ext = blob.type.includes("mp4") ? "mp4" : "webm";
      const file = new File([blob], `recording-${sessionId}.${ext}`, { type: blob.type });
      await processFile(file);
    }
  }

  async function handleFileUpload(file: File) {
    setRecordedBlob(file);
    setPhase("details");
  }

  const startProcessing = useCallback(async () => {
    setPhase("processing");
    setStep("transcribing");
    setProcessingElapsed(0);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/process`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => null) as { error?: string } | null;
        throw new Error(body?.error ?? "Processing failed");
      }
      setStep("done");
    } catch (err) {
      setStep("error");
      setErrorMsg(err instanceof Error ? err.message : "Processing failed");
    }
  }, [sessionId]);

  // Auto-start processing when recording exists but no analysis
  const hasAutoStarted = useRef(false);
  useEffect(() => {
    if (hasRecording && phase === "choose" && !hasAutoStarted.current) {
      hasAutoStarted.current = true;
      startProcessing();
    }
  }, [hasRecording, phase, startProcessing]);

  // ── Choose: Record or Upload ──
  if (phase === "choose") {
    return (
      <div className="card">
        <div className="card-header"><h2>Record Tour</h2></div>
        <div className="card-body">
          <div className="record-options">
            <button type="button" className="record-option-btn primary" onClick={startRecording}>
              <Video size={32} />
              <span className="record-option-label">Record Video</span>
              <span className="record-option-sub">Use camera &amp; microphone</span>
            </button>
            <div className="record-option-divider">or</div>
            <button type="button" className="record-option-btn" onClick={() => inputRef.current?.click()}>
              <Upload size={28} />
              <span className="record-option-label">Upload File</span>
              <span className="record-option-sub">MP4, WebM, M4A, WAV</span>
            </button>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept="video/*,audio/*"
            style={{ display: "none" }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileUpload(file);
            }}
          />
        </div>
      </div>
    );
  }

  // ── Full-screen recording ──
  if (phase === "recording") {
    return (
      <div className="fullscreen-recorder">
        <video ref={videoRef} className="recorder-preview" playsInline />
        <div className="recorder-overlay">
          <div className="recorder-top-bar">
            <div className="recording-indicator">
              <span className="recording-dot" />
              <span>REC</span>
            </div>
            <span className="recorder-timer">{formatTime(elapsed)}</span>
          </div>
          <div className="recorder-controls">
            <button type="button" className="recorder-stop-btn" onClick={stopRecording}>
              <Square size={24} fill="white" />
            </button>
            <span className="recorder-stop-label">Stop Recording</span>
          </div>
        </div>
      </div>
    );
  }

  // ── Details form after recording ──
  if (phase === "details") {
    return (
      <div className="card">
        <div className="card-header">
          <h2>Session Details</h2>
          <span className="badge badge-reviewed" style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <CheckCircle2 size={12} /> Recorded {recordedBlob ? `(${(recordedBlob.size / 1024 / 1024).toFixed(1)} MB)` : ""}
          </span>
        </div>
        <div className="card-body">
          <form onSubmit={handleDetailsSubmit} className="form-grid">
            <div className="form-group">
              <label htmlFor="title" className="form-label">Session title</label>
              <input id="title" name="title" type="text" className="form-input" placeholder="Downtown Unit Tour" />
            </div>
            <div className="form-group">
              <label htmlFor="prospectName" className="form-label">Prospect name</label>
              <input id="prospectName" name="prospectName" type="text" className="form-input" placeholder="Sarah Johnson" />
            </div>
            <div className="form-group">
              <label htmlFor="location" className="form-label">Location</label>
              <input id="location" name="location" type="text" className="form-input" placeholder="Tower A - Unit 1204" />
            </div>
            <div className="form-group">
              <label htmlFor="notes" className="form-label">Notes</label>
              <textarea id="notes" name="notes" rows={2} className="form-textarea" placeholder="Key topics, focus areas..." />
            </div>
            <button type="submit" className="btn btn-primary btn-block">
              Process Recording
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ── Processing Pipeline ──
  const currentIdx = stepIndex(step);
  const isDone = step === "done";
  const isError = step === "error";
  const totalSteps = PIPELINE_STEPS.length;
  const overallPct = isDone ? 100 : isError ? 0 : Math.round(((currentIdx < 0 ? 0 : currentIdx) / totalSteps) * 100);
  const activeStep = PIPELINE_STEPS.find((ps) => ps.key === step || (step === "uploaded" && ps.key === "uploading"));

  return (
    <div style={{
      background: "white",
      borderRadius: 16,
      border: "1px solid var(--slate-200)",
      overflow: "hidden",
      boxShadow: "var(--shadow-card)",
    }}>
      {/* Header */}
      <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--slate-200)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--slate-900)", margin: 0 }}>
              {isDone ? "Analysis Complete" : isError ? "Processing Failed" : "Analyzing Your Tour"}
            </h2>
            <p style={{ fontSize: 13, color: "var(--slate-500)", margin: "2px 0 0" }}>
              {isDone
                ? "Loading your results..."
                : isError
                  ? errorMsg
                  : activeStep
                    ? activeStep.description
                    : "Preparing..."}
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--slate-500)", fontVariantNumeric: "tabular-nums" }}>
              {formatTime(processingElapsed)}
            </span>
            {!isDone && !isError && <div className="pipeline-spinner" />}
            {isDone && <CheckCircle2 size={22} style={{ color: "var(--green-600)" }} />}
            {isError && <XCircle size={22} style={{ color: "#ef4444" }} />}
          </div>
        </div>

        {/* Overall progress bar */}
        {!isError && (
          <div style={{ height: 6, borderRadius: 99, background: "var(--slate-100)", overflow: "hidden" }}>
            <div style={{
              height: "100%", borderRadius: 99,
              background: isDone
                ? "var(--green-500)"
                : "linear-gradient(90deg, var(--indigo-500), var(--indigo-400))",
              width: `${overallPct}%`,
              transition: "width 0.5s ease",
            }} />
          </div>
        )}
      </div>

      {/* Step details — compact horizontal on wider screens, vertical on small */}
      <div style={{ padding: "16px 24px 20px" }}>
        {/* Horizontal step indicators */}
        <div style={{ display: "flex", gap: 0, marginBottom: 4 }}>
          {PIPELINE_STEPS.map((ps, i) => {
            const Icon = STEP_ICONS[ps.icon];
            const isActive = ps.key === step || (step === "uploaded" && ps.key === "uploading");
            const isPast = currentIdx > i || isDone;

            let dotBg = "var(--slate-100)";
            let dotColor = "var(--slate-400)";
            let labelColor = "var(--slate-400)";

            if (isPast) {
              dotBg = "rgba(34,197,94,0.1)";
              dotColor = "var(--green-600)";
              labelColor = "var(--slate-600)";
            } else if (isActive && !isDone) {
              dotBg = "var(--indigo-50)";
              dotColor = "var(--indigo-600)";
              labelColor = "var(--slate-800)";
            }

            return (
              <div key={ps.key} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: "50%",
                  background: dotBg,
                  display: "grid", placeItems: "center",
                  transition: "all 0.3s ease",
                  ...(isActive && !isDone ? { boxShadow: "0 0 0 3px var(--indigo-100)" } : {}),
                }}>
                  {isPast
                    ? <CheckCircle2 size={14} style={{ color: dotColor }} />
                    : isActive && !isDone
                      ? <div className="pipeline-spinner-sm" />
                      : <Icon size={14} style={{ color: dotColor }} />}
                </div>
                <span style={{
                  fontSize: 10, fontWeight: 600, color: labelColor,
                  textAlign: "center", lineHeight: 1.2,
                  transition: "color 0.3s ease",
                }}>
                  {ps.label}
                </span>
              </div>
            );
          })}
        </div>

        {/* Connector line between dots */}
        <div style={{ display: "flex", alignItems: "center", margin: "-46px 40px 28px", position: "relative", zIndex: 0 }}>
          {PIPELINE_STEPS.slice(0, -1).map((_, i) => {
            const isPast = currentIdx > i + 1 || isDone;
            const isTransitioning = currentIdx === i + 1 && !isDone;
            return (
              <div key={i} style={{
                flex: 1, height: 2,
                background: isPast ? "var(--green-400)" : isTransitioning ? "var(--indigo-300)" : "var(--slate-200)",
                transition: "background 0.3s ease",
              }} />
            );
          })}
        </div>
      </div>

      {/* Error retry */}
      {isError && (
        <div style={{ padding: "0 24px 20px", display: "flex", gap: 8, alignItems: "center" }}>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => { hasAutoStarted.current = false; startProcessing(); }}
          >
            Retry Processing
          </button>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => { setPhase("choose"); setStep("idle"); setErrorMsg(null); hasAutoStarted.current = false; }}
          >
            Upload Different File
          </button>
        </div>
      )}
    </div>
  );
}
