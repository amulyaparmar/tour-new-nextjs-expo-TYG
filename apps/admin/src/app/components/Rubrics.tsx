import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Play, Plus, Upload, Sparkles, ChevronRight, Edit3, Trash2, GripVertical,
  Check, AlertTriangle, ChevronDown, ChevronUp, X, FileText, CheckCircle2, Settings,
} from "lucide-react";
import { type AdminRubric, useAdminData } from "../data/AdminDataContext";

type RubricStatus = "active" | "draft";
type RubricItem = {
  id: string;
  text: string;
  points: number;
  note: string;
};
type Category = {
  name: string;
  description: string;
  weight: number;
  criteria: RubricItem[];
};

type TemplateCategory = Omit<Category, "criteria"> & { criteria: string[] };

const TEMPLATE_EXTRACTED: TemplateCategory[] = [
  { name: "Opening & Rapport", weight: 15, description: "Warmth of greeting, use of prospect's name, establishing comfort.", criteria: ["Greets prospect by name within first 30 seconds", "Makes genuine personal connection before discussing property", "Sets clear agenda for the tour"] },
  { name: "Needs Discovery", weight: 20, description: "Depth of questions around timeline, lifestyle, and priorities.", criteria: ["Asks about move-in timeline", "Identifies must-have vs nice-to-have features", "Explores lifestyle context", "Listens actively and reflects back"] },
  { name: "Property Showcase", weight: 25, description: "Quality of unit and amenity presentation tied to prospect needs.", criteria: ["Highlights at least 3 amenities with specific benefits", "Connects features to stated prospect needs", "Uses sensory language and storytelling"] },
  { name: "Objection Handling", weight: 20, description: "Skillful acknowledgment and resolution of price, size, or timeline objections.", criteria: ["Validates objection before responding", "Offers an alternative or reframe", "Does not drop price without offering value first"] },
  { name: "Closing", weight: 10, description: "Directness in asking for commitment or next steps.", criteria: ["Explicitly asks about interest level", "Proposes a clear next step"] },
  { name: "Follow-up Setup", weight: 10, description: "Locking in a specific follow-up date and action before leaving.", criteria: ["Sets a specific follow-up date", "Summarizes what will be sent or shared"] },
];

function createRubricItem(text = "", points = 1, note = ""): RubricItem {
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return { id: random, text, points, note };
}

function editableTemplateCategory(category: TemplateCategory): Category {
  const points = Math.max(1, Math.round(category.weight / Math.max(category.criteria.length, 1)));
  return {
    ...category,
    criteria: category.criteria.map((criterion) => createRubricItem(criterion, points, category.description)),
  };
}

function editableRubricCategory(category: AdminRubric["categories"][number]): Category {
  const fallbackPoints = Math.max(1, Math.round(category.weight / Math.max(category.criteria.length, 1)));
  const items = category.items?.length
    ? category.items
    : category.criteria.map((criterion, index) => ({
      id: `${category.name}-${index + 1}`,
      text: criterion,
      points: fallbackPoints,
      note: category.description,
    }));

  return {
    name: category.name,
    description: category.description,
    weight: category.weight,
    criteria: items.map((item) => ({
      id: item.id,
      text: item.text,
      points: item.points,
      note: item.note ?? category.description,
    })),
  };
}

function StatusBadge({ status }: { status: RubricStatus }) {
  return status === "active"
    ? <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />Active</span>
    : <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200"><div className="w-1.5 h-1.5 rounded-full bg-amber-500" />Draft</span>;
}

function NavHeader({ onNavigate, active }: { onNavigate: (v: string) => void; active: string }) {
  return (
    <header className="border-b border-border bg-white sticky top-0 z-20">
      <div className="max-w-[1400px] mx-auto px-6 h-14 flex items-center gap-6">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-primary flex items-center justify-center">
            <Play className="w-3 h-3 fill-white text-white" />
          </div>
          <span className="font-bold text-sm tracking-tight">Tour</span>
          <span className="text-muted-foreground text-sm">admin</span>
        </div>
        <nav className="hidden md:flex items-center gap-1">
          {[
            { label: "Dashboard", view: "dashboard" },
            { label: "Sessions", view: "sessions" },
            { label: "Analytics", view: "analytics" },
            { label: "Prospects", view: "prospects" },
            { label: "Team", view: "team" },
            { label: "Rubrics", view: "rubrics" },
          ].map(({ label, view }) => (
            <button key={view} onClick={() => onNavigate(view)}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${view === active ? "bg-secondary text-foreground font-semibold" : "text-muted-foreground hover:text-foreground hover:bg-secondary"}`}>
              {label}
            </button>
          ))}
        </nav>
        <div className="ml-auto">
          <button onClick={() => onNavigate("settings")} className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
}

type Step = 1 | 2 | 3;

function apiUrl(path: string) {
  const base = import.meta.env.VITE_API_BASE_URL ?? "";
  return `${base}${path}`;
}

function CreationFlow({
  properties,
  initialRubric,
  onClose,
  onSave,
}: {
  properties: Array<{ id: string; name: string }>;
  initialRubric?: AdminRubric | null;
  onClose: () => void;
  onSave: () => void;
}) {
  const isEditing = Boolean(initialRubric);
  const [step, setStep] = useState<Step>(initialRubric ? 2 : 1);
  const [uploading, setUploading] = useState(false);
  const [extracted, setExtracted] = useState(false);
  const [pastedText, setPastedText] = useState("");
  const [fileName, setFileName] = useState("");
  const [categories, setCategories] = useState<Category[]>(
    initialRubric ? initialRubric.categories.map(editableRubricCategory) : TEMPLATE_EXTRACTED.map(editableTemplateCategory)
  );
  const [expandedCat, setExpandedCat] = useState<number | null>(0);
  const [selectedProperties, setSelectedProperties] = useState<string[]>(initialRubric?.propertyIds ?? []);
  const [rubricName, setRubricName] = useState(initialRubric?.name ?? "");
  const [saveAsDraft, setSaveAsDraft] = useState(false);

  const totalWeight = categories.reduce((sum, c) => sum + c.weight, 0);
  const weightOk = totalWeight === 100;

  const simulateExtract = () => {
    setUploading(true);
    setTimeout(() => { setUploading(false); setExtracted(true); setStep(2); }, 1800);
  };

  const updateCategory = (i: number, field: keyof Omit<Category, "criteria">, value: string | number) => {
    setCategories(prev => prev.map((c, idx) => idx === i ? { ...c, [field]: value } : c));
  };

  const updateCriterion = (catIdx: number, critIdx: number, field: keyof RubricItem, value: string | number) => {
    setCategories(prev => prev.map((c, i) => i === catIdx ? {
      ...c,
      criteria: c.criteria.map((cr, j) => j === critIdx ? { ...cr, [field]: value } : cr)
    } : c));
  };

  const addCriterion = (catIdx: number) => {
    setCategories(prev => prev.map((c, i) => i === catIdx ? { ...c, criteria: [...c.criteria, createRubricItem("", 1, c.description)] } : c));
  };

  const removeCriterion = (catIdx: number, critIdx: number) => {
    setCategories(prev => prev.map((c, i) => i === catIdx ? { ...c, criteria: c.criteria.filter((_, j) => j !== critIdx) } : c));
  };

  const removeCategory = (i: number) => setCategories(prev => prev.filter((_, idx) => idx !== i));

  const addCategory = () => {
    setCategories(prev => [...prev, { name: "New category", description: "", weight: 0, criteria: [createRubricItem()] }]);
    setExpandedCat(categories.length);
  };

  const toggleProperty = (id: string) => setSelectedProperties(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]);

  const saveRubric = async (draft: boolean) => {
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
    await fetch(apiUrl(initialRubric ? `/api/admin/rubrics/${initialRubric.id}` : "/api/admin/rubrics"), {
      method: initialRubric ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, definition, isDefault: initialRubric?.isDefault ?? (!draft && saveAsDraft === false) }),
    }).catch(() => {});
    onSave();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.97 }}
        className="bg-white rounded-2xl border border-border shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h3 className="font-bold text-foreground">{isEditing ? "Edit rubric" : "Create new rubric"}</h3>
            <div className="flex items-center gap-2 mt-1">
              {([1, 2, 3] as Step[]).map(s => (
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
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        {/* Body */}
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
                    <input type="file" className="hidden" onChange={() => setFileName("Leasing_Rubric_Template_v2.pdf")} />
                  </label>
                ) : (
                  <div className="border border-border rounded-xl p-4 flex items-center gap-3 mb-4">
                    <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                      <FileText className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-medium text-foreground">{fileName}</div>
                      <div className="text-xs text-muted-foreground">2.4 MB · PDF</div>
                    </div>
                    <button onClick={() => setFileName("")} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
                  </div>
                )}
                <div className="relative mb-4">
                  <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border" /></div>
                  <div className="relative flex justify-center"><span className="bg-white px-3 text-xs text-muted-foreground">or paste rubric text</span></div>
                </div>
                <textarea value={pastedText} onChange={e => setPastedText(e.target.value)} placeholder="Paste your rubric content here…" rows={5}
                  className="w-full px-3 py-2.5 rounded-xl border border-border bg-input-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground" />
              </motion.div>
            )}

            {step === 2 && (
              <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-primary" />
                    <span className="text-sm font-semibold text-foreground">{isEditing ? "Edit" : "AI extracted"} {categories.length} categories</span>
                  </div>
                  <div className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${weightOk ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>
                    {weightOk ? <Check className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                    Total weight: {totalWeight}%
                  </div>
                </div>
                <div className="space-y-2 mb-4">
                  {categories.map((cat, i) => (
                    <div key={i} className="rounded-xl border border-border overflow-hidden">
                      <div className="flex items-center gap-3 px-4 py-3 bg-secondary/30 cursor-pointer" onClick={() => setExpandedCat(expandedCat === i ? null : i)}>
                        <GripVertical className="w-4 h-4 text-muted-foreground/50 cursor-grab" />
                        <div className="flex-1">
                          <input value={cat.name} onChange={e => updateCategory(i, "name", e.target.value)}
                            onClick={e => e.stopPropagation()}
                            className="font-semibold text-sm text-foreground bg-transparent border-none outline-none w-full" />
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <div className="flex items-center gap-1">
                            <input type="number" value={cat.weight} min={0} max={100}
                              onClick={e => e.stopPropagation()}
                              onChange={e => updateCategory(i, "weight", parseInt(e.target.value) || 0)}
                              className="w-12 text-center px-1 py-0.5 rounded-lg border border-border bg-white text-xs font-bold text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
                            <span className="text-xs text-muted-foreground">%</span>
                          </div>
                          <button onClick={e => { e.stopPropagation(); removeCategory(i); }} className="p-1 text-muted-foreground hover:text-red-500 transition-colors">
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
                                <input value={cat.description} onChange={e => updateCategory(i, "description", e.target.value)}
                                  className="mt-1 w-full px-3 py-2 rounded-xl border border-border bg-input-background text-xs focus:outline-none focus:ring-2 focus:ring-ring" />
                              </div>
                              <div>
                                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Items</label>
                                <div className="space-y-2">
                                  {cat.criteria.map((item, j) => (
                                    <div key={item.id} className="rounded-xl border border-border bg-white p-3">
                                      <div className="flex items-start gap-2">
                                        <div className="w-5 h-5 rounded-full bg-primary/10 text-primary text-[11px] font-bold flex items-center justify-center shrink-0 mt-1">
                                          {j + 1}
                                        </div>
                                        <input
                                          value={item.text}
                                          onChange={e => updateCriterion(i, j, "text", e.target.value)}
                                          placeholder="Scoring item"
                                          className="flex-1 px-2 py-1.5 rounded-lg border border-border bg-input-background text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                                        />
                                        <input
                                          type="number"
                                          min={0}
                                          value={item.points}
                                          onChange={e => updateCriterion(i, j, "points", parseInt(e.target.value) || 0)}
                                          className="w-16 px-2 py-1.5 rounded-lg border border-border bg-input-background text-xs text-center font-semibold focus:outline-none focus:ring-1 focus:ring-ring"
                                          aria-label="Item points"
                                        />
                                        <button onClick={() => removeCriterion(i, j)} className="p-1.5 text-muted-foreground hover:text-red-500 transition-colors">
                                          <X className="w-3 h-3" />
                                        </button>
                                      </div>
                                      <input
                                        value={item.note}
                                        onChange={e => updateCriterion(i, j, "note", e.target.value)}
                                        placeholder="Scoring guidance or evaluator note"
                                        className="mt-2 w-full px-2 py-1.5 rounded-lg border border-border bg-input-background text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                                      />
                                    </div>
                                  ))}
                                  <button onClick={() => addCriterion(i)} className="flex items-center gap-1.5 text-xs text-primary hover:opacity-80 transition-opacity">
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
                <button onClick={addCategory} className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-dashed border-border text-sm text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors w-full justify-center">
                  <Plus className="w-4 h-4" /> Add category
                </button>
              </motion.div>
            )}

            {step === 3 && (
              <motion.div key="step3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                <div className="space-y-5">
                  <div>
                    <label className="block text-sm font-semibold text-foreground mb-1.5">Rubric name</label>
                    <input value={rubricName} onChange={e => setRubricName(e.target.value)} placeholder="e.g. Standard Leasing Rubric v3"
                      className="w-full px-3 py-2.5 rounded-xl border border-border bg-input-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-foreground mb-1.5">Assign to properties</label>
                    <div className="space-y-2">
                      {properties.map(p => (
                        <label key={p.id} className="flex items-center gap-3 p-3 rounded-xl border border-border hover:bg-secondary/50 cursor-pointer transition-colors">
                          <button
                            onClick={() => toggleProperty(p.id)}
                            className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all shrink-0 ${selectedProperties.includes(p.id) ? "bg-primary border-primary" : "border-border"}`}
                          >
                            {selectedProperties.includes(p.id) && (
                              <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none">
                                <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            )}
                          </button>
                          <span className="text-sm font-medium text-foreground">{p.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  {!weightOk && (
                    <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-50 border border-amber-200">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <p className="text-xs text-amber-700">Category weights total {totalWeight}%, not 100%. Go back to step 2 to adjust.</p>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border flex items-center justify-between gap-3">
          <button onClick={() => isEditing && step === 2 ? onClose() : step > 1 ? setStep((step - 1) as Step) : onClose()}
            className="px-4 py-2 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:bg-secondary transition-colors">
            {step === 1 ? "Cancel" : "Back"}
          </button>
          {step === 1 && (
            <button
              onClick={simulateExtract}
              disabled={!fileName && !pastedText.trim()}
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
            <button onClick={() => setStep(3)}
              className="flex items-center gap-2 px-5 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-all">
              Continue <ChevronRight className="w-4 h-4" />
            </button>
          )}
          {step === 3 && (
            <div className="flex gap-2">
              <button onClick={() => void saveRubric(true)} className="px-4 py-2 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:bg-secondary transition-colors">
                Save as draft
              </button>
              <button onClick={() => void saveRubric(false)} disabled={!rubricName || selectedProperties.length === 0 || !weightOk}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all">
                <CheckCircle2 className="w-4 h-4" /> {isEditing ? "Update rubric" : "Activate rubric"}
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

type RubricView = "list" | "detail";

export function Rubrics({
  onNavigate,
  selectedRubricId,
  onSelectRubric,
  onBackToRubrics,
}: {
  onNavigate: (view: string) => void;
  selectedRubricId?: string | null;
  onSelectRubric: (id: string) => void;
  onBackToRubrics: () => void;
}) {
  const { rubrics: mockRubrics, properties, refresh } = useAdminData();
  const [showCreate, setShowCreate] = useState(false);
  const [editingRubric, setEditingRubric] = useState<AdminRubric | null>(null);
  const [selectedRubric, setSelectedRubric] = useState<AdminRubric | null>(null);
  const [rubricView, setRubricView] = useState<RubricView>("list");
  const [expandedCat, setExpandedCat] = useState<number | null>(null);

  useEffect(() => {
    if (!selectedRubricId) {
      setSelectedRubric(null);
      setRubricView("list");
      return;
    }

    const nextRubric = mockRubrics.find((rubric) => rubric.id === selectedRubricId) ?? null;
    setSelectedRubric(nextRubric);
    setRubricView(nextRubric ? "detail" : "list");
  }, [mockRubrics, selectedRubricId]);

  return (
    <div className="min-h-screen bg-background" style={{ fontFamily: "'Inter', sans-serif" }}>
      <AnimatePresence>
        {showCreate && (
          <CreationFlow
            properties={properties}
            initialRubric={editingRubric}
            onClose={() => { setShowCreate(false); setEditingRubric(null); }}
            onSave={() => { setShowCreate(false); setEditingRubric(null); void refresh(); }}
          />
        )}
      </AnimatePresence>

      <NavHeader onNavigate={onNavigate} active="rubrics" />

      <div className="max-w-[1400px] mx-auto px-6 py-8">
        {rubricView === "list" ? (
          <>
            <div className="flex items-start justify-between mb-6">
              <div>
                <h1 className="text-foreground" style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.025em" }}>Rubrics</h1>
                <p className="text-muted-foreground text-sm mt-1">Manage scoring rubrics for your leasing team. Upload a template and let AI do the extraction.</p>
              </div>
              <button onClick={() => { setEditingRubric(null); setShowCreate(true); }} className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-all">
                <Plus className="w-4 h-4" /> New rubric
              </button>
            </div>

            <div className="rounded-2xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-secondary/50">
                    {["Name", "Version", "Properties", "Categories", "Sessions scored", "Status", "Last updated"].map(h => (
                      <th key={h} className="text-left px-5 py-3 font-semibold text-xs text-muted-foreground uppercase tracking-wide">{h}</th>
                    ))}
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-white">
                  {mockRubrics.map(rubric => (
                    <tr key={rubric.id} onClick={() => { setSelectedRubric(rubric); setRubricView("detail"); onSelectRubric(rubric.id); }} className="hover:bg-secondary/40 cursor-pointer transition-colors group">
                      <td className="px-5 py-4">
                        <div className="font-semibold text-foreground group-hover:text-primary transition-colors">{rubric.name}</div>
                      </td>
                      <td className="px-5 py-4 text-muted-foreground font-mono text-xs">{rubric.version}</td>
                      <td className="px-5 py-4 text-muted-foreground">{rubric.propertyIds.length} properties</td>
                      <td className="px-5 py-4 text-muted-foreground">{rubric.categories.length}</td>
                      <td className="px-5 py-4 text-muted-foreground">{rubric.sessionCount}</td>
                      <td className="px-5 py-4"><StatusBadge status={rubric.status} /></td>
                      <td className="px-5 py-4 text-muted-foreground text-xs">{rubric.lastUpdated}</td>
                      <td className="px-5 py-4"><ChevronRight className="w-4 h-4 text-muted-foreground/50 group-hover:text-primary transition-colors" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : selectedRubric && (
          <>
            <div className="mb-6">
              <button onClick={onBackToRubrics} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors">
                <ChevronRight className="w-4 h-4 rotate-180" /> All rubrics
              </button>
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <h1 className="text-foreground" style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.025em" }}>{selectedRubric.name}</h1>
                    <StatusBadge status={selectedRubric.status} />
                    <span className="text-xs text-muted-foreground font-mono">{selectedRubric.version}</span>
                  </div>
                  <p className="text-muted-foreground text-sm">{selectedRubric.propertyIds.length} properties · {selectedRubric.categories.length} categories · {selectedRubric.sessionCount} sessions scored</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => { setEditingRubric(selectedRubric); setShowCreate(true); }} className="flex items-center gap-2 px-4 py-2 rounded-xl border border-border text-sm font-medium text-foreground hover:bg-secondary transition-colors">
                    <Edit3 className="w-3.5 h-3.5" /> Edit
                  </button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-5">
              <div className="space-y-3">
                {selectedRubric.categories.map((cat, i) => (
                  <div key={i} className="rounded-2xl border border-border bg-card overflow-hidden">
                    <button onClick={() => setExpandedCat(expandedCat === i ? null : i)}
                      className="w-full flex items-center gap-4 px-5 py-4 hover:bg-secondary/50 transition-colors">
                      <div className="flex-1 text-left">
                        <div className="flex items-center gap-3">
                          <span className="font-semibold text-sm text-foreground">{cat.name}</span>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-secondary text-muted-foreground border border-border font-medium">{cat.weight}%</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{cat.description}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs text-muted-foreground">{cat.criteria.length} items</span>
                        {expandedCat === i ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                      </div>
                    </button>
                    <AnimatePresence>
                      {expandedCat === i && (
                        <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
                          <div className="px-5 pb-4 border-t border-border pt-3">
                            <ul className="space-y-2">
                              {(cat.items?.length ? cat.items : cat.criteria.map((criterion, j) => ({
                                id: `${cat.name}-${j}`,
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

              {/* Sidebar: version history + properties */}
              <div className="space-y-4">
                <div className="rounded-2xl border border-border bg-card p-5">
                  <h4 className="font-semibold text-sm text-foreground mb-3">Assigned properties</h4>
                  <div className="space-y-2">
                    {properties.filter(p => selectedRubric.propertyIds.includes(p.id)).map(p => (
                      <div key={p.id} className="flex items-center gap-2 text-sm text-foreground">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />{p.name}
                      </div>
                    ))}
                    {selectedRubric.propertyIds.length === 0 && <p className="text-xs text-muted-foreground">No properties assigned.</p>}
                  </div>
                </div>
                <div className="rounded-2xl border border-border bg-card p-5">
                  <h4 className="font-semibold text-sm text-foreground mb-3">Version history</h4>
                  <div className="space-y-2">
                    {["v2 (current)", "v1"].map((v, i) => (
                      <div key={v} className="flex items-center justify-between text-xs">
                        <span className={`font-medium ${i === 0 ? "text-foreground" : "text-muted-foreground"}`}>{v}</span>
                        <span className="text-muted-foreground">{i === 0 ? "Jun 1, 2026" : "Apr 12, 2026"}</span>
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
