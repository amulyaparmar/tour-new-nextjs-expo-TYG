"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Loader2, Upload } from "lucide-react";

import type { Rubric } from "@tour/shared";

import { uploadFileWithPresign } from "@/lib/client-upload";
import { invalidateRubricsCache } from "@/lib/client-rubrics-cache";

type RubricUploadFormProps = {
  compact?: boolean;
  onUploaded?: (rubric: Rubric) => void;
};

export function RubricUploadForm({ compact = false, onUploaded }: RubricUploadFormProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileLabel, setFileLabel] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const file = inputRef.current?.files?.[0];
    if (!file) {
      setError("Choose a rubric template file to upload.");
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const body = await uploadFileWithPresign<{ rubric?: Rubric }>({
        presignUrl: "/api/rubrics/upload/presign",
        completeUrl: "/api/rubrics/upload/complete",
        file,
        contentType: file.type || "application/octet-stream",
        presignBody: {
          fileName: file.name,
          contentType: file.type || "application/octet-stream",
        },
        completeBody: () => ({
          fileName: file.name,
          ...(name.trim() ? { name: name.trim() } : {}),
        }),
      });

      setName("");
      setFileLabel(null);
      if (inputRef.current) inputRef.current.value = "";

      if (body?.rubric) {
        onUploaded?.(body.rubric);
      }
      invalidateRubricsCache();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="form-grid">
      {!compact && (
        <div className="form-group">
          <label htmlFor="rubricName" className="form-label">Name (optional)</label>
          <input
            id="rubricName"
            type="text"
            className="form-input"
            placeholder="Auto-detected from template"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
      )}
      <div className="form-group">
        <label htmlFor="rubricFile" className="form-label">
          {compact ? "Rubric template file" : "Template file"}
        </label>
        <input
          ref={inputRef}
          id="rubricFile"
          type="file"
          className="form-input"
          accept=".pdf,.txt,.md,.csv,.json,text/*,application/pdf"
          onChange={(e) => setFileLabel(e.target.files?.[0]?.name ?? null)}
        />
        <p style={{ fontSize: 12, color: "var(--slate-500)", marginTop: 6 }}>
          PDF, TXT, MD, CSV, or JSON — AI extracts sections and point values.
          {fileLabel ? ` Selected: ${fileLabel}` : ""}
        </p>
      </div>

      {error && <p style={{ color: "var(--red-700)", fontSize: 13 }}>{error}</p>}

      <button type="submit" className={compact ? "btn btn-outline" : "btn btn-primary"} disabled={uploading}>
        {uploading ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <Loader2 size={16} className="spin" /> Extracting rubric...
          </span>
        ) : (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <Upload size={16} /> Upload &amp; Extract
          </span>
        )}
      </button>
    </form>
  );
}
