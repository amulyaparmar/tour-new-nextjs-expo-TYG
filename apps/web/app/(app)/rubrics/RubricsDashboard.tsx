"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import {
  Plus, ChevronRight, Edit3, Trash2, ChevronDown, ChevronUp, CheckCircle2,
} from "lucide-react";

import type { Rubric } from "@tour/shared";
import { getAnalysisModel, rubricSessionTypeLabel } from "@tour/shared";

import { invalidateRubricsCache } from "@/lib/client-rubrics-cache";
import { RubricCreationFlow } from "./RubricCreationFlow";
import { mapRubricToDisplay, type DisplayRubric, type RubricStatus } from "./rubric-utils";
import "./rubric-admin-theme.css";

function StatusBadge({ status }: { status: RubricStatus }) {
  return status === "active"
    ? <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />Active</span>
    : <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200"><div className="w-1.5 h-1.5 rounded-full bg-amber-500" />Draft</span>;
}

type RubricView = "list" | "detail";

export function RubricsDashboard({
  rubrics,
  communityId,
  communityName,
  sessionCounts,
  selectedRubricId = null,
}: {
  rubrics: Rubric[];
  communityId: string;
  communityName: string;
  sessionCounts: Record<string, number>;
  selectedRubricId?: string | null;
}) {
  const router = useRouter();
  const properties = useMemo(() => [{ id: communityId, name: communityName }], [communityId, communityName]);
  const displayRubrics = useMemo(
    () => rubrics.map((rubric) => mapRubricToDisplay(rubric, communityId, sessionCounts[rubric.id] ?? 0)),
    [rubrics, communityId, sessionCounts]
  );

  const [showCreate, setShowCreate] = useState(false);
  const [editingRubric, setEditingRubric] = useState<DisplayRubric | null>(null);
  const [expandedCat, setExpandedCat] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [activatingId, setActivatingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [activateError, setActivateError] = useState<string | null>(null);

  const selectedRubric = useMemo(
    () => (selectedRubricId ? displayRubrics.find((rubric) => rubric.id === selectedRubricId) ?? null : null),
    [displayRubrics, selectedRubricId]
  );
  const rubricView: RubricView = selectedRubric ? "detail" : "list";

  useEffect(() => {
    setExpandedCat(null);
    setActivateError(null);
  }, [selectedRubricId]);

  const refresh = () => router.refresh();

  const openRubric = (rubricId: string) => {
    router.push(`/rubrics/${encodeURIComponent(rubricId)}`);
  };

  const activateRubric = async (rubric: DisplayRubric) => {
    if (rubric.isDefault || activatingId) return;

    setActivatingId(rubric.id);
    setActivateError(null);

    try {
      const response = await fetch(`/api/admin/rubrics/${rubric.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isDefault: true }),
      });
      const body = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Failed to activate rubric.");
      invalidateRubricsCache();
      refresh();
    } catch (caught) {
      setActivateError(caught instanceof Error ? caught.message : "Failed to activate rubric.");
    } finally {
      setActivatingId(null);
    }
  };

  const deleteRubric = async (rubric: DisplayRubric) => {
    if (rubric.isDefault) return;
    if (!confirm(`Delete "${rubric.name}"? Sessions using it will fall back to the default rubric.`)) return;

    setDeletingId(rubric.id);
    setDeleteError(null);

    try {
      const response = await fetch(`/api/admin/rubrics/${rubric.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const body = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Failed to delete rubric.");

      invalidateRubricsCache();
      if (selectedRubricId === rubric.id) {
        router.push("/rubrics");
      }

      refresh();
    } catch (caught) {
      setDeleteError(caught instanceof Error ? caught.message : "Failed to delete rubric.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="rubric-admin min-h-full bg-background pb-8">
      <AnimatePresence>
        {showCreate && (
          <RubricCreationFlow
            properties={properties}
            initialRubric={editingRubric}
            onClose={() => { setShowCreate(false); setEditingRubric(null); }}
            onSave={() => { setShowCreate(false); setEditingRubric(null); refresh(); }}
          />
        )}
      </AnimatePresence>

      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {rubricView === "list" ? (
          <>
            <div className="flex items-start justify-between gap-4 mb-6">
              <div>
                <h1 className="text-foreground" style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.025em" }}>Rubrics</h1>
                <p className="text-muted-foreground text-sm mt-1">Manage scoring rubrics for your leasing team. Upload a template and let AI do the extraction.</p>
              </div>
              <button
                type="button"
                onClick={() => { setEditingRubric(null); setShowCreate(true); }}
                className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-all shrink-0"
              >
                <Plus className="w-4 h-4" /> New rubric
              </button>
            </div>

            {deleteError && (
              <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{deleteError}</div>
            )}

            {displayRubrics.length === 0 ? (
              <div className="rounded-2xl border border-border bg-white px-6 py-16 text-center">
                <p className="text-sm font-semibold text-foreground">No rubrics yet</p>
                <p className="text-sm text-muted-foreground mt-1">Upload a template to extract scoring criteria with AI.</p>
                <button
                  type="button"
                  onClick={() => { setEditingRubric(null); setShowCreate(true); }}
                  className="mt-5 inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-all"
                >
                  <Plus className="w-4 h-4" /> Create your first rubric
                </button>
              </div>
            ) : (
              <div className="rounded-2xl border border-border overflow-hidden overflow-x-auto">
                <table className="w-full text-sm min-w-[760px]">
                  <thead>
                    <tr className="border-b border-border bg-secondary/50">
                      {["Name", "Version", "Properties", "Categories", "Sessions scored", "Status", "Last updated"].map((header) => (
                        <th key={header} className="text-left px-5 py-3 font-semibold text-xs text-muted-foreground uppercase tracking-wide">{header}</th>
                      ))}
                      <th className="px-5 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border bg-white">
                    {displayRubrics.map((rubric) => (
                      <tr
                        key={rubric.id}
                        onClick={() => openRubric(rubric.id)}
                        className="hover:bg-secondary/40 cursor-pointer transition-colors group"
                      >
                        <td className="px-5 py-4">
                          <div className="font-semibold text-foreground group-hover:text-primary transition-colors">{rubric.name}</div>
                        </td>
                        <td className="px-5 py-4 text-muted-foreground font-mono text-xs">{rubric.version}</td>
                        <td className="px-5 py-4 text-muted-foreground">{rubric.propertyIds.length} properties</td>
                        <td className="px-5 py-4 text-muted-foreground">{rubric.categories.length}</td>
                        <td className="px-5 py-4 text-muted-foreground">{rubric.sessionCount}</td>
                        <td className="px-5 py-4"><StatusBadge status={rubric.status} /></td>
                        <td className="px-5 py-4 text-muted-foreground text-xs">{rubric.lastUpdated}</td>
                        <td className="px-5 py-4">
                          <div className="flex items-center justify-end gap-1">
                            {!rubric.isDefault && (
                              <button
                                type="button"
                                aria-label={`Delete ${rubric.name}`}
                                disabled={deletingId === rubric.id}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void deleteRubric(rubric);
                                }}
                                className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                              >
                                {deletingId === rubric.id ? (
                                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-red-200 border-t-red-600" />
                                ) : (
                                  <Trash2 className="h-4 w-4" />
                                )}
                              </button>
                            )}
                            <ChevronRight className="w-4 h-4 text-muted-foreground/50 group-hover:text-primary transition-colors" />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : selectedRubric && (
          <>
            <div className="mb-6">
              <Link
                href="/rubrics"
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors w-fit"
              >
                <ChevronRight className="w-4 h-4 rotate-180" /> All rubrics
              </Link>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-3 mb-1">
                    <h1 className="text-foreground" style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.025em" }}>{selectedRubric.name}</h1>
                    <StatusBadge status={selectedRubric.status} />
                    <span className="text-xs text-muted-foreground font-mono">{selectedRubric.version}</span>
                  </div>
                  <p className="text-muted-foreground text-sm">
                    {selectedRubric.propertyIds.length} properties · {rubricSessionTypeLabel(selectedRubric.sessionType)} · {selectedRubric.categories.length} categories · {selectedRubric.sessionCount} sessions scored · {getAnalysisModel(selectedRubric.analysisModel).label}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0 flex-wrap justify-end">
                  {selectedRubric.status === "draft" && (
                    <button
                      type="button"
                      disabled={activatingId === selectedRubric.id}
                      onClick={() => void activateRubric(selectedRubric)}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-all disabled:opacity-40"
                    >
                      {activatingId === selectedRubric.id ? (
                        <><div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" /> Activating...</>
                      ) : (
                        <><CheckCircle2 className="w-3.5 h-3.5" /> Activate rubric</>
                      )}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => { setEditingRubric(selectedRubric); setShowCreate(true); }}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl border border-border text-sm font-medium text-foreground hover:bg-secondary transition-colors"
                  >
                    <Edit3 className="w-3.5 h-3.5" /> Edit
                  </button>
                  {!selectedRubric.isDefault && (
                    <button
                      type="button"
                      disabled={deletingId === selectedRubric.id}
                      onClick={() => void deleteRubric(selectedRubric)}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl border border-red-200 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40"
                    >
                      {deletingId === selectedRubric.id ? (
                        <><div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-red-200 border-t-red-600" /> Deleting...</>
                      ) : (
                        <><Trash2 className="w-3.5 h-3.5" /> Delete</>
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>

            {deleteError && (
              <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{deleteError}</div>
            )}
            {activateError && (
              <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{activateError}</div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-5">
              <div className="space-y-3">
                {selectedRubric.categories.map((category, i) => (
                  <div key={i} className="rounded-2xl border border-border bg-card overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setExpandedCat(expandedCat === i ? null : i)}
                      className="w-full flex items-center gap-4 px-5 py-4 hover:bg-secondary/50 transition-colors"
                    >
                      <div className="flex-1 text-left">
                        <div className="flex items-center gap-3">
                          <span className="font-semibold text-sm text-foreground">{category.name}</span>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-secondary text-muted-foreground border border-border font-medium">{category.weight} pts</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{category.description}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs text-muted-foreground">{category.criteria.length} items</span>
                        {expandedCat === i ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                      </div>
                    </button>
                    <AnimatePresence>
                      {expandedCat === i && (
                        <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
                          <div className="px-5 pb-4 border-t border-border pt-3">
                            <ul className="space-y-2">
                              {(category.items?.length ? category.items : category.criteria.map((criterion, j) => ({
                                id: `${category.name}-${j}`,
                                text: criterion,
                                points: 0,
                                note: undefined,
                              }))).map((item, j) => (
                                <li key={item.id || j} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                                  <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                                  <div className="flex-1">
                                    <div className="flex items-start justify-between gap-3">
                                      <span>{item.text}</span>
                                      {item.points > 0 && <span className="text-xs font-semibold text-foreground shrink-0">{item.points} pts</span>}
                                    </div>
                                    {item.note && <p className="text-xs text-muted-foreground/80 mt-1">{item.note}</p>}
                                  </div>
                                </li>
                              ))}
                            </ul>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ))}
              </div>

              <div className="space-y-4">
                <div className="rounded-2xl border border-border bg-card p-5">
                  <h4 className="font-semibold text-sm text-foreground mb-3">Assigned properties</h4>
                  <div className="space-y-2">
                    {properties.filter((property) => selectedRubric.propertyIds.includes(property.id)).map((property) => (
                      <div key={property.id} className="flex items-center gap-2 text-sm text-foreground">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />{property.name}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
