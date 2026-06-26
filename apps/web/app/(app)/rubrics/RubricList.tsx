"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Trash2 } from "lucide-react";

import type { Rubric } from "@tour/shared";
import { rubricItemCount, rubricTotalPoints } from "@tour/shared";

export function RubricList({ rubrics }: { rubrics: Rubric[] }) {
  const router = useRouter();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete(rubricId: string) {
    if (!confirm("Delete this rubric? Sessions using it will fall back to the default rubric.")) return;

    setDeletingId(rubricId);
    setError(null);

    try {
      const res = await fetch(`/api/rubrics/${rubricId}`, { method: "DELETE" });
      const body = await res.json().catch(() => null) as { error?: string } | null;
      if (!res.ok) throw new Error(body?.error ?? "Delete failed");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeletingId(null);
    }
  }

  if (rubrics.length === 0) {
    return <div className="empty-state">No rubrics yet. Upload a template above.</div>;
  }

  return (
    <>
      {error && <p style={{ color: "var(--red-700)", fontSize: 13, marginBottom: 12 }}>{error}</p>}
      <div className="materials-grid">
        {rubrics.map((rubric) => (
          <div key={rubric.id} className="material-card" style={{ cursor: "default" }}>
            <div className="material-card-icon rubric">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
                <rect x="9" y="3" width="6" height="4" rx="1" />
                <line x1="9" y1="12" x2="15" y2="12" />
                <line x1="9" y1="16" x2="13" y2="16" />
              </svg>
            </div>
            <div className="material-card-info" style={{ flex: 1 }}>
              <div className="material-card-name">
                {rubric.name}
                {rubric.isDefault && (
                  <span style={{ marginLeft: 6, fontSize: 11, color: "var(--indigo-600)", fontWeight: 700 }}>
                    Default
                  </span>
                )}
              </div>
              <div className="material-card-meta">
                {rubricTotalPoints(rubric.definition)} pts · {rubric.definition.sections.length} sections · {rubricItemCount(rubric.definition)} items
              </div>
            </div>
            {!rubric.isDefault && (
              <button
                type="button"
                className="btn btn-ghost"
                aria-label={`Delete ${rubric.name}`}
                disabled={deletingId === rubric.id}
                onClick={() => void handleDelete(rubric.id)}
                style={{ alignSelf: "flex-start", padding: 8 }}
              >
                <Trash2 size={16} />
              </button>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
