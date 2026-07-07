"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ClipboardList, Loader2 } from "lucide-react";

import type { Rubric } from "@tour/shared";
import { rubricItemCount, rubricTotalPoints } from "@tour/shared";

import { fetchCommunityRubrics } from "@/lib/client-rubrics-cache";

type RubricSelectorProps = {
  name?: string;
  value?: string | null;
  onChange?: (rubricId: string) => void;
  showManageLink?: boolean;
  compact?: boolean;
};

export function RubricSelector({
  name = "rubricId",
  value,
  onChange,
  showManageLink = true,
  compact = false,
}: RubricSelectorProps) {
  const [rubrics, setRubrics] = useState<Rubric[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(value ?? "");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const list = await fetchCommunityRubrics();
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
  }, [value, onChange]);

  async function handleChange(next: string) {
    setSelected(next);
    onChange?.(next);
  }

  const selectedRubric = rubrics.find((r) => r.id === selected);

  return (
    <div className={compact ? undefined : "form-group"}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <label htmlFor={name} className={compact ? undefined : "form-label"} style={{ marginBottom: compact ? 4 : 0, fontSize: compact ? 11 : undefined, fontWeight: compact ? 700 : undefined, color: compact ? "var(--slate-500)" : undefined, textTransform: compact ? "uppercase" as const : undefined, letterSpacing: compact ? "0.04em" : undefined }}>
          {!compact && (
            <ClipboardList size={14} style={{ display: "inline", marginRight: 4, verticalAlign: "-2px" }} />
          )}
          {compact ? "Rubric" : "Evaluation rubric"}
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
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: compact ? 12 : 13, color: "var(--slate-500)", padding: compact ? "6px 0" : "10px 0" }}>
          <Loader2 size={14} className="spin" /> Loading rubrics...
        </div>
      ) : error ? (
        <p style={{ color: "var(--red-700)", fontSize: compact ? 12 : 13 }}>{error}</p>
      ) : (
        <select
          id={name}
          name={name}
          className={compact ? undefined : "form-select"}
          style={compact ? {
            width: "100%",
            border: "1px solid var(--slate-200)",
            borderRadius: 10,
            background: "#fff",
            padding: "8px 10px",
            fontSize: 13,
            fontWeight: 600,
            color: "var(--slate-700)",
          } : undefined}
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

      {selectedRubric?.definition.notes && !compact && (
        <p style={{ fontSize: 12, color: "var(--slate-500)", marginTop: 6 }}>
          {selectedRubric.definition.notes}
        </p>
      )}
    </div>
  );
}
