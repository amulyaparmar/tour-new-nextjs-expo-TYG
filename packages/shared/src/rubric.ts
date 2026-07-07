import type { AnalysisModelId } from "./ai-models";
import type { TranscribeProviderId } from "./transcribe-providers";

export type RubricItem = {
  id: string;
  text: string;
  points: number;
  note?: string;
};

export type RubricSection = {
  name: string;
  items: RubricItem[];
};

/** Scored sections + optional compliance flags + optional scoring notes. */
export type RubricDefinition = {
  sections: RubricSection[];
  compliance?: RubricItem[];
  notes?: string;
};

export type Rubric = {
  id: string;
  name: string;
  definition: RubricDefinition;
  /** Standardized model id for AI rubric analysis (mapped to provider at runtime). */
  analysisModel: AnalysisModelId;
  /** Transcription provider used when processing sessions with this rubric. */
  transcribeProvider: TranscribeProviderId;
  /** Gemini-only multimodal audio insights (sentiment, emotion, ambience). */
  audioUnderstandingEnabled: boolean;
  /** Preset id or custom label describing the session format this rubric targets. */
  sessionType: string;
  /** Optional override for the segmentation system prompt. */
  segmentationPrompt: string | null;
  /** Optional override for the analysis system prompt. */
  analysisPrompt: string | null;
  sourceUrl: string | null;
  isDefault: boolean;
  createdAt: string;
};

export type CreateRubricInput = {
  name: string;
  definition: RubricDefinition;
  analysisModel?: AnalysisModelId;
  transcribeProvider?: TranscribeProviderId;
  audioUnderstandingEnabled?: boolean;
  sessionType?: string;
  segmentationPrompt?: string | null;
  analysisPrompt?: string | null;
  sourceUrl?: string | null;
  isDefault?: boolean;
};

export function sectionPoints(section: RubricSection): number {
  return section.items.reduce((sum, item) => sum + item.points, 0);
}

export function rubricTotalPoints(definition: RubricDefinition): number {
  return definition.sections.reduce((sum, section) => sum + sectionPoints(section), 0);
}

export function rubricItemCount(definition: RubricDefinition): number {
  const scored = definition.sections.reduce((sum, section) => sum + section.items.length, 0);
  const compliance = definition.compliance?.length ?? 0;
  return scored + compliance;
}

/** Accept legacy DB/extraction shapes and normalize to the current schema. */
export function normalizeRubricDefinition(raw: unknown): RubricDefinition {
  if (!raw || typeof raw !== "object") {
    return { sections: [] };
  }

  const obj = raw as Record<string, unknown>;

  if (Array.isArray(obj.sections)) {
    const sections = obj.sections.map((section) => {
      const s = section as Record<string, unknown>;
      const questions = Array.isArray(s.questions) ? s.questions : Array.isArray(s.items) ? s.items : [];
      const items = questions.map((q, qi) => {
        const item = q as Record<string, unknown>;
        return {
          id: String(item.id ?? `Q${qi + 1}`),
          text: String(item.text ?? item.question ?? "").trim(),
          points: Number(item.points ?? item.maxPoints ?? 0),
          note: item.note ? String(item.note) : item.guidance ? String(item.guidance) : undefined
        };
      }).filter((item) => item.text);

      return {
        name: String(s.name ?? "Section"),
        items
      };
    }).filter((section) => section.items.length > 0);

    const complianceRaw = Array.isArray(obj.compliance)
      ? obj.compliance
      : Array.isArray(obj.complianceQuestions)
        ? obj.complianceQuestions
        : [];

    const compliance = complianceRaw.map((q, i) => {
      const item = q as Record<string, unknown>;
      return {
        id: String(item.id ?? `C${i + 1}`),
        text: String(item.text ?? item.question ?? ""),
        points: 0,
        note: item.note ? String(item.note) : item.guidance ? String(item.guidance) : undefined
      };
    }).filter((item) => item.text);

    return {
      sections,
      compliance: compliance.length > 0 ? compliance : undefined,
      notes: obj.notes ? String(obj.notes) : obj.scoringInstructions ? String(obj.scoringInstructions) : undefined
    };
  }

  return { sections: [] };
}
