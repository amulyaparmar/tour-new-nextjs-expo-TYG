"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BookmarkPlus, CalendarDays, Mic, QrCode, Square, CheckCircle2, XCircle, Brain, Sparkles, Upload, Video, GitBranch, Clock, FileText } from "lucide-react";

import type { SessionStatus } from "@tour/shared";
import { waitForSessionProcessing } from "@/lib/wait-for-session-processing";
import { detectMediaDurationSeconds, uploadFileWithPresign } from "@/lib/client-upload";

type Phase = "choose" | "recording" | "details" | "processing";
type Step = "idle" | "uploading" | "uploaded" | "transcribing" | "segmenting" | "analyzing" | "generating_actions" | "done" | "error";
type RecordingMode = "audio" | "video";

export type SessionDetailDefaults = {
  title: string;
  prospectName: string;
  agentName: string;
  location: string;
};

export type NoteAsset = {
  id: string;
  name: string;
  description: string | null;
  url: string | null;
};

const PIPELINE_STEPS: Array<{ key: Step; label: string; description: string; icon: "upload" | "mic" | "branch" | "brain" | "sparkles" | "check" }> = [
  { key: "uploading", label: "Uploading", description: "Sending recording to server", icon: "upload" },
  { key: "transcribing", label: "Transcribing", description: "Converting speech to text with speaker detection", icon: "mic" },
  { key: "segmenting", label: "Segmenting", description: "Detecting conversation phases in the tour", icon: "branch" },
  { key: "analyzing", label: "Analyzing", description: "AI scoring against the rubric", icon: "brain" },
  { key: "generating_actions", label: "Follow-Up Actions", description: "Creating next steps for this prospect", icon: "sparkles" },
  { key: "done", label: "Complete", description: "Analysis ready", icon: "check" },
];

const STEP_ICONS = {
  upload: Upload,
  mic: Mic,
  branch: GitBranch,
  brain: Brain,
  sparkles: Sparkles,
  check: CheckCircle2,
};

const STEP_DETAILS: Record<Exclude<Step, "idle" | "uploaded">, { stage: string; output: string; status: string }> = {
  uploading: {
    stage: "Uploading recording",
    output: "Recording uploaded securely",
    status: "In progress",
  },
  transcribing: {
    stage: "Transcribing audio",
    output: "Transcript with speaker labels",
    status: "In progress",
  },
  segmenting: {
    stage: "Segmenting conversation",
    output: "Conversation phase map",
    status: "In progress",
  },
  analyzing: {
    stage: "Analyzing rubric",
    output: "Scores, moments, coaching",
    status: "In progress",
  },
  generating_actions: {
    stage: "Creating follow-up actions",
    output: "Next steps and suggested messages",
    status: "In progress",
  },
  done: {
    stage: "Analysis complete",
    output: "Review-ready session",
    status: "Complete",
  },
  error: {
    stage: "Processing stopped",
    output: "Needs retry",
    status: "Failed",
  },
};

function statusToStep(status: SessionStatus): Step {
  switch (status) {
    case "transcribing": return "transcribing";
    case "segmenting": return "segmenting";
    case "analyzing": return "analyzing";
    case "analysis_ready":
    case "reviewed":
      return "done";
    case "failed":
      return "error";
    default:
      return "transcribing";
  }
}

async function startProcessingAndWait(sessionId: string, onStatus?: (status: SessionStatus) => void) {
  const res = await fetch(`/api/sessions/${sessionId}/process`, { method: "POST" });
  const body = await res.json().catch(() => null) as { error?: string; async?: boolean } | null;
  if (!res.ok) {
    throw new Error(body?.error ?? "Processing failed");
  }

  if (res.status === 202 || body?.async) {
    await waitForSessionProcessing(sessionId, {
      fetchSession: async () => {
        const statusRes = await fetch(`/api/sessions/${sessionId}`, { cache: "no-store" });
        if (!statusRes.ok) throw new Error("Failed to check session status.");
        const statusBody = (await statusRes.json()) as {
          session: { status: SessionStatus; overallScore?: number | null };
        };
        onStatus?.(statusBody.session.status);
        return statusBody.session;
      }
    });
    return;
  }
}

function stepIndex(step: Step): number {
  const idx = PIPELINE_STEPS.findIndex((s) => s.key === step);
  return idx >= 0 ? idx : -1;
}

function estimateStageSeconds(step: Step, durationSeconds: number | null): number {
  const duration = durationSeconds ?? 90;
  switch (step) {
    case "uploading":
    case "uploaded":
      return Math.max(8, Math.round(duration * 0.03));
    case "transcribing":
      return Math.max(18, Math.round(duration * 0.35));
    case "segmenting":
      return Math.max(10, Math.round(duration * 0.07));
    case "analyzing":
      return Math.max(22, Math.round(duration * 0.16));
    case "generating_actions":
      return 14;
    default:
      return 0;
  }
}

function estimateRemainingSeconds(step: Step, durationSeconds: number | null, stepElapsed: number): number | null {
  if (step === "done" || step === "error" || step === "idle") return null;
  const normalizedStep = step === "uploaded" ? "uploading" : step;
  const currentIdx = stepIndex(normalizedStep);
  if (currentIdx < 0) return null;

  const activeRemaining = Math.max(0, estimateStageSeconds(normalizedStep, durationSeconds) - stepElapsed);
  const upcoming = PIPELINE_STEPS
    .slice(currentIdx + 1)
    .reduce((sum, pipelineStep) => sum + estimateStageSeconds(pipelineStep.key, durationSeconds), 0);
  return activeRemaining + upcoming;
}

function formatEta(seconds: number | null): string {
  if (seconds === null) return "Estimating";
  if (seconds <= 15) return "Finishing";
  if (seconds < 60) return "<1 min";
  return `~${Math.ceil(seconds / 60)} min`;
}

export function UploadAndProcess({
  sessionId,
  hasRecording,
  variant = "record",
  defaults,
  noteAssets = [],
  recordingDuration = null
}: {
  sessionId: string;
  hasRecording: boolean;
  variant?: "record" | "new-session";
  defaults?: SessionDetailDefaults;
  noteAssets?: NoteAsset[];
  recordingDuration?: number | null;
}) {
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
  const [recordingMode, setRecordingMode] = useState<RecordingMode>("video");
  const [processingElapsed, setProcessingElapsed] = useState(0);
  const [stepElapsed, setStepElapsed] = useState(0);
  const [mediaDurationSec, setMediaDurationSec] = useState<number | null>(recordingDuration ?? null);
  const [notesDraft, setNotesDraft] = useState("");
  const [insertedAssetIds, setInsertedAssetIds] = useState<string[]>([]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  useEffect(() => {
    if (phase !== "processing" || step === "done" || step === "error") return;
    const t = setInterval(() => {
      setProcessingElapsed((e) => e + 1);
      setStepElapsed((e) => e + 1);
    }, 1000);
    return () => clearInterval(t);
  }, [phase, step]);

  useEffect(() => {
    setStepElapsed(0);
  }, [phase, step]);

  useEffect(() => {
    if (recordingDuration && recordingDuration > 0) setMediaDurationSec(recordingDuration);
  }, [recordingDuration]);

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

  const guessExtension = (mimeType: string) => {
    if (mimeType.includes("mpeg")) return "mp3";
    if (mimeType.includes("wav")) return "wav";
    if (mimeType.includes("mp4")) return "mp4";
    if (mimeType.includes("quicktime")) return "mov";
    return "webm";
  };

  function appendAssetNote(asset: NoteAsset) {
    setNotesDraft((current) => {
      const lines = [
        `Important follow-up asset: ${asset.name}`,
        asset.description ? `Context: ${asset.description}` : null,
        asset.url ? `Link: ${asset.url}` : null
      ].filter(Boolean);
      const snippet = lines.join("\n");
      return current.trim() ? `${current.trim()}\n\n${snippet}` : snippet;
    });
    setInsertedAssetIds((current) => current.includes(asset.id) ? current : [...current, asset.id]);
  }

  async function startRecording(mode: RecordingMode = "video") {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: mode === "video",
        audio: true
      });
      streamRef.current = stream;
      setRecordingMode(mode);
      if (mode === "video" && videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.muted = true;
        videoRef.current.play();
      }
      chunksRef.current = [];

      const mimeType = mode === "video"
        ? MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
          ? "video/webm;codecs=vp9,opus"
          : MediaRecorder.isTypeSupported("video/webm")
            ? "video/webm"
            : "video/mp4"
        : MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : MediaRecorder.isTypeSupported("audio/webm")
            ? "audio/webm"
            : "audio/mp4";

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

      // The tour is live now — move the session out of "scheduled".
      void fetch(`/api/sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "in_progress" })
      }).catch(() => {});
    } catch {
      setErrorMsg(mode === "video"
        ? "Camera/microphone access denied. Please allow access and try again."
        : "Microphone access denied. Please allow access and try again.");
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
      setMediaDurationSec(elapsed > 0 ? elapsed : null);
      setRecordedBlob(blob);
      setPhase("details");
    };
    recorder.stop();
  }

  const uploadBlob = useCallback(async (file: File, durationSec: number | null) => {
    await uploadFileWithPresign({
      presignUrl: `/api/sessions/${sessionId}/upload/presign`,
      completeUrl: `/api/sessions/${sessionId}/upload/complete`,
      file,
      contentType: file.type || "application/octet-stream",
      presignBody: {
        fileName: file.name,
        contentType: file.type || "application/octet-stream",
      },
      completeBody: () => ({
        ...(durationSec && durationSec > 0 ? { durationSec } : {}),
      }),
      onProgress: setProgress,
    });
  }, [sessionId]);

  async function processFile(file: File) {
    setPhase("processing");
    setStep("uploading");
    setProgress(0);
    setProcessingElapsed(0);
    setStepElapsed(0);
    setErrorMsg(null);
    try {
      const detectedDuration = mediaDurationSec ?? await detectMediaDurationSeconds(file);
      if (detectedDuration) setMediaDurationSec(detectedDuration);
      await uploadBlob(file, detectedDuration);
      setStep("uploaded");
      setProgress(100);
      setStep("transcribing");

      await startProcessingAndWait(sessionId, (status) => {
        const mapped = statusToStep(status);
        if (mapped === "analyzing") {
          setStep(mapped);
        } else if (mapped === "segmenting" || mapped === "transcribing") {
          setStep(mapped);
        } else if (mapped === "done") {
          setStep("generating_actions");
        }
      });
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
    const an = String(fd.get("agentName") ?? "").trim();
    if (an) body.agentName = an;
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
      const ext = guessExtension(blob.type);
      const file = new File([blob], `recording-${sessionId}.${ext}`, { type: blob.type });
      await processFile(file);
    }
  }

  async function handleFileUpload(file: File) {
    setRecordedBlob(file);
    setPhase("details");
    void detectMediaDurationSeconds(file).then((duration) => {
      if (duration) setMediaDurationSec(duration);
    });
  }

  const startProcessing = useCallback(async () => {
    setPhase("processing");
    setStep("transcribing");
    setProcessingElapsed(0);
    setStepElapsed(0);
    setErrorMsg(null);
    try {
      await startProcessingAndWait(sessionId, (status) => setStep(statusToStep(status)));
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
    if (variant === "new-session") {
      return (
        <div className="create-panel" role="region" aria-label="New session options">
          <div className="create-panel-heading">
            <h2>New Session</h2>
            <p>Capture a live tour conversation or add a recording from Fireflies, Zoom, or your device.</p>
          </div>

          <button type="button" className="create-primary-action" onClick={() => startRecording("audio")}>
            <span className="create-action-icon">
              <Mic size={24} />
            </span>
            <span>
              <span className="create-action-title">Start a Tour</span>
              <span className="create-action-copy">Record audio for an in-person or virtual tour.</span>
            </span>
          </button>

          <button type="button" className="create-primary-action" onClick={() => inputRef.current?.click()} style={{ marginBottom: 12, background: "white", color: "var(--slate-700)", borderColor: "var(--slate-200)" }}>
            <span className="create-action-icon">
              <Upload size={24} />
            </span>
            <span>
              <span className="create-action-title">Upload a Recording</span>
              <span className="create-action-copy">Add Fireflies audio, Zoom video, or a saved file.</span>
            </span>
          </button>

          <div className="create-action-grid">
            <button type="button" className="create-action-card" onClick={() => router.push("/calendar")}>
              <CalendarDays size={20} />
              <span>
                <span className="create-action-title">Choose an Upcoming Tour</span>
                <span className="create-action-copy">Start from a scheduled tour and keep it connected.</span>
              </span>
            </button>
            <button type="button" className="create-action-card" onClick={() => router.push("/calendar")}>
              <QrCode size={20} />
              <span>
                <span className="create-action-title">Create a Check-In Link</span>
                <span className="create-action-copy">Group everyone from the same tour session.</span>
              </span>
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
          {errorMsg && <p className="create-error">{errorMsg}</p>}
        </div>
      );
    }

    return (
      <div className="card record-tour-card">
        <div className="card-header"><h2>Record Tour</h2></div>
        <div className="card-body">
          <div className="record-options">
            <button type="button" className="record-option-btn primary" onClick={() => startRecording("video")}>
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
    if (recordingMode === "audio") {
      return (
        <div className="audio-recorder">
          <div className="recording-workspace">
            <div className="audio-recorder-card">
              <div className="audio-recorder-icon">
                <Mic size={30} />
              </div>
              <div className="recording-indicator audio-recorder-status">
                <span className="recording-dot" />
                <span>Recording tour audio</span>
              </div>
              <span className="recorder-timer audio-recorder-timer">{formatTime(elapsed)}</span>
              <button type="button" className="btn btn-danger" onClick={stopRecording}>
                <Square size={16} fill="white" /> Stop Recording
              </button>
            </div>
            <AssetNotesPanel
              assets={noteAssets}
              insertedIds={insertedAssetIds}
              notes={notesDraft}
              onAdd={appendAssetNote}
              onNotesChange={setNotesDraft}
            />
          </div>
        </div>
      );
    }

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
          <div className="recorder-notes-dock">
            <AssetNotesPanel
              assets={noteAssets}
              insertedIds={insertedAssetIds}
              notes={notesDraft}
              onAdd={appendAssetNote}
              onNotesChange={setNotesDraft}
              compact
            />
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
              <input id="title" name="title" type="text" className="form-input" defaultValue={defaults?.title ?? ""} placeholder="Downtown Unit Tour" />
            </div>
            <div className="form-group">
              <label htmlFor="agentName" className="form-label">Agent name</label>
              <input id="agentName" name="agentName" type="text" className="form-input" defaultValue={defaults?.agentName ?? ""} placeholder="Your name" />
            </div>
            <div className="form-group">
              <label htmlFor="prospectName" className="form-label">Prospect name</label>
              <input id="prospectName" name="prospectName" type="text" className="form-input" defaultValue={defaults?.prospectName ?? ""} placeholder="Sarah Johnson" />
            </div>
            <div className="form-group">
              <label htmlFor="location" className="form-label">Location</label>
              <input id="location" name="location" type="text" className="form-input" defaultValue={defaults?.location ?? ""} placeholder="Tower A - Unit 1204" />
            </div>
            <AssetNotesPanel
              assets={noteAssets}
              insertedIds={insertedAssetIds}
              notes={notesDraft}
              onAdd={appendAssetNote}
              onNotesChange={setNotesDraft}
            />
            <div className="form-group">
              <label htmlFor="notes" className="form-label">Notes</label>
              <textarea
                id="notes"
                name="notes"
                rows={4}
                className="form-textarea"
                value={notesDraft}
                onChange={(event) => setNotesDraft(event.target.value)}
                placeholder="Key topics, requested links, assets to send..."
              />
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
  const visibleStepCount = isDone
    ? totalSteps
    : isError
      ? Math.max(1, currentIdx + 1)
      : Math.max(1, currentIdx + 1);
  const overallPct = isDone ? 100 : isError ? 0 : Math.round((visibleStepCount / totalSteps) * 100);
  const activeStep = PIPELINE_STEPS.find((ps) => ps.key === step || (step === "uploaded" && ps.key === "uploading"));
  const activeDetails = STEP_DETAILS[step === "uploaded" ? "uploading" : step === "idle" ? "transcribing" : step];
  const etaSeconds = estimateRemainingSeconds(step, mediaDurationSec, stepElapsed);

  return (
    <div className="pipeline-stage-card">
      <div className="pipeline-stage-header">
        <div className="pipeline-stage-heading">
          <div className={`pipeline-stage-icon ${isDone ? "is-done" : isError ? "is-error" : ""}`}>
            {isDone ? <CheckCircle2 size={30} /> : isError ? <XCircle size={30} /> : <Mic size={30} />}
          </div>
          <div>
            <h2>{isDone ? "Analysis complete" : isError ? "Processing failed" : "Analyzing your tour"}</h2>
            <p>
              {isDone
                ? "Loading your results..."
                : isError
                  ? errorMsg
                  : "We're converting the recording into structured insights and follow-up actions."}
            </p>
          </div>
        </div>
        <div className="pipeline-elapsed" aria-label={`Elapsed time ${formatTime(processingElapsed)}`}>
          <div>
            <Clock size={18} />
            <strong>{formatTime(processingElapsed)}</strong>
          </div>
          <span>Elapsed time</span>
        </div>
      </div>

      <div className="pipeline-divider" />

      <div className="pipeline-progress-row">
        <strong>{overallPct}%</strong>
        <span>{visibleStepCount} of {totalSteps} steps complete</span>
      </div>
      {!isError && (
        <div className="pipeline-progress-track" aria-label={`${overallPct}% complete`}>
          <div
            className={`pipeline-progress-fill ${isDone ? "is-done" : ""}`}
            style={{ width: `${overallPct}%` }}
          />
        </div>
      )}

      <div className="pipeline-timeline" aria-label="Processing steps">
        {PIPELINE_STEPS.map((ps, i) => {
          const Icon = STEP_ICONS[ps.icon];
          const isActive = ps.key === step || (step === "uploaded" && ps.key === "uploading");
          const isPast = isDone || currentIdx > i;
          const state = isPast ? "done" : isActive && !isDone && !isError ? "active" : isError && isActive ? "error" : "upcoming";

          return (
            <div className="pipeline-timeline-step" data-state={state} key={ps.key}>
              {i > 0 && <span className="pipeline-step-connector" data-filled={isDone || currentIdx >= i ? "true" : "false"} />}
              <div className="pipeline-step-node">
                {isPast ? <CheckCircle2 size={24} /> : isError && isActive ? <XCircle size={24} /> : <Icon size={24} />}
                {isPast && i === 0 && <span className="pipeline-step-check"><CheckCircle2 size={14} /></span>}
              </div>
              <span className="pipeline-step-number">{i + 1}</span>
              <strong>{ps.label}</strong>
              <small>{isPast ? "Completed" : isActive && !isError ? "In progress" : isError && isActive ? "Failed" : "Upcoming"}</small>
            </div>
          );
        })}
      </div>

      <div className="pipeline-divider" />

      <div className="pipeline-summary-grid">
        <article className="pipeline-summary-card">
          <span className="pipeline-summary-icon">
            {activeStep ? (() => {
              const Icon = STEP_ICONS[activeStep.icon];
              return <Icon size={24} />;
            })() : <Mic size={24} />}
          </span>
          <div>
            <span>Current stage</span>
            <strong>{activeDetails.stage}</strong>
            <small data-tone={isError ? "error" : isDone ? "done" : "active"}>{activeDetails.status}</small>
          </div>
        </article>

        <article className="pipeline-summary-card">
          <span className="pipeline-summary-icon is-eta">
            <Clock size={24} />
          </span>
          <div>
            <span>Estimated time left</span>
            <strong>{formatEta(etaSeconds)}</strong>
            <small>Based on current progress</small>
          </div>
        </article>

        <article className="pipeline-summary-card">
          <span className="pipeline-summary-icon is-output">
            <FileText size={24} />
          </span>
          <div>
            <span>Output</span>
            <strong>{activeDetails.output}</strong>
            <small data-tone="done">{isDone ? "Ready" : "Planned output"}</small>
          </div>
        </article>
      </div>

      {/* Error retry */}
      {isError && (
        <div className="pipeline-retry-actions">
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

function AssetNotesPanel({
  assets,
  insertedIds,
  notes,
  onAdd,
  onNotesChange,
  compact = false
}: {
  assets: NoteAsset[];
  insertedIds: string[];
  notes: string;
  onAdd: (asset: NoteAsset) => void;
  onNotesChange: (notes: string) => void;
  compact?: boolean;
}) {
  if (assets.length === 0 && compact) return null;

  return (
    <div className={`recording-assets ${compact ? "recording-assets-compact" : ""}`}>
      <div className="recording-assets-head">
        <span><BookmarkPlus size={15} /> Important assets</span>
        <small>{insertedIds.length ? `${insertedIds.length} added` : "Add to notes"}</small>
      </div>

      {assets.length > 0 ? (
        <div className="recording-asset-list">
          {assets.map((asset) => {
            const inserted = insertedIds.includes(asset.id);
            return (
              <button
                key={asset.id}
                type="button"
                className={`recording-asset-chip ${inserted ? "recording-asset-chip-added" : ""}`}
                onClick={() => onAdd(asset)}
              >
                <span>{asset.name}</span>
                <small>{inserted ? "Added" : "Insert"}</small>
              </button>
            );
          })}
        </div>
      ) : (
        <p className="recording-assets-empty">Add assets in Materials to insert them here.</p>
      )}

      {compact ? (
        <textarea
          className="recording-assets-notes"
          value={notes}
          onChange={(event) => onNotesChange(event.target.value)}
          rows={3}
          placeholder="Follow-up notes and assets..."
        />
      ) : null}
    </div>
  );
}
