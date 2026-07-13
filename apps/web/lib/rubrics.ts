import "server-only";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

import type { CreateRubricInput, Rubric, RubricDefinition } from "@tour/shared";
import {
  DEFAULT_RUBRIC_SESSION_TYPE,
  normalizeAnalysisModelId,
  normalizeRubricDefinition,
  normalizeTranscribeProviderId,
} from "@tour/shared";

import { DEFAULT_RBG_RUBRIC_DEFINITION, DEFAULT_RBG_RUBRIC_NAME } from "./default-rubric";
import { defaultAnalysisModelId } from "./resolve-analysis-model";
import { getSupabaseServiceClient } from "./supabase";

const STORE_PATH = path.join(process.cwd(), ".codex", "rubrics-store.json");

type RubricRow = {
  id: string;
  name: string;
  definition: RubricDefinition;
  analysis_model?: string | null;
  transcribe_provider?: string | null;
  audio_understanding_enabled?: boolean | null;
  session_type?: string | null;
  segmentation_prompt?: string | null;
  analysis_prompt?: string | null;
  source_url: string | null;
  is_default: boolean;
  property_id?: string | null;
  is_template?: boolean | null;
  template_source_id?: string | null;
  bootstrap_key?: string | null;
  created_at: string;
  /** Legacy columns — may exist before migration. */
  definition_json?: unknown;
  source_file_url?: string | null;
};

function normalizeSessionType(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed || DEFAULT_RUBRIC_SESSION_TYPE;
}

function mapRow(row: RubricRow): Rubric {
  const rawDefinition = row.definition ?? row.definition_json;
  return {
    id: row.id,
    name: row.name,
    definition: normalizeRubricDefinition(rawDefinition),
    analysisModel: normalizeAnalysisModelId(row.analysis_model, defaultAnalysisModelId()),
    transcribeProvider: normalizeTranscribeProviderId(row.transcribe_provider),
    audioUnderstandingEnabled: Boolean(row.audio_understanding_enabled),
    sessionType: normalizeSessionType(row.session_type),
    segmentationPrompt: row.segmentation_prompt?.trim() || null,
    analysisPrompt: row.analysis_prompt?.trim() || null,
    sourceUrl: row.source_url ?? row.source_file_url ?? null,
    isDefault: row.is_default,
    propertyId: row.property_id ?? null,
    isTemplate: Boolean(row.is_template),
    templateSourceId: row.template_source_id ?? null,
    createdAt: row.created_at
  };
}

async function readLocalStore(): Promise<RubricRow[]> {
  try {
    const raw = await readFile(STORE_PATH, "utf-8");
    return JSON.parse(raw) as RubricRow[];
  } catch {
    return [];
  }
}

async function writeLocalStore(rows: RubricRow[]) {
  await mkdir(path.dirname(STORE_PATH), { recursive: true });
  await writeFile(STORE_PATH, JSON.stringify(rows, null, 2), "utf-8");
}

async function ensureDefaultRubric(): Promise<void> {
  const existing = await listRubrics();
  if (existing.some((r) => r.isDefault)) return;

  await createRubric({
    name: DEFAULT_RBG_RUBRIC_NAME,
    definition: DEFAULT_RBG_RUBRIC_DEFINITION,
    isDefault: true
  });
}

export async function listRubrics(): Promise<Rubric[]> {
  try {
    const supabase = getSupabaseServiceClient();
    const { data, error } = await supabase
      .from("rubrics")
      .select("*")
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);
    const rows = (data ?? []) as RubricRow[];
    if (rows.length === 0) {
      await ensureDefaultRubric();
      return listRubrics();
    }
    return rows.map(mapRow);
  } catch {
    const rows = await readLocalStore();
    if (rows.length === 0) {
      const now = new Date().toISOString();
      const row: RubricRow = {
        id: randomUUID(),
        name: DEFAULT_RBG_RUBRIC_NAME,
        definition: DEFAULT_RBG_RUBRIC_DEFINITION,
        analysis_model: defaultAnalysisModelId(),
        transcribe_provider: "whisper",
        audio_understanding_enabled: false,
        source_url: null,
        is_default: true,
        property_id: null,
        is_template: true,
        template_source_id: null,
        created_at: now
      };
      await writeLocalStore([row]);
      return [mapRow(row)];
    }
    return rows.map(mapRow);
  }
}

export async function listRubricsForCommunity(propertyIds: string | string[]): Promise<Rubric[]> {
  const ids = Array.isArray(propertyIds) ? propertyIds : [propertyIds];
  return (await listRubrics()).filter((rubric) =>
    !rubric.isTemplate && Boolean(rubric.propertyId && ids.includes(rubric.propertyId))
  );
}

export async function listRubricTemplates(): Promise<Rubric[]> {
  return (await listRubrics()).filter((rubric) => rubric.isTemplate);
}

/**
 * Give a property its editable Tour rubric the first time it is opened.
 * `bootstrap_key` makes simultaneous login/switch requests collapse to one row.
 */
export async function ensurePropertyRubric(
  propertyId: string,
  compatibilityPropertyIds: string[] = []
): Promise<Rubric> {
  const supabase = getSupabaseServiceClient();
  const propertyIds = Array.from(new Set([propertyId, ...compatibilityPropertyIds].filter(Boolean)));
  const { data: existing, error: existingError } = await supabase
    .from("rubrics")
    .select("*")
    .eq("is_template", false)
    .in("property_id", propertyIds)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle<RubricRow>();
  if (existingError) throw new Error(existingError.message);
  if (existing) return mapRow(existing);

  const { data: templateRows, error: templateError } = await supabase
    .from("rubrics")
    .select("*")
    .eq("is_template", true)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true });
  if (templateError) throw new Error(templateError.message);
  const templates = (templateRows ?? []) as RubricRow[];
  const template =
    templates.find((row) => row.name.trim().toLowerCase() === "tour") ??
    templates.find((row) => /in-person tour/i.test(row.name) && !/^survey/i.test(row.name)) ??
    templates.find((row) => row.is_default) ??
    templates[0];
  if (!template) throw new Error("The frozen Tour rubric template is missing.");

  const bootstrapKey = `property:${propertyId}`;
  const payload = {
    name: "Tour",
    definition: normalizeRubricDefinition(template.definition ?? template.definition_json),
    analysis_model: normalizeAnalysisModelId(template.analysis_model, defaultAnalysisModelId()),
    transcribe_provider: normalizeTranscribeProviderId(template.transcribe_provider),
    audio_understanding_enabled: Boolean(template.audio_understanding_enabled),
    session_type: normalizeSessionType(template.session_type),
    segmentation_prompt: template.segmentation_prompt ?? null,
    analysis_prompt: template.analysis_prompt ?? null,
    source_url: template.source_url ?? template.source_file_url ?? null,
    is_default: false,
    property_id: propertyId,
    is_template: false,
    template_source_id: template.id,
    bootstrap_key: bootstrapKey,
  };
  const { data: inserted, error: insertError } = await supabase
    .from("rubrics")
    .upsert(payload as never, { onConflict: "bootstrap_key", ignoreDuplicates: true })
    .select("*")
    .maybeSingle<RubricRow>();
  if (insertError) throw new Error(insertError.message);
  if (inserted) return mapRow(inserted);

  const { data: raced, error: racedError } = await supabase
    .from("rubrics")
    .select("*")
    .eq("bootstrap_key", bootstrapKey)
    .single<RubricRow>();
  if (racedError || !raced) throw new Error(racedError?.message ?? "Could not create the property Tour rubric.");
  return mapRow(raced);
}

export async function getRubricById(rubricId: string): Promise<Rubric | null> {
  try {
    const supabase = getSupabaseServiceClient();
    const { data, error } = await supabase
      .from("rubrics")
      .select("*")
      .eq("id", rubricId)
      .maybeSingle<RubricRow>();

    if (error) throw new Error(error.message);
    return data ? mapRow(data) : null;
  } catch {
    const row = (await readLocalStore()).find((r) => r.id === rubricId);
    return row ? mapRow(row) : null;
  }
}

export async function getDefaultRubric(): Promise<Rubric> {
  await ensureDefaultRubric();
  const all = await listRubrics();
  const rubric = all.find((r) => r.isDefault) ?? all[0];
  if (!rubric) throw new Error("No rubrics available.");
  return rubric;
}

export async function getRubricForSession(rubricId: string | null | undefined): Promise<Rubric> {
  if (rubricId) {
    const rubric = await getRubricById(rubricId);
    if (rubric) return rubric;
  }
  return getDefaultRubric();
}

export async function createRubric(input: CreateRubricInput): Promise<Rubric> {
  const definition = normalizeRubricDefinition(input.definition);
  const analysisModel = normalizeAnalysisModelId(input.analysisModel, defaultAnalysisModelId());
  const transcribeProvider = normalizeTranscribeProviderId(input.transcribeProvider);
  const audioUnderstandingEnabled = transcribeProvider === "gemini" && Boolean(input.audioUnderstandingEnabled);
  const now = new Date().toISOString();
  const payload = {
    name: input.name.trim(),
    definition,
    analysis_model: analysisModel,
    transcribe_provider: transcribeProvider,
    audio_understanding_enabled: audioUnderstandingEnabled,
    session_type: normalizeSessionType(input.sessionType),
    segmentation_prompt: input.segmentationPrompt ?? null,
    analysis_prompt: input.analysisPrompt ?? null,
    source_url: input.sourceUrl ?? null,
    is_default: input.isDefault ?? false,
    property_id: input.propertyId ?? null,
    is_template: input.isTemplate ?? false,
    template_source_id: input.templateSourceId ?? null,
  };

  try {
    const supabase = getSupabaseServiceClient();

    if (input.isDefault) {
      await supabase
        .from("rubrics")
        .update({ is_default: false } as never)
        .eq("is_default", true)
        .eq("is_template", false);
    }

    const { data, error } = await supabase
      .from("rubrics")
      .insert(payload as never)
      .select("*")
      .single<RubricRow>();

    if (error || !data) throw new Error(error?.message ?? "Failed to create rubric");
    return mapRow(data);
  } catch {
    const rows = await readLocalStore();
    const row: RubricRow = {
      id: randomUUID(),
      ...payload,
      created_at: now
    };
    if (row.is_default) {
      for (const r of rows) r.is_default = false;
    }
    rows.unshift(row);
    await writeLocalStore(rows);
    return mapRow(row);
  }
}

export async function updateRubric(rubricId: string, input: Partial<CreateRubricInput>): Promise<Rubric> {
  const existing = await getRubricById(rubricId);
  if (!existing) throw new Error("Rubric not found.");
  if (existing.isTemplate) throw new Error("Frozen rubric templates cannot be edited. Clone this template instead.");

  const nextDefinition = input.definition === undefined
    ? existing.definition
    : normalizeRubricDefinition(input.definition);
  const nextTranscribeProvider = input.transcribeProvider === undefined
    ? existing.transcribeProvider
    : normalizeTranscribeProviderId(input.transcribeProvider);
  const nextAudioUnderstanding = input.audioUnderstandingEnabled === undefined
    ? existing.audioUnderstandingEnabled
    : Boolean(input.audioUnderstandingEnabled);
  const payload = {
    name: input.name?.trim() || existing.name,
    definition: nextDefinition,
    analysis_model: input.analysisModel === undefined
      ? existing.analysisModel
      : normalizeAnalysisModelId(input.analysisModel, defaultAnalysisModelId()),
    transcribe_provider: nextTranscribeProvider,
    audio_understanding_enabled: nextTranscribeProvider === "gemini" && nextAudioUnderstanding,
    session_type: input.sessionType === undefined
      ? existing.sessionType
      : normalizeSessionType(input.sessionType),
    segmentation_prompt: input.segmentationPrompt === undefined
      ? existing.segmentationPrompt
      : input.segmentationPrompt,
    analysis_prompt: input.analysisPrompt === undefined
      ? existing.analysisPrompt
      : input.analysisPrompt,
    source_url: input.sourceUrl === undefined ? existing.sourceUrl : input.sourceUrl,
    is_default: input.isDefault ?? existing.isDefault
  };

  try {
    const supabase = getSupabaseServiceClient();

    if (input.isDefault) {
      await supabase
        .from("rubrics")
        .update({ is_default: false } as never)
        .eq("is_default", true)
        .eq("is_template", false);
    }

    const { data, error } = await supabase
      .from("rubrics")
      .update(payload as never)
      .eq("id", rubricId)
      .select("*")
      .single<RubricRow>();

    if (error || !data) throw new Error(error?.message ?? "Failed to update rubric");
    return mapRow(data);
  } catch {
    const rows = await readLocalStore();
    const index = rows.findIndex((row) => row.id === rubricId);
    if (index === -1) throw new Error("Rubric not found.");

    if (payload.is_default) {
      for (const row of rows) row.is_default = false;
    }

    rows[index] = {
      ...rows[index]!,
      ...payload
    };
    await writeLocalStore(rows);
    return mapRow(rows[index]!);
  }
}

export async function deleteRubric(rubricId: string): Promise<void> {
  const existing = await getRubricById(rubricId);
  if (!existing) throw new Error("Rubric not found.");
  if (existing.isDefault) throw new Error("Cannot delete the default rubric.");
  if (existing.isTemplate) throw new Error("Frozen rubric templates cannot be deleted.");

  try {
    const supabase = getSupabaseServiceClient();
    const { error } = await supabase.from("rubrics").delete().eq("id", rubricId);
    if (error) throw new Error(error.message);
  } catch {
    const rows = await readLocalStore();
    await writeLocalStore(rows.filter((r) => r.id !== rubricId));
  }
}

export async function cloneRubricTemplate(
  templateId: string,
  propertyId: string,
  name?: string | null
): Promise<Rubric> {
  const template = await getRubricById(templateId);
  if (!template?.isTemplate) throw new Error("Rubric template not found.");
  return createRubric({
    name: name?.trim() || template.name,
    definition: template.definition,
    analysisModel: template.analysisModel,
    transcribeProvider: template.transcribeProvider,
    audioUnderstandingEnabled: template.audioUnderstandingEnabled,
    sessionType: template.sessionType,
    segmentationPrompt: template.segmentationPrompt,
    analysisPrompt: template.analysisPrompt,
    sourceUrl: template.sourceUrl,
    isDefault: false,
    propertyId,
    isTemplate: false,
    templateSourceId: template.id,
  });
}
