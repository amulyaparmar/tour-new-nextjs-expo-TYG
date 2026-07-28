"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import {
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Copy,
  Edit3,
  Eye,
  MoreHorizontal,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";

import type { Rubric } from "@tour/shared";
import {
  getAnalysisModel,
  getTranscribeProvider,
  rubricItemCount,
  rubricSessionTypeLabel,
} from "@tour/shared";

import { invalidateRubricsCache } from "@/lib/client-rubrics-cache";
import { RubricCreationFlow } from "./RubricCreationFlow";
import { RubricPreviewPanel } from "../RubricPreviewPanel";
import { mapRubricToDisplay, type DisplayRubric } from "./rubric-utils";
import "./rubric-admin-theme.css";

function DefaultBadge() {
  return (
    <span className="rubric-default-badge">
      <span aria-hidden="true" />
      Default
    </span>
  );
}

type RubricView = "list" | "detail";
type RubricSort = "updated" | "name" | "sessions" | "criteria";
const RUBRICS_PER_PAGE = 10;

export function RubricsDashboard({
  rubrics,
  templates,
  communityId,
  communityName,
  sessionCounts,
  canChangeTranscribeProvider,
  selectedRubricId = null,
}: {
  rubrics: Rubric[];
  templates: Rubric[];
  communityId: string;
  communityName: string;
  sessionCounts: Record<string, number>;
  canChangeTranscribeProvider: boolean;
  selectedRubricId?: string | null;
}) {
  const router = useRouter();
  const properties = useMemo(() => [{ id: communityId, name: communityName }], [communityId, communityName]);
  const displayRubrics = useMemo(
    () => rubrics.map((rubric) => mapRubricToDisplay(rubric, communityId, sessionCounts[rubric.id] ?? 0)),
    [rubrics, communityId, sessionCounts]
  );

  const [showCreate, setShowCreate] = useState(false);
  const [showTemplateLibrary, setShowTemplateLibrary] = useState(false);
  const [showTemplatePreview, setShowTemplatePreview] = useState(false);
  const [previewTemplateId, setPreviewTemplateId] = useState(templates[0]?.id ?? "");
  const [editingRubric, setEditingRubric] = useState<DisplayRubric | null>(null);
  const [expandedCat, setExpandedCat] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [makingDefaultId, setMakingDefaultId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [defaultError, setDefaultError] = useState<string | null>(null);
  const [cloningId, setCloningId] = useState<string | null>(null);
  const [cloneError, setCloneError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<RubricSort>("updated");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);
  const [selectedMenuOpen, setSelectedMenuOpen] = useState(false);
  const [actionMenuOpenId, setActionMenuOpenId] = useState<string | null>(null);
  const selectedMenuRef = useRef<HTMLDivElement>(null);
  const actionMenuRef = useRef<HTMLDivElement>(null);
  const templateDialogRef = useRef<HTMLElement>(null);
  const templateTriggerRef = useRef<HTMLButtonElement>(null);
  const selectionAnchorIdRef = useRef<string | null>(null);

  const selectedRubric = useMemo(
    () => (selectedRubricId ? displayRubrics.find((rubric) => rubric.id === selectedRubricId) ?? null : null),
    [displayRubrics, selectedRubricId]
  );
  const rubricView: RubricView = selectedRubric ? "detail" : "list";
  const visibleRubrics = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return displayRubrics
      .filter((rubric) => {
        if (!normalizedQuery) return true;
        return [
          rubric.name,
          rubricSessionTypeLabel(rubric.sessionType),
          ...rubric.categories.map((category) => category.name),
        ].some((value) => value.toLocaleLowerCase().includes(normalizedQuery));
      })
      .sort((left, right) => {
        if (left.isDefault !== right.isDefault) return left.isDefault ? -1 : 1;
        if (sortBy === "name") return left.name.localeCompare(right.name);
        if (sortBy === "sessions") return right.sessionCount - left.sessionCount || left.name.localeCompare(right.name);
        if (sortBy === "criteria") {
          return rubricItemCount(right.definition) - rubricItemCount(left.definition) || left.name.localeCompare(right.name);
        }
        return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
      });
  }, [displayRubrics, query, sortBy]);
  const addedTemplateIds = useMemo(
    () => {
      const existingNames = new Set(
        displayRubrics.map((rubric) => rubric.name.trim().toLocaleLowerCase())
      );
      const existingSourceIds = new Set(displayRubrics.flatMap((rubric) => (
        rubric.templateSourceId ? [rubric.templateSourceId] : []
      )));
      return new Set(templates.flatMap((template) => (
        existingSourceIds.has(template.id)
        || existingNames.has(template.name.trim().toLocaleLowerCase())
          ? [template.id]
          : []
      )));
    },
    [displayRubrics, templates],
  );
  const previewTemplate = templates.find((template) => template.id === previewTemplateId) ?? templates[0] ?? null;
  const totalPages = Math.max(1, Math.ceil(visibleRubrics.length / RUBRICS_PER_PAGE));
  const pageStart = (currentPage - 1) * RUBRICS_PER_PAGE;
  const pageEnd = Math.min(pageStart + RUBRICS_PER_PAGE, visibleRubrics.length);
  const paginatedRubrics = visibleRubrics.slice(pageStart, pageEnd);
  const selectableVisibleIds = useMemo(
    () => paginatedRubrics.filter((rubric) => !rubric.isDefault).map((rubric) => rubric.id),
    [paginatedRubrics],
  );

  useEffect(() => {
    setExpandedCat(null);
    setDefaultError(null);
  }, [selectedRubricId]);

  useEffect(() => {
    setCurrentPage(1);
  }, [query, sortBy]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  useEffect(() => {
    if (!showTemplateLibrary) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    templateDialogRef.current?.focus();

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (showTemplatePreview) {
          setShowTemplatePreview(false);
        } else {
          setShowTemplateLibrary(false);
        }
      }
    };
    window.addEventListener("keydown", closeOnEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
      templateTriggerRef.current?.focus();
    };
  }, [showTemplateLibrary, showTemplatePreview]);

  useEffect(() => {
    const availableIds = new Set(displayRubrics.filter((rubric) => !rubric.isDefault).map((rubric) => rubric.id));
    setSelectedIds((current) => {
      const next = new Set([...current].filter((id) => availableIds.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [displayRubrics]);

  useEffect(() => {
    if (!selectedMenuOpen) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!selectedMenuRef.current?.contains(event.target as Node)) {
        setSelectedMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, [selectedMenuOpen]);

  useEffect(() => {
    if (!actionMenuOpenId) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!actionMenuRef.current?.contains(event.target as Node)) {
        setActionMenuOpenId(null);
      }
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, [actionMenuOpenId]);

  const refresh = () => router.refresh();

  const makeDefaultRubric = async (rubric: DisplayRubric) => {
    if (rubric.isDefault || makingDefaultId) return;

    setMakingDefaultId(rubric.id);
    setDefaultError(null);

    try {
      const response = await fetch(`/api/admin/rubrics/${rubric.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isDefault: true }),
      });
      const body = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Failed to make this rubric the default.");
      invalidateRubricsCache();
      refresh();
    } catch (caught) {
      setDefaultError(caught instanceof Error ? caught.message : "Failed to make this rubric the default.");
    } finally {
      setMakingDefaultId(null);
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

  const cloneTemplate = async (template: Rubric) => {
    if (cloningId) return;
    setCloningId(template.id);
    setCloneError(null);
    try {
      const response = await fetch(`/api/admin/rubrics/${template.id}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const body = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Failed to add template.");
      invalidateRubricsCache();
      setShowTemplatePreview(false);
      setShowTemplateLibrary(false);
      refresh();
    } catch (caught) {
      setCloneError(caught instanceof Error ? caught.message : "Failed to add template.");
    } finally {
      setCloningId(null);
    }
  };

  const toggleRubricSelection = (rubricId: string, selectRange = false) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      const anchorId = selectionAnchorIdRef.current;
      if (selectRange && anchorId) {
        const anchorIndex = selectableVisibleIds.indexOf(anchorId);
        const targetIndex = selectableVisibleIds.indexOf(rubricId);
        if (anchorIndex >= 0 && targetIndex >= 0) {
          const [start, end] = anchorIndex < targetIndex
            ? [anchorIndex, targetIndex]
            : [targetIndex, anchorIndex];
          selectableVisibleIds.slice(start, end + 1).forEach((id) => next.add(id));
          return next;
        }
      }
      if (next.has(rubricId)) next.delete(rubricId);
      else next.add(rubricId);
      return next;
    });
    selectionAnchorIdRef.current = rubricId;
    setBulkMessage(null);
  };

  const deleteSelectedRubrics = async () => {
    if (bulkDeleting) return;
    const targets = displayRubrics.filter((rubric) => selectedIds.has(rubric.id) && !rubric.isDefault);
    if (targets.length === 0) return;
    if (!confirm(`Delete ${targets.length} selected rubric${targets.length === 1 ? "" : "s"}? Sessions using them will fall back to the default rubric.`)) return;

    setBulkDeleting(true);
    setBulkMessage(null);
    setDeleteError(null);
    const results = await Promise.allSettled(targets.map(async (rubric) => {
      const response = await fetch(`/api/admin/rubrics/${rubric.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const body = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? `Failed to delete ${rubric.name}.`);
      return rubric.id;
    }));

    const deletedIds = results.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
    const failures = results.filter((result) => result.status === "rejected");
    setSelectedIds((current) => {
      const next = new Set(current);
      deletedIds.forEach((id) => next.delete(id));
      return next;
    });
    if (deletedIds.length > 0) {
      invalidateRubricsCache();
      refresh();
    }
    if (failures.length > 0) {
      setDeleteError(`${failures.length} rubric${failures.length === 1 ? "" : "s"} could not be deleted. Your remaining selection was preserved.`);
    } else {
      setBulkMessage(`Deleted ${deletedIds.length} rubric${deletedIds.length === 1 ? "" : "s"}.`);
      setSelectedMenuOpen(false);
    }
    setBulkDeleting(false);
  };

  const inlineTemplateCards = (
    <div className="rubric-template-strip">
      {templates.map((template) => {
        const isAdded = addedTemplateIds.has(template.id);
        return (
        <motion.div key={template.id} layout className="rubric-template-card">
          <div className="rubric-template-card-main">
            <div className="rubric-template-icon"><Copy className="h-3.5 w-3.5" /></div>
            <div className="rubric-template-card-copy">
              <h3>{template.name}</h3>
              <p>{template.definition.sections.length} sections · {rubricItemCount(template.definition)} criteria</p>
            </div>
          </div>
          <div className="rubric-template-card-actions">
            <button
              type="button"
              aria-label={`Preview ${template.name}`}
              title={`Preview ${template.name}`}
              onClick={() => {
                setPreviewTemplateId(template.id);
                setCloneError(null);
                setShowTemplateLibrary(true);
                setShowTemplatePreview(true);
              }}
              className="rubric-template-preview-button"
            >
              <Eye aria-hidden="true" className="h-4 w-4" />
            </button>
            {isAdded ? (
              <button
                type="button"
                disabled
                aria-label={`${template.name} is already added`}
                title={`${template.name} is already added`}
                className="rubric-template-added"
              >
                <Check aria-hidden="true" className="h-4 w-4" />
              </button>
            ) : (
              <button
                type="button"
                aria-label={`Add ${template.name}`}
                title={`Add ${template.name}`}
                disabled={Boolean(cloningId)}
                onClick={() => void cloneTemplate(template)}
                className="rubric-template-add"
              >
                {cloningId === template.id
                  ? <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
                  : <Plus className="h-3.5 w-3.5" />}
              </button>
            )}
          </div>
        </motion.div>
      )})}
    </div>
  );

  return (
    <div className="rubric-admin min-h-full bg-background pb-8">
      <AnimatePresence>
        {showCreate && (
          <RubricCreationFlow
            properties={properties}
            initialRubric={editingRubric}
            makeDefaultOnCreate={!displayRubrics.some((rubric) => rubric.isDefault)}
            canChangeTranscribeProvider={canChangeTranscribeProvider}
            onClose={() => { setShowCreate(false); setEditingRubric(null); }}
            onSave={() => { setShowCreate(false); setEditingRubric(null); refresh(); }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showTemplateLibrary && (
          <motion.div
            className="rubric-template-modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onMouseDown={(event) => {
              if (event.target === event.currentTarget && !cloningId) {
                setShowTemplatePreview(false);
                setShowTemplateLibrary(false);
              }
            }}
          >
            <motion.section
              ref={templateDialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="template-modal-title"
              aria-describedby="template-modal-description"
              tabIndex={-1}
              className="rubric-template-modal"
              initial={{ opacity: 0, y: 14, scale: 0.985 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.985 }}
            >
              <header className="rubric-template-modal-header">
                {showTemplatePreview && previewTemplate ? (
                  <div className="rubric-template-preview-header-copy">
                    <button
                      type="button"
                      onClick={() => setShowTemplatePreview(false)}
                      className="rubric-template-back"
                    >
                      <ChevronLeft aria-hidden="true" className="h-4 w-4" />
                      Back to templates
                    </button>
                    <p className="rubric-template-modal-eyebrow">Template preview</p>
                    <h2 id="template-modal-title">Rubric preview</h2>
                    <p id="template-modal-description">
                      Review the complete scoring structure before adding it to {communityName}.
                    </p>
                  </div>
                ) : (
                  <div>
                    <p className="rubric-template-modal-eyebrow">Starter library</p>
                    <h2 id="template-modal-title">Browse rubric templates</h2>
                    <p id="template-modal-description">
                      Choose a starting point for {communityName}. It becomes an editable rubric immediately.
                    </p>
                  </div>
                )}
                <button
                  type="button"
                  aria-label="Close template library"
                  disabled={Boolean(cloningId)}
                  onClick={() => {
                    setShowTemplatePreview(false);
                    setShowTemplateLibrary(false);
                  }}
                  className="rubric-template-modal-close"
                >
                  <X aria-hidden="true" className="h-4 w-4" />
                </button>
              </header>
              <div
                key={showTemplatePreview ? `preview-${previewTemplate?.id ?? "template"}` : "library"}
                className={showTemplatePreview
                  ? "rubric-template-modal-body rubric-template-modal-body-preview"
                  : "rubric-template-modal-body"
                }
              >
                {showTemplatePreview && previewTemplate ? (
                  <RubricPreviewPanel
                    rubric={previewTemplate}
                    footer={addedTemplateIds.has(previewTemplate.id) ? (
                      <span className="rubric-template-preview-added">
                        <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
                        Already added to {communityName}
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={Boolean(cloningId)}
                        onClick={() => void cloneTemplate(previewTemplate)}
                        className="rubric-template-preview-add"
                      >
                        {cloningId === previewTemplate.id
                          ? <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                          : <Plus aria-hidden="true" className="h-4 w-4" />}
                        {cloningId === previewTemplate.id ? "Adding template…" : "Add this template"}
                      </button>
                    )}
                  />
                ) : inlineTemplateCards}
                {cloneError ? (
                  <div role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {cloneError}
                  </div>
                ) : null}
              </div>
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {rubricView === "list" ? (
          <>
            <div className="flex items-start justify-between gap-4 mb-6">
              <div>
                <h1 className="text-foreground" style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.025em" }}>Rubrics</h1>
                <p className="text-muted-foreground text-sm mt-1">Create, edit, organize, and choose the default scoring rubric for your leasing team.</p>
              </div>
              <div className="rubric-page-actions">
                {displayRubrics.length >= 3 && templates.length > 0 && (
                  <button
                    ref={templateTriggerRef}
                    type="button"
                    onClick={() => {
                      setPreviewTemplateId((current) => current || templates[0]?.id || "");
                      setShowTemplatePreview(false);
                      setCloneError(null);
                      setShowTemplateLibrary(true);
                    }}
                    className="rubric-template-trigger"
                  >
                    <Copy aria-hidden="true" className="h-4 w-4" />
                    Browse templates
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => { setEditingRubric(null); setShowCreate(true); }}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-all shrink-0"
                >
                  <Plus className="w-4 h-4" /> New rubric
                </button>
              </div>
            </div>

            {displayRubrics.length < 3 && templates.length > 0 && (
              <section className="rubric-template-library" aria-labelledby="template-library-title">
                <div className="rubric-template-header">
                  <div>
                    <h2 id="template-library-title" className="rubric-template-title">Template library</h2>
                    <p className="rubric-template-copy">Starter rubrics. Add one to create an editable copy for {communityName}.</p>
                  </div>
                  <span className="rubric-template-count">{templates.length} templates</span>
                </div>
                {inlineTemplateCards}
              </section>
            )}

            {cloneError && (
              <div role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{cloneError}</div>
            )}

            {deleteError && (
              <div role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{deleteError}</div>
            )}
            <p className="sr-only" aria-live="polite">{bulkMessage}</p>

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
              <div className="space-y-3">
                <section aria-label="Rubric filters" className="sl-toolbar rubric-list-toolbar">
                  <div className="sl-search rubric-list-search">
                    <Search aria-hidden="true" className="h-4 w-4" />
                    <label className="min-w-0 flex-1">
                      <span className="sr-only">Search rubrics</span>
                      <input
                        type="search"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Search by name, type, or category"
                      />
                    </label>
                    {query && (
                      <button
                        type="button"
                        aria-label="Clear search"
                        onClick={() => setQuery("")}
                        className="sl-search-clear"
                      >
                        <X aria-hidden="true" className="h-4 w-4" />
                      </button>
                    )}
                  </div>

                  <div className="sl-toolbar-row">
                    <div className="sl-filter-controls">
                      {selectedIds.size > 0 && (
                        <div className="sl-selected-menu-wrap" ref={selectedMenuRef}>
                          <button
                            type="button"
                            className="sl-selected-button"
                            aria-haspopup="menu"
                            aria-expanded={selectedMenuOpen}
                            onClick={() => setSelectedMenuOpen((open) => !open)}
                          >
                            <span>{selectedIds.size} selected</span>
                            <ChevronDown size={12} aria-hidden="true" />
                          </button>
                          {selectedMenuOpen && (
                            <div className="sl-selected-menu" role="menu">
                              <div className="sl-selected-menu-heading">
                                {selectedIds.size} rubric{selectedIds.size === 1 ? "" : "s"}
                              </div>
                              <button
                                type="button"
                                role="menuitem"
                                className="sl-selected-delete"
                                disabled={bulkDeleting}
                                onClick={() => void deleteSelectedRubrics()}
                              >
                                <Trash2 size={14} aria-hidden="true" />
                                {bulkDeleting ? "Deleting…" : "Delete rubrics"}
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                      <select
                        id="rubric-sort"
                        value={sortBy}
                        onChange={(event) => setSortBy(event.target.value as RubricSort)}
                        className="sl-sort-select"
                        aria-label="Sort rubrics"
                      >
                        <option value="updated">Newest first</option>
                        <option value="name">Name A–Z</option>
                        <option value="sessions">Most sessions</option>
                        <option value="criteria">Most criteria</option>
                      </select>
                    </div>
                  </div>
                </section>

                {visibleRubrics.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border bg-white px-6 py-12 text-center">
                    <p className="text-sm font-semibold text-foreground">No matching rubrics</p>
                    <p className="mt-1 text-sm text-muted-foreground">Try clearing the search.</p>
                    <button
                      type="button"
                      onClick={() => setQuery("")}
                      className="mt-4 rounded-xl border border-border px-3 py-2 text-sm font-semibold text-foreground transition hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      Reset filters
                    </button>
                  </div>
                ) : (
                  <div className="rubric-table-shell">
                    <table className="rubric-table">
                      <caption className="sr-only">Rubrics for {communityName}</caption>
                      <thead>
                        <tr>
                          <th scope="col"><span className="sr-only">Select</span></th>
                          {["Rubric", "Criteria", "Sessions", "Updated"].map((header) => (
                            <th scope="col" key={header}>{header}</th>
                          ))}
                          <th scope="col"><span className="sr-only">Actions</span></th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedRubrics.map((rubric) => {
                          const isSelected = selectedIds.has(rubric.id);
                          return (
                          <tr
                            key={rubric.id}
                            className={[
                              "rubric-table-row",
                              isSelected ? "rubric-table-row-selected" : "",
                              actionMenuOpenId === rubric.id ? "rubric-table-row-menu-open" : "",
                            ].filter(Boolean).join(" ")}
                          >
                            <td className="rubric-row-selection-cell">
                              {!rubric.isDefault ? (
                                <button
                                  type="button"
                                  className="rubric-row-select"
                                  aria-label={`${isSelected ? "Deselect" : "Select"} ${rubric.name}`}
                                  aria-pressed={isSelected}
                                  title={`${isSelected ? "Deselect" : "Select"} rubric (Shift-click for a range)`}
                                  onClick={(event) => toggleRubricSelection(rubric.id, event.shiftKey)}
                                >
                                  <Check size={14} strokeWidth={3} aria-hidden="true" />
                                </button>
                              ) : null}
                            </td>
                            <td>
                              <Link
                                href={`/rubrics/${encodeURIComponent(rubric.id)}`}
                                className="rubric-row-title"
                              >
                                {rubric.name}
                              </Link>
                              <div className="rubric-row-meta">
                                <span>{rubricSessionTypeLabel(rubric.sessionType)}</span>
                                {rubric.isDefault && <span className="rubric-default-label">Default</span>}
                              </div>
                            </td>
                            <td><strong>{rubricItemCount(rubric.definition)}</strong><span> criteria</span></td>
                            <td><strong>{rubric.sessionCount}</strong><span> scored</span></td>
                            <td className="rubric-row-updated">{rubric.lastUpdated}</td>
                            <td>
                              <div
                                className="rubric-row-actions"
                                ref={actionMenuOpenId === rubric.id ? actionMenuRef : undefined}
                              >
                                <button
                                  type="button"
                                  aria-label={`Open actions for ${rubric.name}`}
                                  aria-haspopup="menu"
                                  aria-expanded={actionMenuOpenId === rubric.id}
                                  onClick={() => setActionMenuOpenId((openId) => openId === rubric.id ? null : rubric.id)}
                                  className="rubric-row-menu-button"
                                >
                                  <MoreHorizontal aria-hidden="true" className="h-4 w-4" />
                                </button>
                                {actionMenuOpenId === rubric.id && (
                                  <div className="rubric-row-menu" role="menu">
                                    <button
                                      type="button"
                                      role="menuitem"
                                      onClick={() => {
                                        setActionMenuOpenId(null);
                                        setEditingRubric(rubric);
                                        setShowCreate(true);
                                      }}
                                    >
                                      <Edit3 aria-hidden="true" className="h-4 w-4" />
                                      Edit rubric
                                    </button>
                                    {!rubric.isDefault ? (
                                      <button
                                        type="button"
                                        role="menuitem"
                                        disabled={makingDefaultId === rubric.id}
                                        onClick={() => {
                                          setActionMenuOpenId(null);
                                          void makeDefaultRubric(rubric);
                                        }}
                                      >
                                        <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
                                        {makingDefaultId === rubric.id ? "Updating…" : "Make default"}
                                      </button>
                                    ) : null}
                                    <button
                                      type="button"
                                      role="menuitem"
                                      disabled={rubric.isDefault || deletingId === rubric.id}
                                      title={rubric.isDefault ? "The default rubric cannot be deleted." : undefined}
                                      onClick={() => {
                                        setActionMenuOpenId(null);
                                        void deleteRubric(rubric);
                                      }}
                                      className="rubric-row-menu-danger"
                                    >
                                      <Trash2 aria-hidden="true" className="h-4 w-4" />
                                      {deletingId === rubric.id ? "Deleting…" : "Delete rubric"}
                                    </button>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )})}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="rubric-list-footer">
                  <p className="rubric-list-count" aria-live="polite">
                    {totalPages > 1
                      ? `${pageStart + 1}–${pageEnd} of ${visibleRubrics.length}`
                      : `${visibleRubrics.length} of ${displayRubrics.length}`}{" "}
                    rubric{displayRubrics.length === 1 ? "" : "s"}
                  </p>
                  <nav className="rubric-pagination" aria-label="Rubric pages">
                    <button
                      type="button"
                      aria-label="Previous rubric page"
                      disabled={currentPage <= 1}
                      onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                    >
                      <ChevronLeft aria-hidden="true" className="h-3.5 w-3.5" />
                      Previous
                    </button>
                    <span>Page {currentPage} of {totalPages}</span>
                    <button
                      type="button"
                      aria-label="Next rubric page"
                      disabled={currentPage >= totalPages}
                      onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                    >
                      Next
                      <ChevronRight aria-hidden="true" className="h-3.5 w-3.5" />
                    </button>
                  </nav>
                </div>
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
                    {selectedRubric.isDefault && <DefaultBadge />}
                    <span className="text-xs text-muted-foreground font-mono">{selectedRubric.version}</span>
                  </div>
                  <p className="text-muted-foreground text-sm">
                    Property scoped · {rubricSessionTypeLabel(selectedRubric.sessionType)} · {selectedRubric.categories.length} categories · {selectedRubric.sessionCount} sessions scored · {getTranscribeProvider(selectedRubric.transcribeProvider).label} → {getAnalysisModel(selectedRubric.analysisModel).label}{selectedRubric.audioUnderstandingEnabled ? " → Gemini audio" : ""}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0 flex-wrap justify-end">
                  {!selectedRubric.isDefault && (
                    <button
                      type="button"
                      disabled={makingDefaultId === selectedRubric.id}
                      onClick={() => void makeDefaultRubric(selectedRubric)}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-all disabled:opacity-40"
                    >
                      {makingDefaultId === selectedRubric.id ? (
                        <><div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" /> Updating...</>
                      ) : (
                        <><CheckCircle2 className="w-3.5 h-3.5" /> Make default</>
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
              <div role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{deleteError}</div>
            )}
            {defaultError && (
              <div role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{defaultError}</div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-5">
              <div className="space-y-3">
                {selectedRubric.categories.map((category, i) => (
                  <div key={i} className="rounded-2xl border border-border bg-card overflow-hidden">
                    <button
                      type="button"
                      aria-expanded={expandedCat === i}
                      aria-controls={`rubric-detail-category-${i}`}
                      onClick={() => setExpandedCat(expandedCat === i ? null : i)}
                      className="w-full flex items-center gap-4 px-5 py-4 hover:bg-secondary/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
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
                        {expandedCat === i ? <ChevronUp aria-hidden="true" className="w-4 h-4 text-muted-foreground" /> : <ChevronDown aria-hidden="true" className="w-4 h-4 text-muted-foreground" />}
                      </div>
                    </button>
                    <AnimatePresence>
                      {expandedCat === i && (
                        <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
                          <div id={`rubric-detail-category-${i}`} className="px-5 pb-4 border-t border-border pt-3">
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
                  <h4 className="font-semibold text-sm text-foreground mb-3">Property scope</h4>
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
