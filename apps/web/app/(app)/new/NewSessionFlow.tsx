"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  CalendarDays,
  Camera,
  CirclePlus,
  ClipboardList,
  FolderPlus,
  Globe2,
  Library,
  Loader2,
  Mic,
  QrCode,
  Square,
  Upload,
  UserRound
} from "lucide-react";

import { SmartSessionForm } from "../SmartSessionForm";
import { RubricSelector } from "../RubricSelector";
import { uploadFileWithPresign } from "@/lib/client-upload";

type Phase = "choose" | "lead" | "recording" | "details" | "saving" | "bulk";
type CreateTab = "session" | "content";
type RecordingMode = "audio" | "video";
type DraftType = "session" | "content";
type BulkUploadStatus = "queued" | "creating" | "uploading" | "processing" | "done" | "error";
type BulkUploadItem = {
  id: string;
  file: File;
  status: BulkUploadStatus;
  progress: number;
  sessionId: string | null;
  error: string | null;
};

function cleanDateTourTitle(date: Date) {
  const day = date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const time = date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }).replace(/\s+/g, " ");
  return `${day} ${time} Tour`;
}

function initialsForName(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "ME";
}

export function NewSessionFlow({ propertyLocation, profileName }: { propertyLocation: string; profileName: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inputRef = useRef<HTMLInputElement>(null);
  const addMoreInputRef = useRef<HTMLInputElement>(null);
  const contentInputRef = useRef<HTMLInputElement>(null);
  const rubricInputRef = useRef<HTMLInputElement>(null);
  const sessionDetailsFormRef = useRef<HTMLFormElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [phase, setPhase] = useState<Phase>("choose");
  const [activeTab, setActiveTab] = useState<CreateTab>("session");
  const [recordingMode, setRecordingMode] = useState<RecordingMode>("audio");
  const [draftType, setDraftType] = useState<DraftType>("session");
  const [elapsed, setElapsed] = useState(0);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [contentUploading, setContentUploading] = useState(false);
  const [bulkItems, setBulkItems] = useState<BulkUploadItem[]>([]);
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [uploaderIsAgent, setUploaderIsAgent] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStage, setUploadStage] = useState<string | null>(null);
  const defaultSessionTitle = cleanDateTourTitle(new Date());
  const profileInitials = initialsForName(profileName);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  useEffect(() => {
    if (searchParams.get("mode") === "lead") {
      setPhase("lead");
    }
  }, [searchParams]);

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
    if (mimeType.includes("png")) return "png";
    if (mimeType.includes("jpeg") || mimeType.includes("jpg")) return "jpg";
    if (mimeType.includes("gif")) return "gif";
    if (mimeType.includes("pdf")) return "pdf";
    return "webm";
  };

  function fileFromCurrentRecording(): File | null {
    if (!recordedBlob) return null;
    if (recordedBlob instanceof File) return recordedBlob;
    const ext = guessExtension(recordedBlob.type);
    return new File([recordedBlob], `recording-${Date.now()}.${ext}`, { type: recordedBlob.type });
  }

  function handleAddMoreSessions(files: FileList | File[]) {
    const current = fileFromCurrentRecording();
    const next = Array.from(files);
    handleBulkFileSelect(current ? [current, ...next] : next);
  }

  async function startRecording(mode: RecordingMode = "audio", draft: DraftType = "session") {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: mode === "video",
        audio: true
      });
      streamRef.current = stream;
      setRecordingMode(mode);
      setDraftType(draft);
      if (mode === "video" && videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.muted = true;
        videoRef.current.play();
      }
      chunksRef.current = [];
      const mimeType = mode === "video"
        ? MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
          ? "video/webm;codecs=vp9,opus"
          : MediaRecorder.isTypeSupported("video/webm") ? "video/webm" : "video/mp4"
        : MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4";

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
      setErrorMsg(mode === "video" ? "Camera/microphone access denied." : "Microphone access denied.");
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

  function handleFileSelect(file: File, draft: DraftType = "session") {
    setDraftType(draft);
    setRecordedBlob(file);
    setUploadProgress(0);
    setUploadStage(null);
    setErrorMsg(null);
    setPhase("details");
  }

  function handleBulkFileSelect(files: FileList | File[]) {
    const selected = Array.from(files).filter((file) => file.type.startsWith("audio/") || file.type.startsWith("video/"));
    if (selected.length === 0) return;
    setBulkItems(selected.map((file, index) => ({
      id: `${file.name}-${file.size}-${file.lastModified}-${index}`,
      file,
      status: "queued",
      progress: 0,
      sessionId: null,
      error: null,
    })));
    setBulkProcessing(false);
    setErrorMsg(null);
    setPhase("bulk");
  }

  function updateBulkItem(id: string, patch: Partial<BulkUploadItem>) {
    setBulkItems((items) => items.map((item) => item.id === id ? { ...item, ...patch } : item));
  }

  async function processBulkUploads(itemIds?: string[]) {
    if (bulkProcessing || bulkItems.length === 0) return;
    setBulkProcessing(true);
    setErrorMsg(null);
    const itemsToProcess = itemIds?.length
      ? bulkItems.filter((item) => itemIds.includes(item.id))
      : bulkItems.filter((item) => item.status === "queued" || item.status === "error");

    for (const item of itemsToProcess) {
      try {
        updateBulkItem(item.id, { status: "creating", error: null, progress: 0 });
        const title = item.file.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ").trim() || "Uploaded tour";
        const createRes = await fetch("/api/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title,
            scheduledAt: new Date().toISOString(),
            uploaderIsAgent,
          }),
        });
        const createBody = await createRes.json().catch(() => null) as { session?: { id: string }; error?: string } | null;
        if (!createRes.ok || !createBody?.session?.id) {
          throw new Error(createBody?.error ?? "Failed to create session");
        }

        const sessionId = createBody.session.id;
        updateBulkItem(item.id, { status: "uploading", sessionId });
        await uploadFileWithPresign({
          presignUrl: `/api/sessions/${sessionId}/upload/presign`,
          completeUrl: `/api/sessions/${sessionId}/upload/complete`,
          file: item.file,
          contentType: item.file.type || "application/octet-stream",
          presignBody: {
            fileName: item.file.name,
            contentType: item.file.type || "application/octet-stream",
          },
          onProgress: (progress) => updateBulkItem(item.id, {
            progress: Math.max(0, Math.min(100, progress)),
          }),
        });

        updateBulkItem(item.id, { status: "processing", progress: 100 });
        const processRes = await fetch(`/api/sessions/${sessionId}/process`, { method: "POST" });
        const processBody = await processRes.json().catch(() => null) as { error?: string } | null;
        if (!processRes.ok) {
          throw new Error(processBody?.error ?? "Failed to start processing");
        }
        updateBulkItem(item.id, { status: "done" });
      } catch (err) {
        updateBulkItem(item.id, {
          status: "error",
          error: err instanceof Error ? err.message : "Upload failed",
        });
      }
    }

    setBulkProcessing(false);
    router.refresh();
  }

  async function handleRubricTemplateSelect(file: File) {
    setContentUploading(true);
    setErrorMsg(null);
    try {
      await uploadFileWithPresign({
        presignUrl: "/api/rubrics/upload/presign",
        completeUrl: "/api/rubrics/upload/complete",
        file,
        contentType: file.type || "application/octet-stream",
        presignBody: {
          fileName: file.name,
          contentType: file.type || "application/octet-stream",
        },
        completeBody: () => ({ fileName: file.name }),
      });
      router.push("/rubrics");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Rubric upload failed");
    } finally {
      setContentUploading(false);
    }
  }

  const handleSubmit = useCallback(async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!recordedBlob) return;

    setPhase("saving");
    setErrorMsg(null);
    setUploadProgress(0);
    setUploadStage("Preparing upload");

    const fd = new FormData(e.currentTarget);
    const now = new Date();
    const rawTitle = String(fd.get("title") ?? "").trim();
    const contentTitle = rawTitle
      || `Tour ${now.toLocaleDateString(undefined, { month: "short", day: "numeric" })} ${now.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;

    try {
      if (draftType === "content") {
        const ext = guessExtension(recordedBlob.type);
        const file = new File([recordedBlob], `content-${Date.now()}.${ext}`, { type: recordedBlob.type });
        setUploadStage("Uploading file");
        await uploadFileWithPresign({
          presignUrl: "/api/materials/upload/presign",
          completeUrl: "/api/materials/upload/complete",
          file,
          contentType: file.type || "application/octet-stream",
          presignBody: {
            fileName: file.name,
            contentType: file.type || "application/octet-stream",
          },
          completeBody: () => ({
            name: contentTitle,
            description: [
              String(fd.get("location") ?? "").trim(),
              String(fd.get("notes") ?? "").trim()
            ].filter(Boolean).join("\n\n"),
            type: "other",
          }),
          onProgress: (progress) => {
            setUploadProgress(Math.max(0, Math.min(100, progress)));
            setUploadStage("Uploading file");
          },
        });
        setUploadProgress(100);
        setUploadStage("Finalizing");

        router.push("/materials");
        return;
      }

      setUploadStage("Creating session");
      const ext = guessExtension(recordedBlob.type);
      const sourceFileName = recordedBlob instanceof File
        ? recordedBlob.name
        : `recording-${Date.now()}.${ext}`;
      const createRes = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: rawTitle || null,
          sourceFileName,
          scheduledAt: now.toISOString(),
          prospectName: String(fd.get("prospectName") ?? "").trim() || null,
          uploaderIsAgent: fd.get("uploaderIsAgent") === "on",
          location: String(fd.get("location") ?? "").trim() || null,
          notes: String(fd.get("notes") ?? "").trim() || null,
          rubricId: String(fd.get("rubricId") ?? "").trim() || null
        })
      });

      if (!createRes.ok) throw new Error("Failed to create session");
      const { session } = await createRes.json() as { session: { id: string } };
      const sessionId = session.id;

      const file = new File([recordedBlob], `recording-${sessionId}.${ext}`, { type: recordedBlob.type });
      setUploadStage("Uploading recording");
      await uploadFileWithPresign({
        presignUrl: `/api/sessions/${sessionId}/upload/presign`,
        completeUrl: `/api/sessions/${sessionId}/upload/complete`,
        file,
        contentType: file.type || "application/octet-stream",
        presignBody: {
          fileName: file.name,
          contentType: file.type || "application/octet-stream",
        },
        onProgress: (progress) => {
          setUploadProgress(Math.max(0, Math.min(100, progress)));
          setUploadStage("Uploading recording");
        },
      });
      setUploadProgress(100);
      setUploadStage("Starting analysis");

      fetch(`/api/sessions/${sessionId}/process`, { method: "POST" });

      router.push(`/sessions/${sessionId}`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong");
      setUploadStage(null);
      setUploadProgress(0);
      setPhase("details");
    }
  }, [draftType, recordedBlob, router]);

  // ── Choose: Record or Upload ──
  if (phase === "choose") {
    return (
      <>
        <button type="button" className="back-link" onClick={() => router.back()}>&larr; Back</button>
        <div className="page-header create-page-header">
          <h1>Add to Tour</h1>
          <p>Start a tour session or create content for the tour library.</p>
        </div>

        <div className="create-tabs" role="tablist" aria-label="Create type">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "session"}
            className="create-tab"
            onClick={() => setActiveTab("session")}
          >
            New Session
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "content"}
            className="create-tab"
            onClick={() => setActiveTab("content")}
          >
            New Content
          </button>
        </div>

        {activeTab === "session" ? (
          <div className="create-panel" role="tabpanel">
            <div className="create-panel-heading">
              <h2>New Session</h2>
              <p>Capture a live tour conversation or add a recording from Fireflies, Zoom, or your device.</p>
            </div>

            <button type="button" className="create-primary-action" onClick={() => startRecording("audio", "session")}>
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
                <span className="create-action-copy">Add one or many Fireflies, Zoom, audio, or video files.</span>
              </span>
            </button>

            <div className="create-action-grid">
              <button type="button" className="create-action-card" onClick={() => setPhase("lead")}>
                <UserRound size={20} />
                <span>
                  <span className="create-action-title">Capture Tour Lead</span>
                  <span className="create-action-copy">Log prospect details, then record or upload after.</span>
                </span>
              </button>
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

            <div className="create-section-footer">
              <span className="create-section-label">Upcoming Tours</span>
              <span>No upcoming tours yet.</span>
            </div>
          </div>
        ) : (
          <div className="create-panel" role="tabpanel">
            <div className="create-panel-heading">
              <h2>New Content</h2>
              <p>Upload rubric templates, media, or training files for your property tour library.</p>
            </div>

            <button
              type="button"
              className="create-primary-action content"
              disabled={contentUploading}
              onClick={() => rubricInputRef.current?.click()}
            >
              <span className="create-action-icon">
                <ClipboardList size={24} />
              </span>
              <span>
                <span className="create-action-title">
                  {contentUploading ? "Extracting rubric..." : "Upload Rubric Template"}
                </span>
                <span className="create-action-copy">PDF or doc — AI extracts scoring criteria for sessions.</span>
              </span>
            </button>

            <button
              type="button"
              className="create-primary-action"
              disabled={contentUploading}
              onClick={() => contentInputRef.current?.click()}
              style={{ marginBottom: 12, background: "white", color: "var(--slate-700)", borderColor: "var(--slate-200)" }}
            >
              <span className="create-action-icon">
                <Upload size={24} />
              </span>
              <span>
                <span className="create-action-title">Upload Media or File</span>
                <span className="create-action-copy">Photos, videos, floorplans, training PDFs, and more.</span>
              </span>
            </button>

            <div className="create-action-grid">
              <button type="button" className="create-action-card" onClick={() => startRecording("video", "content")}>
                <Camera size={20} />
                <span>
                  <span className="create-action-title">Record Video</span>
                  <span className="create-action-copy">Capture walkthroughs, amenities, or quick updates.</span>
                </span>
              </button>
              <button type="button" className="create-action-card" onClick={() => router.push("/materials")}>
                <FolderPlus size={20} />
                <span>
                  <span className="create-action-title">Add Material</span>
                  <span className="create-action-copy">Name, type, description, and optional file upload.</span>
                </span>
              </button>
              <button type="button" className="create-action-card" onClick={() => router.push("/tour-new")}>
                <Globe2 size={20} />
                <span>
                  <span className="create-action-title">Collect From Website</span>
                  <span className="create-action-copy">Pull property details, links, and source material.</span>
                </span>
              </button>
              <button type="button" className="create-action-card" onClick={() => router.push("/materials")}>
                <Library size={20} />
                <span>
                  <span className="create-action-title">Open Content Library</span>
                  <span className="create-action-copy">Review and organize saved tour assets.</span>
                </span>
              </button>
            </div>

            <div className="create-section-footer">
              <span className="create-section-label">Active Projects</span>
              <span>No active content projects yet.</span>
            </div>
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          accept="video/*,audio/*"
          multiple
          style={{ display: "none" }}
          onChange={(e) => {
            const files = e.target.files;
            if (!files?.length) return;
            if (files.length === 1) handleFileSelect(files[0]!, "session");
            else handleBulkFileSelect(files);
            e.target.value = "";
          }}
        />
        <input
          ref={contentInputRef}
          type="file"
          accept="video/*,image/*,application/pdf"
          style={{ display: "none" }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelect(f, "content"); }}
        />
        <input
          ref={rubricInputRef}
          type="file"
          accept=".pdf,.txt,.md,.csv,.json,text/*,application/pdf"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleRubricTemplateSelect(f);
            e.target.value = "";
          }}
        />
        {errorMsg && <p className="create-error">{errorMsg}</p>}
      </>
    );
  }

  if (phase === "lead") {
    return (
      <>
        <button
          type="button"
          className="back-link"
          onClick={() => {
            setPhase("choose");
            router.replace("/new");
          }}
        >
          <ArrowLeft size={14} style={{ marginRight: 4 }} /> Back
        </button>
        <div className="page-header create-page-header">
          <h1>New tour lead</h1>
          <p>Capture prospect contact details, source, budget, and tour intent.</p>
        </div>

        <div className="create-panel smart-session-page-panel">
          <SmartSessionForm
            mode="page"
            onCancel={() => {
              setPhase("choose");
              router.replace("/new");
            }}
          />
        </div>
      </>
    );
  }

  if (phase === "bulk") {
    const doneCount = bulkItems.filter((item) => item.status === "done").length;
    const errorCount = bulkItems.filter((item) => item.status === "error").length;
    const readyCount = bulkItems.filter((item) => item.status === "queued" || item.status === "error").length;
    return (
      <>
        <button type="button" className="back-link" onClick={() => { setPhase("choose"); setBulkItems([]); }}>
          <ArrowLeft size={14} style={{ marginRight: 4 }} /> Back
        </button>
        <div className="page-header">
          <h1>Bulk upload sessions</h1>
          <p>
            {bulkProcessing
              ? `${doneCount} of ${bulkItems.length} processing${errorCount ? `, ${errorCount} needs attention` : ""}`
              : `${bulkItems.length} recording${bulkItems.length === 1 ? "" : "s"} ready for review`}
          </p>
        </div>

        <div className="card">
          <div className="card-body bulk-upload-list">
            <label className="form-check-row bulk-upload-agent-check">
              <input
                type="checkbox"
                checked={uploaderIsAgent}
                onChange={(event) => setUploaderIsAgent(event.currentTarget.checked)}
                disabled={bulkProcessing}
              />
              <span>
                <strong>I am the leasing agent</strong>
                <small>Use my profile name for these sessions. Leave unchecked to let AI identify the agent from audio.</small>
              </span>
            </label>
            {bulkItems.map((item) => (
              <div key={item.id} className="bulk-upload-row">
                <div className="bulk-upload-icon"><Upload size={18} /></div>
                <div className="bulk-upload-main">
                  <div className="bulk-upload-title">{item.file.name}</div>
                  <div className="bulk-upload-meta">
                    {(item.file.size / 1024 / 1024).toFixed(1)} MB · {bulkStatusLabel(item.status)}
                    {item.sessionId ? ` · session ${item.sessionId.slice(0, 8)}` : ""}
                  </div>
                  {item.status === "uploading" && (
                    <div className="bulk-upload-progress">
                      <span style={{ width: `${item.progress}%` }} />
                    </div>
                  )}
                  {item.error && <div className="bulk-upload-error">{item.error}</div>}
                </div>
                <div className="bulk-upload-actions">
                  {item.status === "done" && item.sessionId && (
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => router.push(`/sessions/${item.sessionId}`)}>
                      Open
                    </button>
                  )}
                  {item.status === "error" && (
                    <button type="button" className="btn btn-secondary btn-sm" disabled={bulkProcessing} onClick={() => void processBulkUploads([item.id])}>
                      Retry
                    </button>
                  )}
                  {(item.status === "queued" || item.status === "error") && <span className="badge badge-reviewed">Ready</span>}
                  {(item.status === "creating" || item.status === "processing") && <span className="badge badge-processing">Started</span>}
                  {item.status === "done" && <span className="badge badge-reviewed">Done</span>}
                  {item.status === "error" && <span className="badge badge-failed">Failed</span>}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
          <button type="button" className="btn btn-primary" disabled={bulkProcessing || readyCount === 0} onClick={() => void processBulkUploads()}>
            {bulkProcessing ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <Loader2 size={16} className="spin" /> Uploading...
              </span>
            ) : (
              "Create & Process Ready"
            )}
          </button>
          <button type="button" className="btn btn-secondary" disabled={bulkProcessing} onClick={() => inputRef.current?.click()}>
            Choose Different Files
          </button>
          {errorCount > 0 && !bulkProcessing && (
            <button type="button" className="btn btn-secondary" onClick={() => void processBulkUploads(bulkItems.filter((item) => item.status === "error").map((item) => item.id))}>
              Retry Failed
            </button>
          )}
          {doneCount > 0 && (
            <button type="button" className="btn btn-secondary" onClick={() => router.push("/sessions")}>
              View Sessions
            </button>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="video/*,audio/*"
          multiple
          style={{ display: "none" }}
          onChange={(e) => {
            const files = e.target.files;
            if (!files?.length) return;
            if (files.length === 1) {
              const file = files.item(0);
              if (file) handleFileSelect(file, "session");
            } else {
              handleBulkFileSelect(files);
            }
            e.target.value = "";
          }}
        />
      </>
    );
  }
  // ── Full-screen recording ──
  if (phase === "recording") {
    if (recordingMode === "audio") {
      return (
        <div className="audio-recorder">
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
      <button type="button" className="back-link session-details-back-link" onClick={() => { setPhase("choose"); setRecordedBlob(null); }}>
        <ArrowLeft size={14} style={{ marginRight: 4 }} /> Back
      </button>

      <div className="page-header session-details-header">
        <div>
          <h1>{draftType === "content" ? "Content Details" : "Session Details"}</h1>
          <p>
            {recordedBlob
              ? `${draftType === "content" ? "File" : "Recording"} ready (${(recordedBlob.size / 1024 / 1024).toFixed(1)} MB)`
              : "Fill in details and save"}
          </p>
        </div>
        {draftType === "session" && (
          <button type="button" className="btn add-more-sessions-btn" disabled={phase === "saving"} onClick={() => addMoreInputRef.current?.click()}>
            <CirclePlus size={15} />
            Add more sessions
          </button>
        )}
      </div>

      <div className="card session-details-card">
        <div className="card-body">
          <form ref={sessionDetailsFormRef} onSubmit={handleSubmit} className="form-grid session-details-grid">
            <div className="form-group">
              <label htmlFor="title" className="form-label">{draftType === "content" ? "Content title" : "Session title"}</label>
              <input
                id="title"
                name="title"
                type="text"
                className="form-input"
                defaultValue={draftType === "content" ? "" : defaultSessionTitle}
                placeholder={draftType === "content" ? "Model unit walkthrough" : defaultSessionTitle}
              />
            </div>
            {draftType === "session" && (
              <>
                <div className="form-group">
                  <label htmlFor="prospectName" className="form-label">Prospect name</label>
                  <input id="prospectName" name="prospectName" type="text" className="form-input" placeholder="Leave blank for AI to infer" />
                  <span className="form-hint">Leave blank to infer from the recording.</span>
                </div>
                <div className="session-rubric-field">
                  <RubricSelector />
                </div>
                <label className="form-check-row agent-check-card">
                  <input name="uploaderIsAgent" type="checkbox" />
                  <span className="agent-check-avatar" aria-hidden="true">{profileInitials}</span>
                  <span>
                    <strong>I am the leasing agent</strong>
                    <small>Use my profile name for this session. Leave unchecked to let AI identify the agent from audio.</small>
                  </span>
                </label>
              </>
            )}
            {draftType === "session" ? (
              <div className="form-group session-notes-group">
                <input type="hidden" name="location" value={propertyLocation} />
                <div className="notes-label-row">
                  <label htmlFor="notes" className="form-label">Notes</label>
                  <div className="notes-location-pill" aria-label={`Location: ${propertyLocation}`}>
                    <span>Location</span>
                    <strong>{propertyLocation}</strong>
                  </div>
                </div>
                <div className="notes-field-shell">
                  <textarea
                    id="notes"
                    name="notes"
                    rows={3}
                    className="form-textarea notes-list-textarea notes-list-textarea--embedded"
                    placeholder="Add any context, follow-up details, or units mentioned."
                  />
                </div>
              </div>
            ) : (
              <>
                <div className="form-group">
                  <label htmlFor="location" className="form-label">Property or project</label>
                  <input
                    id="location"
                    name="location"
                    type="text"
                    className="form-input"
                    placeholder={propertyLocation}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="notes" className="form-label">Notes</label>
                  <textarea
                    id="notes"
                    name="notes"
                    rows={4}
                    className="form-textarea notes-list-textarea"
                    placeholder="Add any context about this asset."
                  />
                </div>
              </>
            )}

            {errorMsg && <p style={{ color: "var(--red-700)", fontSize: 13 }}>{errorMsg}</p>}

            {phase === "saving" && (
              <div className="single-upload-progress" aria-live="polite">
                <div className="single-upload-progress-header">
                  <span>{uploadStage ?? "Uploading"}</span>
                  <strong>{uploadProgress}%</strong>
                </div>
                <div className="upload-progress-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={uploadProgress}>
                  <span className="upload-progress-fill" style={{ width: `${uploadProgress}%` }} />
                </div>
              </div>
            )}

            <div className="session-details-actions">
              <button type="submit" className="btn btn-primary session-details-submit" disabled={phase === "saving"}>
                {phase === "saving" ? (
                  <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                    <Loader2 size={16} className="spin" /> Saving &amp; uploading...
                  </span>
                ) : (
                  draftType === "content" ? "Save to Library" : "Save & Process"
                )}
              </button>
            </div>
          </form>
          <input
            ref={addMoreInputRef}
            type="file"
            accept="video/*,audio/*"
            multiple
            style={{ display: "none" }}
            onChange={(e) => {
              const files = e.target.files;
              if (!files?.length) return;
              handleAddMoreSessions(files);
              e.target.value = "";
            }}
          />
        </div>
      </div>
    </>
  );
}

function bulkStatusLabel(status: BulkUploadStatus) {
  switch (status) {
    case "queued": return "Ready";
    case "creating": return "Creating session";
    case "uploading": return "Uploading";
    case "processing": return "Processing started";
    case "done": return "Processing started";
    case "error": return "Needs attention";
  }
}
