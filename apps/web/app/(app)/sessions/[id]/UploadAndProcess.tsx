"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Step = "idle" | "uploading" | "uploaded" | "transcribing" | "extracting_screenshots" | "analyzing" | "done" | "error";

const STEP_LABELS: Record<Step, string> = {
  idle: "Ready to upload",
  uploading: "Uploading recording…",
  uploaded: "Upload complete",
  transcribing: "Transcribing audio…",
  extracting_screenshots: "Extracting screenshots…",
  analyzing: "Running AI analysis…",
  done: "Analysis complete!",
  error: "Something went wrong"
};

export function UploadAndProcess({ sessionId, hasRecording }: { sessionId: string; hasRecording: boolean }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>("idle");
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleFile(file: File) {
    setStep("uploading");
    setProgress(0);
    setErrorMsg(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const xhr = new XMLHttpRequest();
      xhr.open("POST", `/api/sessions/${sessionId}/upload`);

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          setProgress(Math.round((e.loaded / e.total) * 100));
        }
      };

      await new Promise<void>((resolve, reject) => {
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            reject(new Error("Upload failed"));
          }
        };
        xhr.onerror = () => reject(new Error("Network error"));
        xhr.send(formData);
      });

      setStep("uploaded");
      setProgress(100);

      // Start processing pipeline
      setStep("transcribing");
      const processRes = await fetch(`/api/sessions/${sessionId}/process`, {
        method: "POST"
      });

      if (!processRes.ok) {
        const body = await processRes.json().catch(() => null) as { error?: string } | null;
        throw new Error(body?.error ?? "Processing failed");
      }

      setStep("done");
      router.refresh();
    } catch (err) {
      setStep("error");
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  if (step === "idle" && !hasRecording) {
    return (
      <div className="card">
        <div className="card-header"><h2>Upload Recording</h2></div>
        <div className="card-body">
          <input
            ref={inputRef}
            type="file"
            accept="video/*,audio/*"
            style={{ display: "none" }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
          <div
            className="upload-zone"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const file = e.dataTransfer.files[0];
              if (file) handleFile(file);
            }}
          >
            <div className="upload-zone-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="48" height="48">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            </div>
            <div className="upload-zone-text">Tap to upload or drag file here</div>
            <div className="upload-zone-sub">Video or audio · MP4, WebM, M4A, WAV, MP3</div>
          </div>
        </div>
      </div>
    );
  }

  if (step === "idle" && hasRecording) {
    return (
      <div className="card">
        <div className="card-header"><h2>Recording</h2></div>
        <div className="card-body" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <span className="badge badge-reviewed">Recording uploaded</span>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={async () => {
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
            }}
          >
            Re-process
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-header"><h2>Processing</h2></div>
      <div className="card-body">
        <div className="process-steps">
          <ProcessStep label="Upload recording" status={step === "uploading" ? "active" : progress >= 100 ? "done" : "pending"} />
          <ProcessStep label="Transcribe audio" status={step === "transcribing" ? "active" : ["extracting_screenshots", "analyzing", "done"].includes(step) ? "done" : step === "error" ? "failed" : "pending"} />
          <ProcessStep label="Extract screenshots" status={step === "extracting_screenshots" ? "active" : ["analyzing", "done"].includes(step) ? "done" : "pending"} />
          <ProcessStep label="Run AI analysis" status={step === "analyzing" ? "active" : step === "done" ? "done" : "pending"} />
          <ProcessStep label="Generate follow-up actions" status={step === "done" ? "done" : "pending"} />
        </div>

        {step === "uploading" && (
          <div className="upload-progress-bar" style={{ marginTop: 12 }}>
            <div className="upload-progress-fill" style={{ width: `${progress}%` }} />
          </div>
        )}

        {step === "done" && (
          <p style={{ marginTop: 12, fontSize: 13, color: "var(--green-600)", fontWeight: 600 }}>
            Analysis complete! Refresh to see results.
          </p>
        )}

        {step === "error" && (
          <div style={{ marginTop: 12 }}>
            <p className="error-text">{errorMsg}</p>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              style={{ marginTop: 8 }}
              onClick={() => setStep("idle")}
            >
              Try again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ProcessStep({ label, status }: { label: string; status: "pending" | "active" | "done" | "failed" }) {
  return (
    <div className="process-step" data-status={status}>
      <span className="process-step-icon">
        {status === "done" && "✓"}
        {status === "active" && (
          <svg viewBox="0 0 20 20" width="20" height="20">
            <circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="32" strokeDashoffset="8">
              <animateTransform attributeName="transform" type="rotate" from="0 10 10" to="360 10 10" dur="1s" repeatCount="indefinite" />
            </circle>
          </svg>
        )}
        {status === "pending" && "○"}
        {status === "failed" && "✗"}
      </span>
      <span>{label}</span>
    </div>
  );
}
