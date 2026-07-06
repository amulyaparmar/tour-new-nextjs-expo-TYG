import "server-only";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

import type { CreateRubricInput, Rubric, RubricDefinition } from "@tour/shared";
import { normalizeAnalysisModelId, normalizeRubricDefinition } from "@tour/shared";

import { DEFAULT_RBG_RUBRIC_DEFINITION, DEFAULT_RBG_RUBRIC_NAME } from "./default-rubric";
import { defaultAnalysisModelId } from "./resolve-analysis-model";
import { getSupabaseServiceClient } from "./supabase";

const STORE_PATH = path.join(process.cwd(), ".codex", "rubrics-store.json");

type RubricRow = {
  id: string;
  name: string;
  definition: RubricDefinition;
  analysis_model?: string | null;
  source_url: string | null;
  is_default: boolean;
  created_at: string;
  /** Legacy columns — may exist before migration. */
  definition_json?: unknown;
  source_file_url?: string | null;
};

function mapRow(row: RubricRow): Rubric {
  const rawDefinition = row.definition ?? row.definition_json;
  return {
    id: row.id,
    name: row.name,
    definition: normalizeRubricDefinition(rawDefinition),
    analysisModel: normalizeAnalysisModelId(row.analysis_model, defaultAnalysisModelId()),
    sourceUrl: row.source_url ?? row.source_file_url ?? null,
    isDefault: row.is_default,
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
        source_url: null,
        is_default: true,
        created_at: now
      };
      await writeLocalStore([row]);
      return [mapRow(row)];
    }
    return rows.map(mapRow);
  }
}

export async function listRubricsForCommunity(communityId: string): Promise<Rubric[]> {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from("rubric_communities")
    .select("rubric_id")
    .eq("property_id", communityId);
  if (error) throw new Error(error.message);
  const ids = new Set(
    ((data ?? []) as unknown as Array<{ rubric_id: string }>)
      .map((row) => String(row.rubric_id))
  );
  return (await listRubrics()).filter((rubric) => ids.has(rubric.id));
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
  const now = new Date().toISOString();
  const payload = {
    name: input.name.trim(),
    definition,
    analysis_model: analysisModel,
    source_url: input.sourceUrl ?? null,
    is_default: input.isDefault ?? false
  };

  try {
    const supabase = getSupabaseServiceClient();

    if (input.isDefault) {
      await supabase.from("rubrics").update({ is_default: false } as never).eq("is_default", true);
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

  const nextDefinition = input.definition === undefined
    ? existing.definition
    : normalizeRubricDefinition(input.definition);
  const payload = {
    name: input.name?.trim() || existing.name,
    definition: nextDefinition,
    analysis_model: input.analysisModel === undefined
      ? existing.analysisModel
      : normalizeAnalysisModelId(input.analysisModel, defaultAnalysisModelId()),
    source_url: input.sourceUrl === undefined ? existing.sourceUrl : input.sourceUrl,
    is_default: input.isDefault ?? existing.isDefault
  };

  try {
    const supabase = getSupabaseServiceClient();

    if (input.isDefault) {
      await supabase.from("rubrics").update({ is_default: false } as never).eq("is_default", true);
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

  try {
    const supabase = getSupabaseServiceClient();
    const { error } = await supabase.from("rubrics").delete().eq("id", rubricId);
    if (error) throw new Error(error.message);
  } catch {
    const rows = await readLocalStore();
    await writeLocalStore(rows.filter((r) => r.id !== rubricId));
  }
}
