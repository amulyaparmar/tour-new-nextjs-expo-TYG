"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Video, Upload, Mic, Square, Clock, Loader2, CheckCircle2, XCircle, AlertCircle } from "lucide-react";

type Phase = "choose" | "recording" | "details" | "processing";
type Step = "idle" | "uploading" | "uploaded" | "transcribing" | "extracting_screenshots" | "analyzing" | "done" | "error";

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

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

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
      router.refresh();
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

  // ── Already has a recording ──
  if (phase === "choose" && hasRecording) {
    return (
      <div className="card">
        <div className="card-header"><h2>Recording</h2></div>
        <div className="card-body" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <CheckCircle2 size={16} style={{ color: "var(--green-600)" }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--green-600)" }}>Recording uploaded</span>
          <button type="button" className="btn btn-outline btn-sm" onClick={async () => {
            setPhase("processing");
            setStep("transcribing");
            try {
              const res = await fetch(`/api/sessions/${sessionId}/process`, { method: "POST" });
              if (!res.ok) {
                const body = await res.json().catch(() => null) as { error?: string } | null;
                throw new Error(body?.error ?? "Processing failed");
              }
              setStep("done");
              router.refresh();
            } catch (err) {
              setStep("error");
              setErrorMsg(err instanceof Error ? err.message : "Processing failed");
            }
          }}>Re-process</button>
        </div>
      </div>
    );
  }

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

  // ── Step 2: Details form after recording ──
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

  // ── Processing pipeline ──
  return (
    <div className="card">
      <div className="card-header"><h2>Processing</h2></div>
      <div className="card-body">
        <div className="process-steps">
          <ProcessStep icon={<Upload size={16} />} label="Upload recording" status={step === "uploading" ? "active" : progress >= 100 ? "done" : "pending"} />
          <ProcessStep icon={<Mic size={16} />} label="Transcribe &amp; diarize" status={step === "transcribing" ? "active" : ["extracting_screenshots", "analyzing", "done"].includes(step) ? "done" : step === "error" ? "failed" : "pending"} />
          <ProcessStep icon={<Video size={16} />} label="Extract key frames" status={step === "extracting_screenshots" ? "active" : ["analyzing", "done"].includes(step) ? "done" : "pending"} />
          <ProcessStep icon={<AlertCircle size={16} />} label="AI analysis" status={step === "analyzing" ? "active" : step === "done" ? "done" : "pending"} />
          <ProcessStep icon={<CheckCircle2 size={16} />} label="Generate actions" status={step === "done" ? "done" : "pending"} />
        </div>

        {step === "uploading" && (
          <div className="upload-progress-bar" style={{ marginTop: 12 }}>
            <div className="upload-progress-fill" style={{ width: `${progress}%` }} />
          </div>
        )}

        {step === "done" && (
          <p style={{ marginTop: 12, fontSize: 13, color: "var(--green-600)", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
            <CheckCircle2 size={16} /> Analysis complete! Refresh to see results.
          </p>
        )}

        {step === "error" && (
          <div style={{ marginTop: 12 }}>
            <p style={{ color: "var(--red-700)", fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
              <XCircle size={16} /> {errorMsg}
            </p>
            <button type="button" className="btn btn-secondary btn-sm" style={{ marginTop: 8 }} onClick={() => { setPhase("choose"); setStep("idle"); }}>
              Try again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ProcessStep({ icon, label, status }: { icon: React.ReactNode; label: string; status: "pending" | "active" | "done" | "failed" }) {
  return (
    <div className="process-step" data-status={status}>
      <span className="process-step-icon">
        {status === "active" ? <Loader2 size={16} className="spin" /> : icon}
      </span>
      <span>{label}</span>
    </div>
  );
}
