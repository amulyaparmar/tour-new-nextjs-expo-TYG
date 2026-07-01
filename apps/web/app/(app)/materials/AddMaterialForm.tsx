"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import Link from "next/link";
import { Loader2, Upload } from "lucide-react";

type MaterialType = "training" | "other";

export function AddMaterialForm() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [type, setType] = useState<MaterialType>("training");
  const [description, setDescription] = useState("");
  const [fileLabel, setFileLabel] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const file = inputRef.current?.files?.[0];

    setSaving(true);
    setError(null);

    try {
      if (file) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("name", name.trim() || file.name);
        formData.append("type", type);
        formData.append("description", description.trim());

        const res = await fetch("/api/materials/upload", { method: "POST", body: formData });
        const body = await res.json().catch(() => null) as { error?: string } | null;
        if (!res.ok) throw new Error(body?.error ?? "Upload failed");
      } else {
        if (!name.trim()) {
          setError("Name is required.");
          setSaving(false);
          return;
        }

        const res = await fetch("/api/materials", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            type,
            description: description.trim()
          })
        });
        const body = await res.json().catch(() => null) as { error?: string } | null;
        if (!res.ok) throw new Error(body?.error ?? "Failed to create material");
      }

      setName("");
      setDescription("");
      setFileLabel(null);
      if (inputRef.current) inputRef.current.value = "";
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="form-grid">
      <div className="form-group">
        <label htmlFor="materialType" className="form-label">Type</label>
        <select
          id="materialType"
          className="form-select"
          value={type}
          onChange={(e) => setType(e.target.value as MaterialType)}
        >
          <option value="training">Training</option>
          <option value="other">Other</option>
        </select>
        <p style={{ fontSize: 12, color: "var(--slate-500)", marginTop: 6 }}>
          Evaluation rubrics live separately — <Link href="/rubrics">upload a rubric template</Link>.
        </p>
      </div>

      <div className="form-group">
        <label htmlFor="materialName" className="form-label">Name</label>
        <input
          id="materialName"
          type="text"
          className="form-input"
          placeholder="Closing Playbook"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div className="form-group">
        <label htmlFor="materialFile" className="form-label">
          File upload <span style={{ fontWeight: 500, color: "var(--slate-400)" }}>(optional)</span>
        </label>
        <input
          ref={inputRef}
          id="materialFile"
          type="file"
          className="form-input"
          accept="video/*,audio/*,image/*,application/pdf,.pdf,.txt,.md"
          onChange={(e) => setFileLabel(e.target.files?.[0]?.name ?? null)}
        />
        <p style={{ fontSize: 12, color: "var(--slate-500)", marginTop: 6 }}>
          Video, audio, images, PDF, or documents.
          {fileLabel ? ` Selected: ${fileLabel}` : ""}
        </p>
      </div>

      <div className="form-group">
        <label htmlFor="materialDescription" className="form-label">Description</label>
        <textarea
          id="materialDescription"
          rows={3}
          className="form-textarea"
          placeholder="What this material covers..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      {error && <p style={{ color: "var(--red-700)", fontSize: 13 }}>{error}</p>}

      <button type="submit" className="btn btn-primary" disabled={saving}>
        {saving ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <Loader2 size={16} className="spin" /> Saving...
          </span>
        ) : (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <Upload size={16} /> Add Material
          </span>
        )}
      </button>
    </form>
  );
}
