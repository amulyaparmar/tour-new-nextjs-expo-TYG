"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ClipboardList, Loader2 } from "lucide-react";

import type { Rubric } from "@tour/shared";
import { rubricItemCount, rubricTotalPoints } from "@tour/shared";

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
  const [rubrics, setRubrics] = useState<Rubric[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(value ?? "");
  const [error, setError] = useState<string | null>(null);

  const loadRubrics = useCallback(async () => {
    const res = await fetch("/api/admin/rubrics");
    if (!res.ok) throw new Error("Failed to load rubrics");
    const data = await res.json() as { rubrics: Rubric[] };
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

  async function handleChange(next: string) {
    setSelected(next);
    onChange?.(next);
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
          {showManageLink && (
            <Link href="/rubrics" style={{ fontSize: 12, fontWeight: 600, color: "var(--indigo-600)" }}>
              Create or manage rubrics
            </Link>
          )}
        </div>
      </div>

      {loading ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--slate-500)", padding: "10px 0" }}>
          <Loader2 size={14} className="spin" /> Loading rubrics...
        </div>
      ) : error ? (
        <p style={{ color: "var(--red-700)", fontSize: 13 }}>{error}</p>
      ) : (
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
              {rubricTotalPoints(rubric.definition)} pts · {rubricItemCount(rubric.definition)} items
            </option>
          ))}
        </select>
      )}

      {selectedRubric?.definition.notes && (
        <p style={{ fontSize: 12, color: "var(--slate-500)", marginTop: 6 }}>
          {selectedRubric.definition.notes}
        </p>
      )}
    </div>
  );
}
