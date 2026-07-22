"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Building2, Check, ChevronDown, ClipboardList, ListChecks, Loader2, Star, X } from "lucide-react";

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
  const [previewId, setPreviewId] = useState(value ?? "");
  const [open, setOpen] = useState(false);
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
          setPreviewId(value);
        } else if (list.length > 0) {
          const defaultRubric = list.find((r) => r.isDefault) ?? list[0]!;
          setSelected(defaultRubric.id);
          setPreviewId(defaultRubric.id);
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

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  async function handleChange(next: string) {
    setSelected(next);
    setPreviewId(next);
    onChange?.(next);
    setOpen(false);
  }

  const selectedRubric = rubrics.find((r) => r.id === selected);
  const previewRubric = rubrics.find((r) => r.id === previewId) ?? selectedRubric;
  const previewTotal = previewRubric ? rubricTotalPoints(previewRubric.definition) : 0;
  const previewItems = previewRubric ? rubricItemCount(previewRubric.definition) : 0;

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
        <div className="rubric-popover">
          <input type="hidden" name={name} value={selected} />
          <button
            type="button"
            className="rubric-popover-trigger"
            aria-expanded={open}
            onClick={() => {
              setPreviewId(selected);
              setOpen((current) => !current);
            }}
          >
            <span>
              <strong>{selectedRubric?.name ?? "Select rubric"}</strong>
              {selectedRubric ? (
                <small>{rubricTotalPoints(selectedRubric.definition)} pts · {rubricItemCount(selectedRubric.definition)} items</small>
              ) : null}
            </span>
            <ChevronDown size={16} />
          </button>
          {open ? (
            <div className="rubric-modal-backdrop" role="presentation" onMouseDown={() => setOpen(false)}>
              <div
                className="rubric-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby={`${name}-rubric-modal-title`}
                onMouseDown={(event) => event.stopPropagation()}
              >
                <div className="rubric-modal-list" aria-label="Rubrics">
                  {rubrics.map((rubric) => {
                    const isSelected = rubric.id === selected;
                    const isPhoneRubric = /phone|call/i.test(rubric.name);
                    return (
                      <button
                        key={rubric.id}
                        type="button"
                        className="rubric-modal-option"
                        aria-pressed={isSelected}
                        onFocus={() => setPreviewId(rubric.id)}
                        onMouseEnter={() => setPreviewId(rubric.id)}
                        onClick={() => void handleChange(rubric.id)}
                      >
                        <span className="rubric-option-icon" aria-hidden="true">
                          {isPhoneRubric ? <ClipboardList size={15} /> : <Building2 size={15} />}
                        </span>
                        <span>
                          <strong>{rubric.name}{rubric.isDefault ? " (default)" : ""}</strong>
                          <small>{rubricTotalPoints(rubric.definition)} pts · {rubricItemCount(rubric.definition)} items</small>
                        </span>
                        {isSelected ? <Check size={15} /> : null}
                      </button>
                    );
                  })}
                </div>
                {previewRubric ? (
                  <div className="rubric-modal-preview">
                    <button type="button" className="rubric-preview-close" aria-label="Close rubric picker" onClick={() => setOpen(false)}>
                      <X size={15} />
                    </button>
                    <div className="rubric-preview-heading">
                      <span className="rubric-preview-icon" aria-hidden="true">
                        <Building2 size={22} />
                      </span>
                      <div>
                        <strong id={`${name}-rubric-modal-title`}>{previewRubric.name}</strong>
                        <div className="rubric-preview-badges">
                          <span><Star size={13} /> {previewTotal} pts</span>
                          <span><ListChecks size={13} /> {previewItems} items</span>
                        </div>
                      </div>
                    </div>
                    <p className="rubric-preview-label">Section breakdown</p>
                    {previewRubric.definition.sections.map((section) => {
                      const sectionPoints = section.items.reduce((sum, item) => sum + item.points, 0);
                      const sectionPercent = previewTotal > 0 ? Math.max(4, Math.round((sectionPoints / previewTotal) * 100)) : 0;
                      return (
                        <div key={section.name} className="rubric-preview-section">
                          <span className="rubric-preview-section-icon" aria-hidden="true">
                            <ClipboardList size={14} />
                          </span>
                          <div className="rubric-preview-section-name">
                            <strong>{section.name}</strong>
                          </div>
                          <span className="rubric-preview-bar"><i style={{ width: `${sectionPercent}%` }} /></span>
                          <strong className="rubric-preview-points">{sectionPoints} pts</strong>
                          <span className="rubric-preview-count">{section.items.length} items</span>
                        </div>
                      );
                    })}
                    {previewRubric.definition.compliance?.length ? (
                      <div className="rubric-preview-section">
                        <span className="rubric-preview-section-icon" aria-hidden="true">
                          <ClipboardList size={14} />
                        </span>
                        <div className="rubric-preview-section-name">
                          <strong>Compliance flags</strong>
                        </div>
                        <span className="rubric-preview-bar"><i style={{ width: "8%" }} /></span>
                        <strong className="rubric-preview-points">flag only</strong>
                        <span className="rubric-preview-count">{previewRubric.definition.compliance.length} items</span>
                      </div>
                    ) : null}
                    <p className="rubric-preview-label">Full rubric questions</p>
                    <div className="rubric-full-questions">
                      {previewRubric.definition.sections.map((section) => (
                        <div key={section.name} className="rubric-question-section">
                          <strong>{section.name}</strong>
                          <ul>
                            {section.items.map((item) => (
                              <li key={item.id}>
                                <span>{item.text}</span>
                                <em>{item.points} pts</em>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                      {previewRubric.definition.compliance?.length ? (
                        <div className="rubric-question-section">
                          <strong>Compliance flags</strong>
                          <ul>
                            {previewRubric.definition.compliance.map((item) => (
                              <li key={item.id}>
                                <span>{item.text}</span>
                                <em>{item.points} pts</em>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
