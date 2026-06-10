"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Video, Upload, Square, ArrowLeft, Loader2 } from "lucide-react";

type Phase = "choose" | "recording" | "details" | "saving";

export function NewSessionFlow() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [phase, setPhase] = useState<Phase>("choose");
  const [elapsed, setElapsed] = useState(0);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

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
        : MediaRecorder.isTypeSupported("video/webm") ? "video/webm" : "video/mp4";

      const recorder = new MediaRecorder(stream, { mimeType });
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
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
      setErrorMsg("Camera/microphone access denied.");
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

  function handleFileSelect(file: File) {
    setRecordedBlob(file);
    setPhase("details");
  }

  const handleSubmit = useCallback(async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!recordedBlob) return;

    setPhase("saving");
    setErrorMsg(null);

    const fd = new FormData(e.currentTarget);
    const now = new Date();
    const title = String(fd.get("title") ?? "").trim()
      || `Tour ${now.toLocaleDateString(undefined, { month: "short", day: "numeric" })} ${now.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;

    try {
      const createRes = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          scheduledAt: now.toISOString(),
          prospectName: String(fd.get("prospectName") ?? "").trim() || null,
          location: String(fd.get("location") ?? "").trim() || null,
          notes: String(fd.get("notes") ?? "").trim() || null
        })
      });

      if (!createRes.ok) throw new Error("Failed to create session");
      const { session } = await createRes.json() as { session: { id: string } };
      const sessionId = session.id;

      const ext = recordedBlob.type.includes("mp4") ? "mp4" : "webm";
      const file = new File([recordedBlob], `recording-${sessionId}.${ext}`, { type: recordedBlob.type });
      const uploadForm = new FormData();
      uploadForm.append("file", file);

      const uploadRes = await fetch(`/api/sessions/${sessionId}/upload`, { method: "POST", body: uploadForm });
      if (!uploadRes.ok) throw new Error("Upload failed");

      fetch(`/api/sessions/${sessionId}/process`, { method: "POST" });

      router.push(`/sessions/${sessionId}`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong");
      setPhase("details");
    }
  }, [recordedBlob, router]);

  // ── Choose: Record or Upload ──
  if (phase === "choose") {
    return (
      <>
        <button type="button" className="back-link" onClick={() => router.back()}>&larr; Back</button>
        <div className="page-header">
          <h1>New Session</h1>
          <p>Record a tour or upload a file</p>
        </div>
        <div className="card">
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
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); }}
            />
            {errorMsg && <p style={{ color: "var(--red-700)", fontSize: 13, marginTop: 12 }}>{errorMsg}</p>}
          </div>
        </div>
      </>
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

  // ── Details form + save ──
  return (
    <>
      <button type="button" className="back-link" onClick={() => { setPhase("choose"); setRecordedBlob(null); }}>
        <ArrowLeft size={14} style={{ marginRight: 4 }} /> Re-record
      </button>

      <div className="page-header">
        <h1>Session Details</h1>
        <p>
          {recordedBlob
            ? `Recording ready (${(recordedBlob.size / 1024 / 1024).toFixed(1)} MB)`
            : "Fill in details and save"}
        </p>
      </div>

      <div className="card">
        <div className="card-body">
          <form onSubmit={handleSubmit} className="form-grid">
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

            {errorMsg && <p style={{ color: "var(--red-700)", fontSize: 13 }}>{errorMsg}</p>}

            <button type="submit" className="btn btn-primary btn-block" disabled={phase === "saving"}>
              {phase === "saving" ? (
                <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                  <Loader2 size={16} className="spin" /> Saving &amp; uploading...
                </span>
              ) : (
                "Save & Process"
              )}
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
