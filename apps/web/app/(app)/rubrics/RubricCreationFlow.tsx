"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  FileText,
  Info,
  ListChecks,
  Plus,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";

import {
  ANALYSIS_MODELS,
  AI_PROVIDER_LABELS,
  AUDIO_ANALYSIS_MODE_LABELS,
  AUDIO_ANALYSIS_MODES,
  DEFAULT_ANALYSIS_MODEL,
  DEFAULT_AUDIO_ANALYSIS_MODES,
  DEFAULT_GEMINI_AUDIO_MODEL,
  DEFAULT_RUBRIC_SESSION_TYPE,
  DEFAULT_SEGMENTATION_PROMPT,
  DEFAULT_TRANSCRIBE_PROVIDER,
  GEMINI_AUDIO_MODELS,
  RUBRIC_SESSION_TYPE_PRESETS,
  TRANSCRIBE_PROVIDERS,
  buildRubricAnalysisPrompt,
  estimateRubricCostPerAudioMinute,
  isRubricSessionTypePreset,
  normalizeRubricPromptOverride,
  type AiProvider,
  type AnalysisModelId,
  type AudioAnalysisMode,
  type GeminiAudioModelId,
  type RubricDefinition,
  type RubricSessionTypePresetId,
  type TranscribeProviderId,
} from "@tour/shared";

import { invalidateRubricsCache } from "@/lib/client-rubrics-cache";
import { uploadFileForRubricExtract } from "@/lib/client-upload";

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

type EditorTab = "details" | "questions" | "advanced";
type PropertyOption = { id: string; name: string };
type SessionTypeMode = RubricSessionTypePresetId | "custom";
type DetailErrors = {
  name?: string;
  sessionType?: string;
};

const EDITOR_TABS: {
  id: EditorTab;
  label: string;
}[] = [
  {
    id: "details",
    label: "Details",
  },
  {
    id: "questions",
    label: "Questions",
  },
  {
    id: "advanced",
    label: "Advanced",
  },
];

const AUDIO_ANALYSIS_MODE_DESCRIPTIONS: Record<AudioAnalysisMode, string> = {
  emotion: "Detects vocal sentiment, energy, hesitation, and emotional shifts that are audible in the recording.",
  conversation_dynamics: "Measures pacing, interruptions, silence, talk balance, and how the conversation flows between participants.",
  ambience: "Flags meaningful background sound, recording quality, and environmental context that may affect the call or tour.",
  participant_identity: "Uses the recording alongside the transcript to assess participant roles and spoken name evidence. It does not replace confirmed names.",
};

function buildDefinitionPayload(
  categories: RubricCategory[],
  assignedPropertyIds: string[]
): RubricDefinition {
  return {
    sections: categories.map((category, index) => ({
      name: category.name.trim(),
      items: category.criteria
        .filter((criterion) => criterion.text.trim())
        .map((criterion, criterionIndex) => ({
          id: criterion.id || `R${index + 1}.${criterionIndex + 1}`,
          text: criterion.text.trim(),
          points: Math.max(0, Number(criterion.points) || 0),
          note: criterion.note.trim() || category.description.trim() || undefined,
        })),
    })),
    notes: `Property scope: ${assignedPropertyIds.join(", ")}`,
  };
}

function initialSessionTypeMode(sessionType?: string): SessionTypeMode {
  if (!sessionType) return DEFAULT_RUBRIC_SESSION_TYPE;
  return isRubricSessionTypePreset(sessionType) ? sessionType : "custom";
}

export function RubricCreationFlow({
  properties,
  initialRubric,
  makeDefaultOnCreate = false,
  canChangeTranscribeProvider,
  onClose,
  onSave,
}: {
  properties: PropertyOption[];
  initialRubric?: DisplayRubric | null;
  makeDefaultOnCreate?: boolean;
  canChangeTranscribeProvider: boolean;
  onClose: () => void;
  onSave: () => void;
}) {
  const isEditing = Boolean(initialRubric);
  const initialCategories = initialRubric
    ? initialRubric.categories.map(editableRubricCategory)
    : [];

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLFormElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const [activeTab, setActiveTab] = useState<EditorTab>("details");
  const [furthestCreateStep, setFurthestCreateStep] = useState(0);
  const [detailErrors, setDetailErrors] = useState<DetailErrors>({});
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showImport, setShowImport] = useState(!isEditing);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [pastedText, setPastedText] = useState("");
  const [fileName, setFileName] = useState("");
  const [categories, setCategories] = useState<RubricCategory[]>(initialCategories);
  const [baselineTotalPoints, setBaselineTotalPoints] = useState<number | null>(null);
  const [expandedCat, setExpandedCat] = useState<number | null>(initialCategories.length ? 0 : null);
  const [rubricName, setRubricName] = useState(initialRubric?.name ?? "");
  const [analysisModel, setAnalysisModel] = useState<AnalysisModelId>(
    initialRubric?.analysisModel ?? DEFAULT_ANALYSIS_MODEL
  );
  const [nameExtractionModel, setNameExtractionModel] = useState<AnalysisModelId>(
    initialRubric?.nameExtractionModel ?? initialRubric?.analysisModel ?? DEFAULT_ANALYSIS_MODEL
  );
  const [transcribeProvider, setTranscribeProvider] = useState<TranscribeProviderId>(
    initialRubric?.transcribeProvider ?? DEFAULT_TRANSCRIBE_PROVIDER
  );
  const [audioUnderstandingEnabled, setAudioUnderstandingEnabled] = useState(
    initialRubric?.audioUnderstandingEnabled ?? false
  );
  const [audioAnalysisModes, setAudioAnalysisModes] = useState<AudioAnalysisMode[]>(
    initialRubric?.audioAnalysisModes ?? []
  );
  const [audioAnalysisModel, setAudioAnalysisModel] = useState<GeminiAudioModelId>(
    initialRubric?.audioAnalysisModel ?? DEFAULT_GEMINI_AUDIO_MODEL
  );
  const initialSessionType = initialRubric?.sessionType ?? DEFAULT_RUBRIC_SESSION_TYPE;
  const [sessionTypeMode, setSessionTypeMode] = useState<SessionTypeMode>(
    initialSessionTypeMode(initialSessionType)
  );
  const [customSessionType, setCustomSessionType] = useState(
    isRubricSessionTypePreset(initialSessionType) ? "" : initialSessionType
  );
  const [segmentationPrompt, setSegmentationPrompt] = useState(
    initialRubric?.segmentationPrompt ?? DEFAULT_SEGMENTATION_PROMPT
  );
  const [analysisPrompt, setAnalysisPrompt] = useState(
    initialRubric?.analysisPrompt
      ?? buildRubricAnalysisPrompt(initialRubric?.definition ?? { sections: [] })
  );
  const [analysisPromptTouched, setAnalysisPromptTouched] = useState(
    Boolean(initialRubric?.analysisPrompt)
  );

  const totalPoints = categoriesTotalPoints(categories);
  const pointsMatch = baselineTotalPoints === null || totalPoints === baselineTotalPoints;
  const resolvedSessionType = sessionTypeMode === "custom"
    ? customSessionType.trim()
    : sessionTypeMode;
  const currentProperty = properties[0] ?? null;
  const activeTabIndex = EDITOR_TABS.findIndex((tab) => tab.id === activeTab);
  const assignedPropertyIds = useMemo(
    () => currentProperty ? [currentProperty.id] : initialRubric?.propertyIds ?? [],
    [currentProperty, initialRubric?.propertyIds]
  );
  const estimatedCost = useMemo(() => estimateRubricCostPerAudioMinute({
    transcribeProvider,
    analysisModel,
    nameExtractionModel,
    audioAnalysisModel,
    audioAnalysisModes: audioUnderstandingEnabled ? audioAnalysisModes : [],
  }), [analysisModel, audioAnalysisModel, audioAnalysisModes, audioUnderstandingEnabled, nameExtractionModel, transcribeProvider]);

  const toggleAudioMode = (mode: AudioAnalysisMode) => {
    setAudioAnalysisModes((current) => current.includes(mode)
      ? current.filter((item) => item !== mode)
      : [...current, mode]
    );
  };

  useEffect(() => {
    if (analysisPromptTouched) return;
    const definition = buildDefinitionPayload(categories, assignedPropertyIds);
    setAnalysisPrompt(buildRubricAnalysisPrompt(definition));
  }, [analysisPromptTouched, assignedPropertyIds, categories]);

  useEffect(() => {
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      previouslyFocusedRef.current?.focus();
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving && !uploading) {
        onClose();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;

      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex='-1'])"
      )).filter((element) => element.getClientRects().length > 0);
      if (!focusable.length) return;

      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, saving, uploading]);

  const selectTab = (nextTab: EditorTab) => {
    const nextIndex = EDITOR_TABS.findIndex((tab) => tab.id === nextTab);
    if (!isEditing && nextIndex > furthestCreateStep) return;
    setActiveTab(nextTab);
    setSaveError(null);
  };

  const handleTabKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!isEditing) return;
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const currentIndex = EDITOR_TABS.findIndex((tab) => tab.id === activeTab);
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? EDITOR_TABS.length - 1
        : (currentIndex + (event.key === "ArrowRight" ? 1 : -1) + EDITOR_TABS.length) % EDITOR_TABS.length;
    const nextTab = EDITOR_TABS[nextIndex]!;
    setActiveTab(nextTab.id);
    dialogRef.current
      ?.querySelector<HTMLButtonElement>(`#rubric-tab-${nextTab.id}`)
      ?.focus();
  };

  const validateDetailsStep = () => {
    const errors: DetailErrors = {};
    if (!rubricName.trim()) {
      errors.name = "Enter a name for this rubric.";
    } else if (rubricName.trim().length < 2) {
      errors.name = "Use at least 2 characters.";
    }
    if (!resolvedSessionType) {
      errors.sessionType = "Describe the custom session type.";
    }

    setDetailErrors(errors);
    if (Object.keys(errors).length === 0) return true;

    requestAnimationFrame(() => {
      dialogRef.current
        ?.querySelector<HTMLElement>(errors.name ? "#rubric-name" : "#rubric-custom-session-type")
        ?.focus();
    });
    return false;
  };

  const validateQuestionsStep = () => {
    const invalidCategory = categories.findIndex((category) => (
      !category.name.trim()
      || !category.criteria.some((criterion) => criterion.text.trim())
    ));

    if (categories.length === 0 || invalidCategory >= 0) {
      setExpandedCat(invalidCategory >= 0 ? invalidCategory : null);
      setEditorError("Add at least one named category with a scoring question.");
      return false;
    }
    if (!pointsMatch) {
      setEditorError("Match the imported rubric’s original point total before continuing.");
      return false;
    }

    setEditorError(null);
    return true;
  };

  const goToNextCreateStep = () => {
    if (isEditing || activeTabIndex >= EDITOR_TABS.length - 1) return;
    if (activeTab === "details" && !validateDetailsStep()) return;
    if (activeTab === "questions" && !validateQuestionsStep()) return;

    const nextIndex = activeTabIndex + 1;
    setFurthestCreateStep((current) => Math.max(current, nextIndex));
    setActiveTab(EDITOR_TABS[nextIndex]!.id);
    setSaveError(null);
  };

  const goToPreviousCreateStep = () => {
    if (isEditing || activeTabIndex <= 0) return;
    setActiveTab(EDITOR_TABS[activeTabIndex - 1]!.id);
    setSaveError(null);
  };

  const extractWithAi = async () => {
    if (uploading || (!selectedFile && !pastedText.trim())) return;
    if (categories.length > 0 && !window.confirm("Replace the current questions with the imported rubric?")) return;

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
        throw new Error("AI could not extract any rubric questions from that document.");
      }

      const nextCategories = definitionToCategories(body.definition);
      setBaselineTotalPoints(categoriesTotalPoints(nextCategories));
      setCategories(nextCategories);
      if (body.name?.trim()) setRubricName(body.name.trim());
      setExpandedCat(0);
      setShowImport(false);
      setEditorError(null);
    } catch (caught) {
      setExtractError(caught instanceof Error ? caught.message : "Rubric extraction failed.");
    } finally {
      setUploading(false);
    }
  };

  const updateCategory = (
    index: number,
    field: keyof Omit<RubricCategory, "criteria">,
    value: string | number
  ) => {
    setCategories((current) => current.map((category, categoryIndex) => (
      categoryIndex === index ? { ...category, [field]: value } : category
    )));
  };

  const updateCriterion = (
    categoryIndex: number,
    criterionIndex: number,
    field: keyof RubricItem,
    value: string | number
  ) => {
    setCategories((current) => current.map((category, index) => {
      if (index !== categoryIndex) return category;
      const criteria = category.criteria.map((criterion, itemIndex) => (
        itemIndex === criterionIndex ? { ...criterion, [field]: value } : criterion
      ));
      return {
        ...category,
        criteria,
        weight: field === "points"
          ? criteria.reduce((sum, item) => sum + (Number(item.points) || 0), 0)
          : category.weight,
      };
    }));
  };

  const addCategory = () => {
    setCategories((current) => [
      ...current,
      {
        name: `Category ${current.length + 1}`,
        description: "",
        weight: 1,
        criteria: [createRubricItem("", 1)],
      },
    ]);
    setExpandedCat(categories.length);
    setEditorError(null);
  };

  const removeCategory = (index: number) => {
    setCategories((current) => current.filter((_, categoryIndex) => categoryIndex !== index));
    setExpandedCat(null);
  };

  const addCriterion = (categoryIndex: number) => {
    setCategories((current) => current.map((category, index) => {
      if (index !== categoryIndex) return category;
      const criteria = [...category.criteria, createRubricItem("", 1, category.description)];
      return {
        ...category,
        criteria,
        weight: criteria.reduce((sum, item) => sum + (Number(item.points) || 0), 0),
      };
    }));
  };

  const removeCriterion = (categoryIndex: number, criterionIndex: number) => {
    setCategories((current) => current.map((category, index) => {
      if (index !== categoryIndex) return category;
      const criteria = category.criteria.filter((_, itemIndex) => itemIndex !== criterionIndex);
      return {
        ...category,
        criteria,
        weight: criteria.reduce((sum, item) => sum + (Number(item.points) || 0), 0),
      };
    }));
  };

  const saveRubric = async () => {
    if (saving) return;
    if (!isEditing && activeTab !== "advanced") {
      goToNextCreateStep();
      return;
    }

    if (!rubricName.trim()) {
      setActiveTab("details");
      setDetailErrors({ name: "Enter a name for this rubric." });
      setSaveError("Enter a name for this rubric.");
      return;
    }
    if (!resolvedSessionType) {
      setActiveTab("details");
      setDetailErrors({ sessionType: "Describe the custom session type." });
      setSaveError("Describe the custom session type.");
      return;
    }
    const invalidCategory = categories.findIndex((category) => (
      !category.name.trim()
      || !category.criteria.some((criterion) => criterion.text.trim())
    ));
    if (categories.length === 0 || invalidCategory >= 0) {
      setActiveTab("questions");
      setExpandedCat(invalidCategory >= 0 ? invalidCategory : null);
      setEditorError("Add at least one named category with a scoring question.");
      setSaveError("Review the Questions tab before saving.");
      return;
    }
    if (!pointsMatch) {
      setActiveTab("questions");
      setSaveError("Match the imported rubric’s original point total before saving.");
      return;
    }

    setSaving(true);
    setSaveError(null);
    setEditorError(null);

    try {
      const definition = buildDefinitionPayload(categories, assignedPropertyIds);
      const defaultAnalysisPrompt = buildRubricAnalysisPrompt(definition);
      const response = await fetch(
        initialRubric ? `/api/admin/rubrics/${initialRubric.id}` : "/api/admin/rubrics",
        {
          method: initialRubric ? "PATCH" : "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: rubricName.trim(),
            definition,
            analysisModel,
            nameExtractionModel,
            ...(canChangeTranscribeProvider ? { transcribeProvider } : {}),
            audioUnderstandingEnabled,
            audioAnalysisModes,
            audioAnalysisModel,
            sessionType: resolvedSessionType,
            segmentationPrompt: normalizeRubricPromptOverride(
              segmentationPrompt,
              DEFAULT_SEGMENTATION_PROMPT
            ),
            analysisPrompt: normalizeRubricPromptOverride(
              analysisPrompt,
              defaultAnalysisPrompt
            ),
            isDefault: initialRubric?.isDefault ?? makeDefaultOnCreate,
          }),
        }
      );

      const body = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Failed to save rubric.");

      invalidateRubricsCache();
      onSave();
    } catch (caught) {
      setSaveError(caught instanceof Error ? caught.message : "Failed to save rubric.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.form
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="rubric-editor-title"
      aria-describedby="rubric-editor-description"
      tabIndex={-1}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (!isEditing && activeTab !== "advanced") {
          goToNextCreateStep();
          return;
        }
        void saveRubric();
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="rubric-editor-modal text-foreground"
    >
      <header className="shrink-0 border-b border-border bg-white">
        <div className="mx-auto flex w-full max-w-[1100px] items-start justify-between gap-6 px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">
              Rubric management
            </p>
            <h2 id="rubric-editor-title" className="mt-1 text-xl font-bold text-foreground">
              {isEditing ? `Edit ${initialRubric?.name}` : "Create a new rubric"}
            </h2>
            <p id="rubric-editor-description" className="mt-1 text-sm text-muted-foreground">
              {isEditing
                ? "Move between sections freely, then save when you are ready."
                : "Complete each step to create a ready-to-use rubric."}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close rubric editor"
            disabled={saving || uploading}
            onClick={onClose}
            className="rounded-xl border border-border p-2.5 text-muted-foreground transition hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>

        <div
          role="tablist"
          aria-label="Rubric settings"
          onKeyDown={handleTabKeyDown}
          className="rubric-editor-tabs"
        >
          {EDITOR_TABS.map((tab) => {
            const selected = activeTab === tab.id;
            const tabIndex = EDITOR_TABS.findIndex((candidate) => candidate.id === tab.id);
            const completed = !isEditing && tabIndex < activeTabIndex;
            const locked = !isEditing && tabIndex > furthestCreateStep;
            return (
              <button
                key={tab.id}
                id={`rubric-tab-${tab.id}`}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls={`rubric-panel-${tab.id}`}
                tabIndex={selected ? 0 : -1}
                disabled={locked}
                onClick={() => selectTab(tab.id)}
                className={[
                  "rubric-editor-tab",
                  selected ? "rubric-editor-tab-active" : "",
                  !isEditing ? "rubric-editor-step" : "",
                  completed ? "rubric-editor-step-complete" : "",
                ].filter(Boolean).join(" ")}
              >
                {!isEditing && (
                  <span className="rubric-editor-step-number" aria-hidden="true">
                    {completed ? <Check className="h-3 w-3" /> : tabIndex + 1}
                  </span>
                )}
                {tab.label}
                {tab.id === "questions" && categories.length > 0 ? (
                  <span className="rubric-editor-tab-count">{categories.length}</span>
                ) : null}
              </button>
            );
          })}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[1100px] px-4 py-6 sm:px-6 sm:py-8">
          {saveError && (
            <div
              role="alert"
              className="mb-5 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
            >
              <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{saveError}</span>
            </div>
          )}

          <section
            id="rubric-panel-details"
            role="tabpanel"
            aria-labelledby="rubric-tab-details"
            hidden={activeTab !== "details"}
            className="space-y-5"
          >
            <div>
              <h3 className="text-lg font-bold text-foreground">Rubric details</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Give the rubric a recognizable name and define where it should be used.
              </p>
            </div>

            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
              <div className="rounded-2xl border border-border bg-white p-5 shadow-sm">
                <div className="space-y-5">
                  <div>
                    <label
                      htmlFor="rubric-name"
                      className="block text-sm font-semibold text-foreground"
                    >
                      Rubric name <span aria-hidden="true" className="text-red-500">*</span>
                    </label>
                    <p id="rubric-name-help" className="mt-1 text-xs text-muted-foreground">
                      Use a name your team will recognize when choosing a rubric.
                    </p>
                    <input
                      id="rubric-name"
                      required
                      aria-invalid={Boolean(detailErrors.name)}
                      aria-describedby={detailErrors.name ? "rubric-name-help rubric-name-error" : "rubric-name-help"}
                      value={rubricName}
                      onChange={(event) => {
                        setRubricName(event.target.value);
                        setDetailErrors((current) => ({ ...current, name: undefined }));
                        setSaveError(null);
                      }}
                      placeholder="Standard leasing tour rubric"
                      className={`mt-2.5 w-full rounded-xl border bg-input-background px-3 py-2.5 text-sm outline-none transition focus:ring-2 focus:ring-ring ${
                        detailErrors.name ? "border-red-300 focus:border-red-400" : "border-border focus:border-primary"
                      }`}
                    />
                    {detailErrors.name && (
                      <p id="rubric-name-error" role="alert" className="mt-1.5 text-xs font-medium text-red-600">
                        {detailErrors.name}
                      </p>
                    )}
                  </div>

                  <div>
                    <label
                      htmlFor="rubric-session-type"
                      className="block text-sm font-semibold text-foreground"
                    >
                      Session type
                    </label>
                    <p id="rubric-session-type-help" className="mt-1 text-xs text-muted-foreground">
                      Tailors segmentation and analysis to the kind of interaction being scored.
                    </p>
                    <select
                      id="rubric-session-type"
                      aria-describedby="rubric-session-type-help"
                      value={sessionTypeMode}
                      onChange={(event) => {
                        setSessionTypeMode(event.target.value as SessionTypeMode);
                        setDetailErrors((current) => ({ ...current, sessionType: undefined }));
                      }}
                      className="mt-2.5 w-full rounded-xl border border-border bg-input-background px-3 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-ring"
                    >
                      {RUBRIC_SESSION_TYPE_PRESETS.map((preset) => (
                        <option key={preset.id} value={preset.id}>{preset.label}</option>
                      ))}
                      <option value="custom">Custom</option>
                    </select>
                    {sessionTypeMode === "custom" && (
                      <div className="mt-3">
                        <label
                          htmlFor="rubric-custom-session-type"
                          className="block text-xs font-semibold text-foreground"
                        >
                          Custom session type <span aria-hidden="true" className="text-red-500">*</span>
                        </label>
                        <input
                          id="rubric-custom-session-type"
                          value={customSessionType}
                          required
                          aria-invalid={Boolean(detailErrors.sessionType)}
                          aria-describedby={detailErrors.sessionType ? "rubric-custom-session-type-error" : undefined}
                          onChange={(event) => {
                            setCustomSessionType(event.target.value);
                            setDetailErrors((current) => ({ ...current, sessionType: undefined }));
                          }}
                          placeholder="Describe the session format"
                          className={`mt-1.5 w-full rounded-xl border bg-input-background px-3 py-2.5 text-sm outline-none transition focus:ring-2 focus:ring-ring ${
                            detailErrors.sessionType ? "border-red-300 focus:border-red-400" : "border-border focus:border-primary"
                          }`}
                        />
                        {detailErrors.sessionType && (
                          <p id="rubric-custom-session-type-error" role="alert" className="mt-1.5 text-xs font-medium text-red-600">
                            {detailErrors.sessionType}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="rubric-editor-scope-card">
                <span className="rubric-editor-scope-eyebrow">Property scoped</span>
                <strong>{currentProperty?.name ?? "Current property"}</strong>
                <p>
                  This rubric belongs to the property you are currently working in. Switch
                  properties to create or edit rubrics for another team.
                </p>
              </div>
            </div>
          </section>

          <section
            id="rubric-panel-questions"
            role="tabpanel"
            aria-labelledby="rubric-tab-questions"
            hidden={activeTab !== "questions"}
            className="space-y-5"
          >
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-foreground">Scoring questions</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Organize questions into categories and assign points to each answer.
                </p>
              </div>
              <div className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${
                pointsMatch
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-amber-50 text-amber-700"
              }`}>
                {pointsMatch
                  ? <Check aria-hidden="true" className="h-3.5 w-3.5" />
                  : <AlertTriangle aria-hidden="true" className="h-3.5 w-3.5" />}
                {baselineTotalPoints === null
                  ? `${totalPoints} total points`
                  : `${totalPoints} of ${baselineTotalPoints} imported points`}
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
              <button
                type="button"
                aria-expanded={showImport}
                aria-controls="rubric-import-panel"
                onClick={() => setShowImport((value) => !value)}
                className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition hover:bg-secondary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                <span className="flex items-center gap-3">
                  <span className="rounded-xl bg-primary/10 p-2 text-primary">
                    <Sparkles aria-hidden="true" className="h-4 w-4" />
                  </span>
                  <span>
                    <span className="block text-sm font-semibold text-foreground">
                      Import questions with AI
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      Upload a document or paste existing rubric text.
                    </span>
                  </span>
                </span>
                {showImport
                  ? <ChevronUp aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
                  : <ChevronDown aria-hidden="true" className="h-4 w-4 text-muted-foreground" />}
              </button>

              {showImport && (
                <div id="rubric-import-panel" className="border-t border-border p-5">
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div>
                      {!fileName ? (
                        <label className="flex min-h-36 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border p-5 text-center transition hover:border-primary/50">
                          <Upload aria-hidden="true" className="h-5 w-5 text-muted-foreground" />
                          <span className="text-sm font-semibold text-foreground">
                            Choose a rubric file
                          </span>
                          <span className="text-xs text-muted-foreground">
                            PDF, TXT, CSV, or JSON
                          </span>
                          <input
                            ref={fileInputRef}
                            type="file"
                            className="sr-only"
                            accept=".pdf,.txt,.md,.csv,.json,text/*,application/pdf,application/json"
                            onChange={(event) => {
                              const file = event.target.files?.[0] ?? null;
                              setSelectedFile(file);
                              setFileName(file?.name ?? "");
                              setExtractError(null);
                            }}
                          />
                        </label>
                      ) : (
                        <div className="flex min-h-36 items-center gap-3 rounded-2xl border border-border p-4">
                          <span className="rounded-xl bg-primary/10 p-2.5 text-primary">
                            <FileText aria-hidden="true" className="h-5 w-5" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold text-foreground">
                              {fileName}
                            </span>
                            <span className="mt-0.5 block text-xs text-muted-foreground">
                              {selectedFile
                                ? `${(selectedFile.size / (1024 * 1024)).toFixed(1)} MB`
                                : "Selected file"}
                            </span>
                          </span>
                          <button
                            type="button"
                            aria-label={`Remove ${fileName}`}
                            onClick={() => {
                              setSelectedFile(null);
                              setFileName("");
                              if (fileInputRef.current) fileInputRef.current.value = "";
                            }}
                            className="rounded-lg p-2 text-muted-foreground transition hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <X aria-hidden="true" className="h-4 w-4" />
                          </button>
                        </div>
                      )}
                    </div>

                    <div>
                      <label
                        htmlFor="rubric-source-text"
                        className="mb-1.5 block text-xs font-semibold text-foreground"
                      >
                        Or paste rubric text
                      </label>
                      <textarea
                        id="rubric-source-text"
                        value={pastedText}
                        onChange={(event) => {
                          setPastedText(event.target.value);
                          setExtractError(null);
                        }}
                        placeholder="Paste categories and scoring questions…"
                        rows={5}
                        className="min-h-28 w-full resize-y rounded-xl border border-border bg-input-background px-3 py-2.5 text-sm outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-ring"
                      />
                    </div>
                  </div>

                  {extractError && (
                    <div
                      role="alert"
                      className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
                    >
                      {extractError}
                    </div>
                  )}
                  <div className="mt-4 flex justify-end">
                    <button
                      type="button"
                      onClick={() => void extractWithAi()}
                      disabled={uploading || (!selectedFile && !pastedText.trim())}
                      className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {uploading ? (
                        <>
                          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                          Extracting…
                        </>
                      ) : (
                        <>
                          <Sparkles aria-hidden="true" className="h-4 w-4" />
                          Import questions
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {categories.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-white px-6 py-12 text-center">
                <ListChecks aria-hidden="true" className="mx-auto h-7 w-7 text-muted-foreground" />
                <p className="mt-3 text-sm font-semibold text-foreground">No questions yet</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Add a category manually or import an existing rubric above.
                </p>
                <button
                  type="button"
                  onClick={addCategory}
                  className="mt-4 inline-flex items-center gap-2 rounded-xl border border-border bg-white px-4 py-2.5 text-sm font-semibold text-foreground transition hover:border-primary/40 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Plus aria-hidden="true" className="h-4 w-4" />
                  Add first category
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {categories.map((category, categoryIndex) => {
                  const categoryPoints = category.criteria.reduce(
                    (sum, item) => sum + (Number(item.points) || 0),
                    0
                  );
                  const expanded = expandedCat === categoryIndex;
                  return (
                    <div
                      key={category.criteria[0]?.id ?? `${category.name}-${categoryIndex}`}
                      className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm"
                    >
                      <div className="flex items-center gap-3 bg-secondary/30 px-4 py-3 sm:px-5">
                        <div className="min-w-0 flex-1">
                          <label
                            className="sr-only"
                            htmlFor={`rubric-category-${categoryIndex}`}
                          >
                            Category {categoryIndex + 1} name
                          </label>
                          <input
                            id={`rubric-category-${categoryIndex}`}
                            value={category.name}
                            onChange={(event) => {
                              updateCategory(categoryIndex, "name", event.target.value);
                              setEditorError(null);
                            }}
                            className="w-full border-none bg-transparent text-sm font-semibold text-foreground outline-none focus-visible:rounded focus-visible:ring-2 focus-visible:ring-ring"
                          />
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {category.criteria.length} question{category.criteria.length === 1 ? "" : "s"}
                            {" · "}
                            {categoryPoints} points
                          </p>
                        </div>
                        <button
                          type="button"
                          aria-label={`Delete ${category.name || `category ${categoryIndex + 1}`}`}
                          onClick={() => removeCategory(categoryIndex)}
                          className="rounded-lg p-2 text-muted-foreground transition hover:bg-red-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
                        >
                          <Trash2 aria-hidden="true" className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          aria-label={`${expanded ? "Collapse" : "Expand"} ${category.name || `category ${categoryIndex + 1}`}`}
                          aria-expanded={expanded}
                          aria-controls={`rubric-category-panel-${categoryIndex}`}
                          onClick={() => setExpandedCat(expanded ? null : categoryIndex)}
                          className="rounded-lg p-2 text-muted-foreground transition hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {expanded
                            ? <ChevronUp aria-hidden="true" className="h-4 w-4" />
                            : <ChevronDown aria-hidden="true" className="h-4 w-4" />}
                        </button>
                      </div>

                      {expanded && (
                        <div
                          id={`rubric-category-panel-${categoryIndex}`}
                          className="space-y-5 border-t border-border p-4 sm:p-5"
                        >
                          <div>
                            <label
                              htmlFor={`rubric-category-description-${categoryIndex}`}
                              className="block text-xs font-semibold text-foreground"
                            >
                              Category guidance
                            </label>
                            <input
                              id={`rubric-category-description-${categoryIndex}`}
                              value={category.description}
                              onChange={(event) => updateCategory(
                                categoryIndex,
                                "description",
                                event.target.value
                              )}
                              placeholder="What should evaluators look for in this category?"
                              className="mt-1.5 w-full rounded-xl border border-border bg-input-background px-3 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-ring"
                            />
                          </div>

                          <fieldset className="space-y-3">
                            <legend className="text-xs font-semibold text-foreground">
                              Scoring questions
                            </legend>
                            {category.criteria.map((item, itemIndex) => (
                              <div
                                key={item.id}
                                className="rounded-xl border border-border bg-[#fcfcfd] p-3"
                              >
                                <div className="grid gap-2 sm:grid-cols-[1fr_90px_auto]">
                                  <div>
                                    <label
                                      htmlFor={`rubric-question-${categoryIndex}-${itemIndex}`}
                                      className="sr-only"
                                    >
                                      Question {itemIndex + 1}
                                    </label>
                                    <input
                                      id={`rubric-question-${categoryIndex}-${itemIndex}`}
                                      value={item.text}
                                      onChange={(event) => {
                                        updateCriterion(
                                          categoryIndex,
                                          itemIndex,
                                          "text",
                                          event.target.value
                                        );
                                        setEditorError(null);
                                      }}
                                      placeholder="What should the agent demonstrate?"
                                      className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-ring"
                                    />
                                  </div>
                                  <div>
                                    <label
                                      htmlFor={`rubric-points-${categoryIndex}-${itemIndex}`}
                                      className="sr-only"
                                    >
                                      Question {itemIndex + 1} points
                                    </label>
                                    <div className="relative">
                                      <input
                                        id={`rubric-points-${categoryIndex}-${itemIndex}`}
                                        type="number"
                                        min={0}
                                        value={item.points}
                                        onChange={(event) => updateCriterion(
                                          categoryIndex,
                                          itemIndex,
                                          "points",
                                          Number.parseInt(event.target.value, 10) || 0
                                        )}
                                        className="w-full rounded-lg border border-border bg-white py-2 pl-3 pr-8 text-sm font-semibold outline-none transition focus:border-primary focus:ring-2 focus:ring-ring"
                                      />
                                      <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">
                                        pts
                                      </span>
                                    </div>
                                  </div>
                                  <button
                                    type="button"
                                    aria-label={`Remove question ${itemIndex + 1}`}
                                    onClick={() => removeCriterion(categoryIndex, itemIndex)}
                                    className="self-start rounded-lg p-2.5 text-muted-foreground transition hover:bg-red-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
                                  >
                                    <Trash2 aria-hidden="true" className="h-4 w-4" />
                                  </button>
                                </div>
                                <label
                                  htmlFor={`rubric-guidance-${categoryIndex}-${itemIndex}`}
                                  className="sr-only"
                                >
                                  Question {itemIndex + 1} scoring guidance
                                </label>
                                <input
                                  id={`rubric-guidance-${categoryIndex}-${itemIndex}`}
                                  value={item.note}
                                  onChange={(event) => updateCriterion(
                                    categoryIndex,
                                    itemIndex,
                                    "note",
                                    event.target.value
                                  )}
                                  placeholder="Optional scoring guidance"
                                  className="mt-2 w-full rounded-lg border border-border bg-white px-3 py-2 text-xs outline-none transition focus:border-primary focus:ring-2 focus:ring-ring"
                                />
                              </div>
                            ))}
                            <button
                              type="button"
                              onClick={() => addCriterion(categoryIndex)}
                              className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-primary transition hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                              <Plus aria-hidden="true" className="h-3.5 w-3.5" />
                              Add question
                            </button>
                          </fieldset>
                        </div>
                      )}
                    </div>
                  );
                })}

                <button
                  type="button"
                  onClick={addCategory}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-white px-4 py-3 text-sm font-semibold text-muted-foreground transition hover:border-primary/50 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Plus aria-hidden="true" className="h-4 w-4" />
                  Add category
                </button>
              </div>
            )}

            {editorError && (
              <div
                role="alert"
                className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
              >
                {editorError}
              </div>
            )}
            {baselineTotalPoints !== null && !pointsMatch && (
              <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3">
                <AlertTriangle
                  aria-hidden="true"
                  className="mt-0.5 h-4 w-4 shrink-0 text-amber-600"
                />
                <p className="text-xs text-amber-700">
                  The imported rubric contained {baselineTotalPoints} points. The current questions
                  total {totalPoints}; match the original total before activating it.
                </p>
              </div>
            )}
          </section>

          <section
            id="rubric-panel-advanced"
            role="tabpanel"
            aria-labelledby="rubric-tab-advanced"
            hidden={activeTab !== "advanced"}
            className="space-y-5"
          >
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-lg font-bold text-foreground">Advanced settings</h3>
                <span className="rounded-full border border-border bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                  Optional
                </span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Review or customize processing settings. Every selected provider and model is included in the estimated processing cost below.
              </p>
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
              <div className="space-y-5 rounded-2xl border border-border bg-white p-5 shadow-sm">
                <div>
                  <label
                    htmlFor="rubric-analysis-model"
                    className="block text-sm font-semibold text-foreground"
                  >
                    Analysis model
                  </label>
                  <select
                    id="rubric-analysis-model"
                    value={analysisModel}
                    onChange={(event) => setAnalysisModel(event.target.value as AnalysisModelId)}
                    className="mt-2 w-full rounded-xl border border-border bg-input-background px-3 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-ring"
                  >
                    {(Object.keys(AI_PROVIDER_LABELS) as AiProvider[]).map((provider) => (
                      <optgroup key={provider} label={AI_PROVIDER_LABELS[provider]}>
                        {ANALYSIS_MODELS
                          .filter((model) => model.provider === provider)
                          .map((model) => (
                            <option key={model.id} value={model.id}>{model.label}</option>
                          ))}
                      </optgroup>
                    ))}
                  </select>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Scores each session against this rubric.
                  </p>
                </div>

                <div>
                  <label
                    htmlFor="rubric-name-extraction-model"
                    className="block text-sm font-semibold text-foreground"
                  >
                    Name extraction model
                  </label>
                  <select
                    id="rubric-name-extraction-model"
                    value={nameExtractionModel}
                    onChange={(event) => setNameExtractionModel(event.target.value as AnalysisModelId)}
                    className="mt-2 w-full rounded-xl border border-border bg-input-background px-3 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-ring"
                  >
                    {(Object.keys(AI_PROVIDER_LABELS) as AiProvider[]).map((provider) => (
                      <optgroup key={provider} label={AI_PROVIDER_LABELS[provider]}>
                        {ANALYSIS_MODELS
                          .filter((model) => model.provider === provider)
                          .map((model) => (
                            <option key={model.id} value={model.id}>{model.label}</option>
                          ))}
                      </optgroup>
                    ))}
                  </select>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Identifies the people in the conversation.
                  </p>
                </div>

                {canChangeTranscribeProvider && (
                  <div>
                    <label
                      htmlFor="rubric-transcribe-provider"
                      className="block text-sm font-semibold text-foreground"
                    >
                      Transcription provider
                    </label>
                    <select
                      id="rubric-transcribe-provider"
                      value={transcribeProvider}
                      onChange={(event) => setTranscribeProvider(
                        event.target.value as TranscribeProviderId
                      )}
                      className="mt-2 w-full rounded-xl border border-border bg-input-background px-3 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-ring"
                    >
                      {TRANSCRIBE_PROVIDERS.map((provider) => (
                        <option key={provider.id} value={provider.id}>{provider.label}</option>
                      ))}
                    </select>
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      Turns the recording into a transcript.
                    </p>
                  </div>
                )}

                <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-3 transition hover:bg-secondary/50">
                  <input
                    type="checkbox"
                    checked={audioUnderstandingEnabled}
                    onChange={(event) => {
                      const enabled = event.target.checked;
                      setAudioUnderstandingEnabled(enabled);
                      if (enabled && audioAnalysisModes.length === 0) {
                        setAudioAnalysisModes([...DEFAULT_AUDIO_ANALYSIS_MODES]);
                      }
                    }}
                    className="mt-0.5 h-4 w-4 accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                  <span>
                    <strong className="block text-sm text-foreground">
                      Audio insights
                    </strong>
                    <small className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                      Opt in to listening to the original recording for the audio-native signals you select below.
                    </small>
                  </span>
                </label>
                {audioUnderstandingEnabled && (
                  <div className="space-y-3 rounded-xl border border-primary/20 bg-primary/[0.03] p-3">
                    <div>
                      <label htmlFor="rubric-audio-model" className="block text-sm font-semibold text-foreground">
                        Audio analysis model
                      </label>
                      <select
                        id="rubric-audio-model"
                        value={audioAnalysisModel}
                        onChange={(event) => setAudioAnalysisModel(event.target.value as GeminiAudioModelId)}
                        className="mt-2 w-full rounded-xl border border-border bg-input-background px-3 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-ring"
                      >
                        {GEMINI_AUDIO_MODELS.map((model) => (
                          <option key={model.id} value={model.id}>{model.label}</option>
                        ))}
                      </select>
                      <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                        Reviews the recording for the signals you select.
                      </p>
                    </div>
                    <fieldset>
                      <legend className="text-sm font-semibold text-foreground">Include in audio analysis</legend>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        {AUDIO_ANALYSIS_MODES.map((mode) => (
                          <label key={mode} className="flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-white px-2.5 py-2 text-xs font-medium text-foreground">
                            <input
                              type="checkbox"
                              checked={audioAnalysisModes.includes(mode)}
                              onChange={() => toggleAudioMode(mode)}
                              className="h-3.5 w-3.5 accent-primary"
                            />
                            <span className="relative min-w-0 flex-1 pr-5">
                              <span>{AUDIO_ANALYSIS_MODE_LABELS[mode]}</span>
                              <span className="group absolute right-0 top-1/2 inline-flex -translate-y-1/2">
                                <button
                                  type="button"
                                  aria-label={`About ${AUDIO_ANALYSIS_MODE_LABELS[mode]}`}
                                  aria-describedby={`audio-analysis-mode-${mode}-description`}
                                  onClick={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                  }}
                                  className="inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground transition hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                >
                                  <Info className="h-3.5 w-3.5" aria-hidden="true" />
                                </button>
                                <span
                                  id={`audio-analysis-mode-${mode}-description`}
                                  role="tooltip"
                                  className="pointer-events-none invisible absolute bottom-[calc(100%+0.5rem)] right-0 z-50 w-60 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-left text-xs font-normal leading-relaxed text-white opacity-0 shadow-xl transition-opacity group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100"
                                >
                                  {AUDIO_ANALYSIS_MODE_DESCRIPTIONS[mode]}
                                </span>
                              </span>
                            </span>
                          </label>
                        ))}
                      </div>
                      {audioAnalysisModes.length === 0 && (
                        <p className="mt-2 text-xs text-amber-700">Select at least one signal, or turn audio insights off.</p>
                      )}
                    </fieldset>
                  </div>
                )}

                <div className="rounded-xl border border-border bg-secondary/30 p-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm font-semibold text-foreground">Estimated processing cost</span>
                    <strong className="text-base tabular-nums text-foreground">
                      ${estimatedCost.totalUsdPerMinute.toFixed(3)}/min
                    </strong>
                  </div>
                  <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground sm:grid-cols-4">
                    <div><dt>Transcription</dt><dd className="font-medium text-foreground">${estimatedCost.transcriptionUsdPerMinute.toFixed(3)}/min</dd></div>
                    <div><dt>Text analysis</dt><dd className="font-medium text-foreground">${estimatedCost.textAnalysisUsdPerMinute.toFixed(3)}/min</dd></div>
                    <div><dt>Name extraction</dt><dd className="font-medium text-foreground">${estimatedCost.nameExtractionUsdPerMinute.toFixed(3)}/min</dd></div>
                    {estimatedCost.audioUnderstandingUsdPerMinute > 0 && (
                      <div><dt>Audio insights</dt><dd className="font-medium text-foreground">${estimatedCost.audioUnderstandingUsdPerMinute.toFixed(3)}/min</dd></div>
                    )}
                  </dl>
                </div>
              </div>

              <div className="space-y-5 rounded-2xl border border-border bg-white p-5 shadow-sm">
                <div>
                  <div className="mb-1.5 flex items-center justify-between gap-3">
                    <label
                      htmlFor="rubric-segmentation-prompt"
                      className="text-sm font-semibold text-foreground"
                    >
                      Segmentation prompt
                    </label>
                    <button
                      type="button"
                      onClick={() => setSegmentationPrompt(DEFAULT_SEGMENTATION_PROMPT)}
                      className="rounded px-1 text-xs font-semibold text-primary transition hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      Reset
                    </button>
                  </div>
                  <textarea
                    id="rubric-segmentation-prompt"
                    value={segmentationPrompt}
                    onChange={(event) => setSegmentationPrompt(event.target.value)}
                    rows={7}
                    className="w-full resize-y rounded-xl border border-border bg-input-background px-3 py-2.5 font-mono text-xs leading-relaxed outline-none transition focus:border-primary focus:ring-2 focus:ring-ring"
                  />
                </div>

                <div>
                  <div className="mb-1.5 flex items-center justify-between gap-3">
                    <label
                      htmlFor="rubric-analysis-prompt"
                      className="text-sm font-semibold text-foreground"
                    >
                      Analysis prompt
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setAnalysisPromptTouched(false);
                        setAnalysisPrompt(buildRubricAnalysisPrompt(
                          buildDefinitionPayload(categories, assignedPropertyIds)
                        ));
                      }}
                      className="rounded px-1 text-xs font-semibold text-primary transition hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      Reset
                    </button>
                  </div>
                  <textarea
                    id="rubric-analysis-prompt"
                    value={analysisPrompt}
                    onChange={(event) => {
                      setAnalysisPromptTouched(true);
                      setAnalysisPrompt(event.target.value);
                    }}
                    rows={9}
                    className="w-full resize-y rounded-xl border border-border bg-input-background px-3 py-2.5 font-mono text-xs leading-relaxed outline-none transition focus:border-primary focus:ring-2 focus:ring-ring"
                  />
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    The default prompt stays synchronized with your scoring questions until edited.
                  </p>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>

      <footer className="shrink-0 border-t border-border bg-white/95 shadow-[0_-8px_30px_rgba(15,23,42,0.05)] backdrop-blur">
        <div className="mx-auto flex w-full max-w-[1100px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <button
            type="button"
            disabled={saving || uploading}
            onClick={onClose}
            className="rounded-xl border border-border px-4 py-2.5 text-sm font-semibold text-muted-foreground transition hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
          >
            Cancel
          </button>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {!isEditing && activeTabIndex > 0 && (
              <button
                type="button"
                disabled={saving || uploading}
                onClick={goToPreviousCreateStep}
                className="inline-flex items-center gap-1.5 rounded-xl border border-border px-4 py-2.5 text-sm font-semibold text-muted-foreground transition hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
              >
                <ChevronLeft aria-hidden="true" className="h-4 w-4" />
                Back
              </button>
            )}

            {!isEditing && activeTabIndex < EDITOR_TABS.length - 1 ? (
              <button
                type="button"
                disabled={uploading}
                onClick={goToNextCreateStep}
                className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40"
              >
                Continue
                <ChevronRight aria-hidden="true" className="h-4 w-4" />
              </button>
            ) : (
              <button
                type={isEditing ? "submit" : "button"}
                disabled={saving || uploading}
                onClick={isEditing ? undefined : () => void saveRubric()}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40"
              >
                {saving ? (
                  <>
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    Saving…
                  </>
                ) : (
                  <>
                    <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
                    {isEditing ? "Save changes" : "Create rubric"}
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </footer>
    </motion.form>
  );
}
