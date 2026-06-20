"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ClipboardList, Loader2, Upload } from "lucide-react";

import type { RubricSummary } from "@tour/shared";

import { RubricUploadForm } from "./rubrics/RubricUploadForm";

type RubricSelectorProps = {
  name?: string;
  value?: string | null;
  onChange?: (rubricId: string) => void;
  showManageLink?: boolean;
};

export function RubricSelector({
  name = "rubricId",
  value,
  onChange,
  showManageLink = true
}: RubricSelectorProps) {
  const [rubrics, setRubrics] = useState<RubricSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(value ?? "");
  const [error, setError] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);

  const loadRubrics = useCallback(async () => {
    const res = await fetch("/api/rubrics");
    if (!res.ok) throw new Error("Failed to load rubrics");
    const data = await res.json() as { rubrics: RubricSummary[] };
    return data.rubrics ?? [];
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const list = await loadRubrics();
        if (cancelled) return;

        setRubrics(list);

        if (value) {
          setSelected(value);
        } else if (list.length > 0) {
          const defaultRubric = list.find((r) => r.isDefault) ?? list[0]!;
          setSelected(defaultRubric.id);
          onChange?.(defaultRubric.id);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load rubrics");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [value, onChange, loadRubrics]);

  function handleChange(next: string) {
    setSelected(next);
    onChange?.(next);
  }

  async function handleUploaded(rubric: { id: string }) {
    const list = await loadRubrics();
    setRubrics(list);
    setSelected(rubric.id);
    onChange?.(rubric.id);
    setShowUpload(false);
  }

  const selectedRubric = rubrics.find((r) => r.id === selected);

  return (
    <div className="form-group">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <label htmlFor={name} className="form-label" style={{ marginBottom: 0 }}>
          <ClipboardList size={14} style={{ display: "inline", marginRight: 4, verticalAlign: "-2px" }} />
          Evaluation rubric
        </label>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            style={{ padding: "4px 8px", fontSize: 12, fontWeight: 600, color: "var(--indigo-600)" }}
            onClick={() => setShowUpload((open) => !open)}
          >
            <Upload size={12} style={{ display: "inline", marginRight: 4, verticalAlign: "-2px" }} />
            {showUpload ? "Hide upload" : "Upload rubric"}
          </button>
          {showManageLink && (
            <Link href="/rubrics" style={{ fontSize: 12, fontWeight: 600, color: "var(--indigo-600)" }}>
              Manage all
            </Link>
          )}
        </div>
      </div>

      {showUpload && (
        <div style={{ marginTop: 10, padding: 12, border: "1px solid var(--slate-200)", borderRadius: "var(--radius-md)", background: "var(--slate-50)" }}>
          <RubricUploadForm compact onUploaded={handleUploaded} />
        </div>
      )}

      {loading ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--slate-500)", padding: "10px 0" }}>
          <Loader2 size={14} className="spin" /> Loading rubrics...
        </div>
      ) : error ? (
        <p style={{ color: "var(--red-700)", fontSize: 13 }}>{error}</p>
      ) : (
        <>
          <select
            id={name}
            name={name}
            className="form-select"
            value={selected}
            onChange={(e) => handleChange(e.target.value)}
            required
          >
            {rubrics.map((rubric) => (
              <option key={rubric.id} value={rubric.id}>
                {rubric.name}
                {rubric.isDefault ? " (default)" : ""}
                {" — "}
                {rubric.totalPoints} pts · {rubric.questionCount} questions
              </option>
            ))}
          </select>
          {selectedRubric?.description && (
            <p style={{ fontSize: 12, color: "var(--slate-500)", marginTop: 6 }}>
              {selectedRubric.description}
            </p>
          )}
        </>
      )}
    </div>
  );
}
