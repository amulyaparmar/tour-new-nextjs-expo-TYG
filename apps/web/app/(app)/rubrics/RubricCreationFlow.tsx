"use client";

import { useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Upload, Sparkles, ChevronRight, Trash2, GripVertical,
  Check, AlertTriangle, ChevronDown, ChevronUp, X, FileText, CheckCircle2, Plus,
} from "lucide-react";

import {
  ANALYSIS_MODELS,
  AI_PROVIDER_LABELS,
  DEFAULT_ANALYSIS_MODEL,
  type AnalysisModelId,
  type AiProvider,
} from "@tour/shared";

import {
  categoriesTotalPoints,
  createRubricItem,
  definitionToCategories,
  editableRubricCategory,
  type DisplayRubric,
  type ExtractedDefinition,
  type RubricCategory,
  type RubricItem,
} from "./rubric-utils";
import { uploadFileForRubricExtract } from "@/lib/client-upload";

type Step = 1 | 2 | 3;

type PropertyOption = { id: string; name: string };

export function RubricCreationFlow({
  properties,
  initialRubric,
  onClose,
  onSave,
}: {
  properties: PropertyOption[];
  initialRubric?: DisplayRubric | null;
  onClose: () => void;
  onSave: () => void;
}) {
  const isEditing = Boolean(initialRubric);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>(initialRubric ? 2 : 1);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [pastedText, setPastedText] = useState("");
  const [fileName, setFileName] = useState("");
  const initialCategories = initialRubric ? initialRubric.categories.map(editableRubricCategory) : [];
  const [categories, setCategories] = useState<RubricCategory[]>(initialCategories);
  const [baselineTotalPoints, setBaselineTotalPoints] = useState<number | null>(
    initialRubric ? categoriesTotalPoints(initialCategories) : null
  );
  const [expandedCat, setExpandedCat] = useState<number | null>(0);
  const [selectedProperties, setSelectedProperties] = useState<string[]>(
    initialRubric?.propertyIds.length ? initialRubric.propertyIds : properties.map((property) => property.id)
  );
  const [rubricName, setRubricName] = useState(initialRubric?.name ?? "");
  const [analysisModel, setAnalysisModel] = useState<AnalysisModelId>(
    initialRubric?.analysisModel ?? DEFAULT_ANALYSIS_MODEL
  );

  const totalPoints = categoriesTotalPoints(categories);
  const pointsMatch = baselineTotalPoints === null || totalPoints === baselineTotalPoints;

  const extractWithAi = async () => {
    if (uploading || (!selectedFile && !pastedText.trim())) return;

    setUploading(true);
    setExtractError(null);

    try {
      const body = selectedFile
        ? await uploadFileForRubricExtract<{
          error?: string;
          name?: string;
          definition?: ExtractedDefinition;
        }>(selectedFile)
        : await fetch("/api/admin/rubrics/extract", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: pastedText.trim(), fileName: "pasted-rubric.txt" }),
        }).then(async (response) => {
          const parsed = await response.json().catch(() => ({})) as {
            error?: string;
            name?: string;
            definition?: ExtractedDefinition;
          };
          if (!response.ok) throw new Error(parsed.error ?? "Rubric extraction failed.");
          return parsed;
        });
      if (!body.definition?.sections?.length) {
        throw new Error("AI could not extract any rubric categories from that document.");
      }

      const nextCategories = definitionToCategories(body.definition);
      setBaselineTotalPoints(categoriesTotalPoints(nextCategories));
      setCategories(nextCategories);
      if (body.name?.trim()) setRubricName(body.name.trim());
      setExpandedCat(0);
      setStep(2);
    } catch (caught) {
      setExtractError(caught instanceof Error ? caught.message : "Rubric extraction failed.");
    } finally {
      setUploading(false);
    }
  };

  const updateCategory = (i: number, field: keyof Omit<RubricCategory, "criteria">, value: string | number) => {
    setCategories((prev) => prev.map((category, idx) => idx === i ? { ...category, [field]: value } : category));
  };

  const updateCriterion = (catIdx: number, critIdx: number, field: keyof RubricItem, value: string | number) => {
    setCategories((prev) => prev.map((category, i) => {
      if (i !== catIdx) return category;
      const criteria = category.criteria.map((criterion, j) => j === critIdx ? { ...criterion, [field]: value } : criterion);
      const weight = field === "points"
        ? criteria.reduce((sum, item) => sum + (Number(item.points) || 0), 0)
        : category.weight;
      return { ...category, criteria, weight };
    }));
  };

  const addCriterion = (catIdx: number) => {
    setCategories((prev) => prev.map((category, i) => {
      if (i !== catIdx) return category;
      const criteria = [...category.criteria, createRubricItem("", 1, category.description)];
      return {
        ...category,
        criteria,
        weight: criteria.reduce((sum, item) => sum + (Number(item.points) || 0), 0),
      };
    }));
  };

  const removeCriterion = (catIdx: number, critIdx: number) => {
    setCategories((prev) => prev.map((category, i) => {
      if (i !== catIdx) return category;
      const criteria = category.criteria.filter((_, j) => j !== critIdx);
      return {
        ...category,
        criteria,
        weight: criteria.reduce((sum, item) => sum + (Number(item.points) || 0), 0),
      };
    }));
  };

  const removeCategory = (i: number) => setCategories((prev) => prev.filter((_, idx) => idx !== i));

  const addCategory = () => {
    setCategories((prev) => [...prev, { name: "New category", description: "", weight: 0, criteria: [createRubricItem()] }]);
    setExpandedCat(categories.length);
  };

  const toggleProperty = (id: string) => {
    setSelectedProperties((prev) => prev.includes(id) ? prev.filter((propertyId) => propertyId !== id) : [...prev, id]);
  };

  const saveRubric = async (draft: boolean) => {
    if (saving) return;

    setSaving(true);
    setSaveError(null);

    try {
      const name = rubricName.trim() || "Untitled rubric";
      const definition = {
        sections: categories.map((category, index) => ({
          name: category.name,
          items: category.criteria
            .filter((criterion) => criterion.text.trim())
            .map((criterion, criterionIndex) => ({
              id: criterion.id || `R${index + 1}.${criterionIndex + 1}`,
              text: criterion.text.trim(),
              points: Math.max(0, Number(criterion.points) || 0),
              note: criterion.note.trim() || category.description || undefined,
            })),
        })),
        notes: `Assigned properties: ${selectedProperties.join(", ")}${draft ? " (draft)" : ""}`,
      };

      const response = await fetch(initialRubric ? `/api/admin/rubrics/${initialRubric.id}` : "/api/admin/rubrics", {
        method: initialRubric ? "PATCH" : "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          definition,
          analysisModel,
          isDefault: initialRubric?.isDefault ?? !draft,
        }),
      });

      const body = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Failed to save rubric.");

      onSave();
    } catch (caught) {
      setSaveError(caught instanceof Error ? caught.message : "Failed to save rubric.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.97 }}
        className="bg-white rounded-2xl border border-border shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h3 className="font-bold text-foreground">{isEditing ? "Edit rubric" : "Create new rubric"}</h3>
            <div className="flex items-center gap-2 mt-1">
              {([1, 2, 3] as Step[]).map((s) => (
                <div key={s} className="flex items-center gap-1.5">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${step > s ? "bg-emerald-500 text-white" : step === s ? "bg-primary text-white" : "bg-secondary text-muted-foreground"}`}>
                    {step > s ? <Check className="w-3 h-3" /> : s}
                  </div>
                  <span className={`text-xs ${step === s ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                    {s === 1 ? "Upload" : s === 2 ? "Edit items" : "Assign & activate"}
                  </span>
                  {s < 3 && <ChevronRight className="w-3 h-3 text-muted-foreground" />}
                </div>
              ))}
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          <AnimatePresence mode="wait">
            {step === 1 && (
              <motion.div key="step1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                <p className="text-sm text-muted-foreground mb-5">Upload a rubric template document. Tour AI will extract categories, criteria, and weights automatically.</p>
                {!fileName ? (
                  <label className="block border-2 border-dashed border-border rounded-2xl p-12 flex flex-col items-center gap-3 mb-4 hover:border-primary/50 transition-colors cursor-pointer">
                    <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center">
                      <Upload className="w-6 h-6 text-muted-foreground" />
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-semibold text-foreground">Drop your rubric file here</p>
                      <p className="text-xs text-muted-foreground mt-1">PDF, DOCX, or TXT — up to 10 MB</p>
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      className="hidden"
                      accept=".pdf,.txt,.md,.csv,.json,text/*,application/pdf"
                      onChange={(event) => {
                        const file = event.target.files?.[0] ?? null;
                        setSelectedFile(file);
                        setFileName(file?.name ?? "");
                        setExtractError(null);
                      }}
                    />
                  </label>
                ) : (
                  <div className="border border-border rounded-xl p-4 flex items-center gap-3 mb-4">
                    <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                      <FileText className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-medium text-foreground">{fileName}</div>
                      <div className="text-xs text-muted-foreground">
                        {selectedFile ? `${(selectedFile.size / (1024 * 1024)).toFixed(1)} MB` : "Selected file"}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedFile(null);
                        setFileName("");
                        if (fileInputRef.current) fileInputRef.current.value = "";
                      }}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}
                <div className="relative mb-4">
                  <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border" /></div>
                  <div className="relative flex justify-center"><span className="bg-white px-3 text-xs text-muted-foreground">or paste rubric text</span></div>
                </div>
                <textarea
                  value={pastedText}
                  onChange={(event) => { setPastedText(event.target.value); setExtractError(null); }}
                  placeholder="Paste your rubric content here…"
                  rows={5}
                  className="w-full px-3 py-2.5 rounded-xl border border-border bg-input-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground"
                />
                {extractError && (
                  <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{extractError}</div>
                )}
              </motion.div>
            )}

            {step === 2 && (
              <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-primary" />
                    <span className="text-sm font-semibold text-foreground">{isEditing ? "Edit" : "AI extracted"} {categories.length} categories</span>
                  </div>
                  <div className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${pointsMatch ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                    {pointsMatch ? <Check className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                    {baselineTotalPoints === null ? `Total points: ${totalPoints}` : `Total points: ${totalPoints} / ${baselineTotalPoints} from rubric`}
                  </div>
                </div>
                <div className="space-y-2 mb-4">
                  {categories.map((category, i) => (
                    <div key={i} className="rounded-xl border border-border overflow-hidden">
                      <div className="flex items-center gap-3 px-4 py-3 bg-secondary/30 cursor-pointer" onClick={() => setExpandedCat(expandedCat === i ? null : i)}>
                        <GripVertical className="w-4 h-4 text-muted-foreground/50 cursor-grab" />
                        <div className="flex-1">
                          <input
                            value={category.name}
                            onChange={(event) => updateCategory(i, "name", event.target.value)}
                            onClick={(event) => event.stopPropagation()}
                            className="font-semibold text-sm text-foreground bg-transparent border-none outline-none w-full"
                          />
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <div className="flex items-center gap-1">
                            <span className="w-12 text-center px-1 py-0.5 rounded-lg border border-border bg-white text-xs font-bold text-foreground">
                              {category.criteria.reduce((sum, item) => sum + (Number(item.points) || 0), 0)}
                            </span>
                            <span className="text-xs text-muted-foreground">pts</span>
                          </div>
                          <button type="button" onClick={(event) => { event.stopPropagation(); removeCategory(i); }} className="p-1 text-muted-foreground hover:text-red-500 transition-colors">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                          {expandedCat === i ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                        </div>
                      </div>
                      <AnimatePresence>
                        {expandedCat === i && (
                          <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
                            <div className="px-4 py-3 space-y-3 border-t border-border">
                              <div>
                                <label className="text-xs font-medium text-muted-foreground">Description</label>
                                <input
                                  value={category.description}
                                  onChange={(event) => updateCategory(i, "description", event.target.value)}
                                  className="mt-1 w-full px-3 py-2 rounded-xl border border-border bg-input-background text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                                />
                              </div>
                              <div>
                                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Items</label>
                                <div className="space-y-2">
                                  {category.criteria.map((item, j) => (
                                    <div key={item.id} className="rounded-xl border border-border bg-white p-3">
                                      <div className="flex items-start gap-2">
                                        <div className="w-5 h-5 rounded-full bg-primary/10 text-primary text-[11px] font-bold flex items-center justify-center shrink-0 mt-1">{j + 1}</div>
                                        <input
                                          value={item.text}
                                          onChange={(event) => updateCriterion(i, j, "text", event.target.value)}
                                          placeholder="Scoring item"
                                          className="flex-1 px-2 py-1.5 rounded-lg border border-border bg-input-background text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                                        />
                                        <input
                                          type="number"
                                          min={0}
                                          value={item.points}
                                          onChange={(event) => updateCriterion(i, j, "points", parseInt(event.target.value) || 0)}
                                          className="w-16 px-2 py-1.5 rounded-lg border border-border bg-input-background text-xs text-center font-semibold focus:outline-none focus:ring-1 focus:ring-ring"
                                          aria-label="Item points"
                                        />
                                        <button type="button" onClick={() => removeCriterion(i, j)} className="p-1.5 text-muted-foreground hover:text-red-500 transition-colors">
                                          <X className="w-3 h-3" />
                                        </button>
                                      </div>
                                      <input
                                        value={item.note}
                                        onChange={(event) => updateCriterion(i, j, "note", event.target.value)}
                                        placeholder="Scoring guidance or evaluator note"
                                        className="mt-2 w-full px-2 py-1.5 rounded-lg border border-border bg-input-background text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                                      />
                                    </div>
                                  ))}
                                  <button type="button" onClick={() => addCriterion(i)} className="flex items-center gap-1.5 text-xs text-primary hover:opacity-80 transition-opacity">
                                    <Plus className="w-3 h-3" /> Add item
                                  </button>
                                </div>
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  ))}
                </div>
                <button type="button" onClick={addCategory} className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-dashed border-border text-sm text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors w-full justify-center">
                  <Plus className="w-4 h-4" /> Add category
                </button>
              </motion.div>
            )}

            {step === 3 && (
              <motion.div key="step3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                <div className="space-y-5">
                  <div>
                    <label className="block text-sm font-semibold text-foreground mb-1.5">Rubric name</label>
                    <input
                      value={rubricName}
                      onChange={(event) => setRubricName(event.target.value)}
                      placeholder="e.g. Standard Leasing Rubric v3"
                      className="w-full px-3 py-2.5 rounded-xl border border-border bg-input-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-foreground mb-1.5">Analysis model</label>
                    <select
                      value={analysisModel}
                      onChange={(event) => setAnalysisModel(event.target.value as AnalysisModelId)}
                      className="w-full px-3 py-2.5 rounded-xl border border-border bg-input-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      {(Object.keys(AI_PROVIDER_LABELS) as AiProvider[]).map((provider) => (
                        <optgroup key={provider} label={AI_PROVIDER_LABELS[provider]}>
                          {ANALYSIS_MODELS.filter((model) => model.provider === provider).map((model) => (
                            <option key={model.id} value={model.id}>
                              {model.label}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      {ANALYSIS_MODELS.find((model) => model.id === analysisModel)?.description}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-foreground mb-1.5">Assign to properties</label>
                    <div className="space-y-2">
                      {properties.map((property) => (
                        <label key={property.id} className="flex items-center gap-3 p-3 rounded-xl border border-border hover:bg-secondary/50 cursor-pointer transition-colors">
                          <button
                            type="button"
                            onClick={() => toggleProperty(property.id)}
                            className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all shrink-0 ${selectedProperties.includes(property.id) ? "bg-primary border-primary" : "border-border"}`}
                          >
                            {selectedProperties.includes(property.id) && (
                              <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none">
                                <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            )}
                          </button>
                          <span className="text-sm font-medium text-foreground">{property.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  {baselineTotalPoints !== null && !pointsMatch && (
                    <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-50 border border-amber-200">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <p className="text-xs text-amber-700">
                        Current total is {totalPoints} pts but the uploaded rubric defines {baselineTotalPoints} pts.
                        Adjust item points in step 2 before activating.
                      </p>
                    </div>
                  )}
                  {saveError && (
                    <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{saveError}</div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="px-6 py-4 border-t border-border flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => isEditing && step === 2 ? onClose() : step > 1 ? setStep((step - 1) as Step) : onClose()}
            className="px-4 py-2 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:bg-secondary transition-colors"
          >
            {step === 1 ? "Cancel" : "Back"}
          </button>
          {step === 1 && (
            <button
              type="button"
              onClick={() => void extractWithAi()}
              disabled={uploading || (!fileName && !pastedText.trim())}
              className="flex items-center gap-2 px-5 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              {uploading ? (
                <><div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />Extracting…</>
              ) : (
                <><Sparkles className="w-3.5 h-3.5" />Extract with AI</>
              )}
            </button>
          )}
          {step === 2 && (
            <button
              type="button"
              onClick={() => setStep(3)}
              disabled={categories.length === 0}
              className="flex items-center gap-2 px-5 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              Continue <ChevronRight className="w-4 h-4" />
            </button>
          )}
          {step === 3 && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void saveRubric(true)}
                disabled={saving}
                className="px-4 py-2 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:bg-secondary transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {saving ? "Saving..." : "Save as draft"}
              </button>
              <button
                type="button"
                onClick={() => void saveRubric(false)}
                disabled={saving || !rubricName || selectedProperties.length === 0 || !pointsMatch}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                {saving ? (
                  <><div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />Saving...</>
                ) : (
                  <><CheckCircle2 className="w-4 h-4" /> {isEditing ? "Update rubric" : "Activate rubric"}</>
                )}
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
