import "server-only";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

import type { CreateRubricInput, Rubric, RubricDefinition, RubricSummary } from "@tour/shared";

import {
  countRubricQuestions,
  computeRubricTotalPoints,
  DEFAULT_RBG_RUBRIC_DEFINITION,
  DEFAULT_RBG_RUBRIC_DESCRIPTION,
  DEFAULT_RBG_RUBRIC_NAME
} from "./default-rubric";
import { getSupabaseServiceClient } from "./supabase";

const STORE_PATH = path.join(process.cwd(), ".codex", "rubrics-store.json");

type RubricRow = {
  id: string;
  name: string;
  description: string | null;
  source_file_url: string | null;
  source_file_name: string | null;
  template_text: string | null;
  definition_json: RubricDefinition;
  total_points: number;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

function mapSummary(row: RubricRow): RubricSummary {
  const definition = row.definition_json;
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    totalPoints: row.total_points,
    isDefault: row.is_default,
    sectionCount: definition.sections.length,
    questionCount: countRubricQuestions(definition),
    createdAt: row.created_at
  };
}

function mapRubric(row: RubricRow): Rubric {
  return {
    ...mapSummary(row),
    sourceFileUrl: row.source_file_url,
    sourceFileName: row.source_file_name,
    templateText: row.template_text,
    definition: row.definition_json,
    updatedAt: row.updated_at
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
    description: DEFAULT_RBG_RUBRIC_DESCRIPTION,
    definition: DEFAULT_RBG_RUBRIC_DEFINITION,
    isDefault: true
  });
}

export async function listRubrics(): Promise<RubricSummary[]> {
  try {
    const supabase = getSupabaseServiceClient();
    const { data, error } = await supabase
      .from("rubrics")
      .select("id,name,description,definition_json,total_points,is_default,created_at,updated_at")
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);
    const rows = (data ?? []) as RubricRow[];
    if (rows.length === 0) {
      await ensureDefaultRubric();
      return listRubrics();
    }
    return rows.map(mapSummary);
  } catch {
    const rows = await readLocalStore();
    if (rows.length === 0) {
      const id = randomUUID();
      const now = new Date().toISOString();
      const row: RubricRow = {
        id,
        name: DEFAULT_RBG_RUBRIC_NAME,
        description: DEFAULT_RBG_RUBRIC_DESCRIPTION,
        source_file_url: null,
        source_file_name: null,
        template_text: null,
        definition_json: DEFAULT_RBG_RUBRIC_DEFINITION,
        total_points: computeRubricTotalPoints(DEFAULT_RBG_RUBRIC_DEFINITION),
        is_default: true,
        created_at: now,
        updated_at: now
      };
      await writeLocalStore([row]);
      return [mapSummary(row)];
    }
    return rows.map(mapSummary);
  }
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
    return data ? mapRubric(data) : null;
  } catch {
    const rows = await readLocalStore();
    const row = rows.find((r) => r.id === rubricId);
    return row ? mapRubric(row) : null;
  }
}

export async function getDefaultRubric(): Promise<Rubric> {
  await ensureDefaultRubric();
  const all = await listRubrics();
  const defaultSummary = all.find((r) => r.isDefault) ?? all[0];
  if (!defaultSummary) throw new Error("No rubrics available.");
  const rubric = await getRubricById(defaultSummary.id);
  if (!rubric) throw new Error("Default rubric not found.");
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
  const totalPoints = computeRubricTotalPoints(input.definition);
  const now = new Date().toISOString();
  const payload = {
    name: input.name.trim(),
    description: input.description?.trim() ?? null,
    source_file_url: input.sourceFileUrl ?? null,
    source_file_name: input.sourceFileName ?? null,
    template_text: input.templateText ?? null,
    definition_json: input.definition,
    total_points: totalPoints,
    is_default: input.isDefault ?? false,
    updated_at: now
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
    return mapRubric(data);
  } catch {
    const rows = await readLocalStore();
    const row: RubricRow = {
      id: randomUUID(),
      ...payload,
      created_at: now
    } as RubricRow;
    if (row.is_default) {
      for (const r of rows) r.is_default = false;
    }
    rows.unshift(row);
    await writeLocalStore(rows);
    return mapRubric(row);
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
