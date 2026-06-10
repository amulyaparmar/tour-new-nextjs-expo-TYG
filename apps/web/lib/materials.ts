import "server-only";

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { getSupabaseServiceClient } from "./supabase";

export type MaterialType = "rubric" | "training" | "recording" | "other";

export type Material = {
  id: string;
  name: string;
  type: MaterialType;
  description: string;
  fileUrl: string | null;
  parsedText: string | null;
  sessionId: string | null;
  createdAt: string;
};

type MaterialRow = {
  id: string;
  name: string;
  type: MaterialType;
  description: string;
  file_url: string | null;
  parsed_text: string | null;
  session_id: string | null;
  created_at: string;
};

// ── Local fallback ──────────────────────────────────────
const STORE_PATH = path.join(process.cwd(), ".codex", "materials-store.json");

async function readLocalStore(): Promise<Material[]> {
  try {
    const raw = await readFile(STORE_PATH, "utf-8");
    return JSON.parse(raw) as Material[];
  } catch {
    return getDefaultMaterials();
  }
}

async function writeLocalStore(materials: Material[]) {
  await mkdir(path.dirname(STORE_PATH), { recursive: true });
  await writeFile(STORE_PATH, JSON.stringify(materials, null, 2));
}

function mapRow(row: MaterialRow): Material {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    description: row.description,
    fileUrl: row.file_url,
    parsedText: row.parsed_text,
    sessionId: row.session_id,
    createdAt: row.created_at
  };
}

// ── Public API ──────────────────────────────────────────

export async function listMaterials(): Promise<Material[]> {
  try {
    const supabase = getSupabaseServiceClient();
    const { data, error } = await supabase
      .from("materials")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;

    if (!data || data.length === 0) {
      const defaults = getDefaultMaterials();
      const rows = defaults.map((m) => ({
        id: m.id,
        name: m.name,
        type: m.type,
        description: m.description,
        file_url: m.fileUrl,
        parsed_text: m.parsedText,
        session_id: m.sessionId
      }));
      await supabase.from("materials").insert(rows as never);
      return defaults;
    }

    return (data as MaterialRow[]).map(mapRow);
  } catch {
    return readLocalStore();
  }
}

export async function getMaterial(id: string): Promise<Material | null> {
  try {
    const supabase = getSupabaseServiceClient();
    const { data, error } = await supabase
      .from("materials")
      .select("*")
      .eq("id", id)
      .maybeSingle<MaterialRow>();

    if (error) throw error;
    return data ? mapRow(data) : null;
  } catch {
    const materials = await readLocalStore();
    return materials.find((m) => m.id === id) ?? null;
  }
}

export async function createMaterial(input: {
  name: string;
  type: MaterialType;
  description: string;
  fileUrl?: string;
  parsedText?: string;
  sessionId?: string;
}): Promise<Material> {
  const payload = {
    name: input.name,
    type: input.type,
    description: input.description,
    file_url: input.fileUrl ?? null,
    parsed_text: input.parsedText ?? null,
    session_id: input.sessionId ?? null
  };

  try {
    const supabase = getSupabaseServiceClient();
    const { data, error } = await supabase
      .from("materials")
      .insert(payload as never)
      .select("*")
      .single<MaterialRow>();

    if (error || !data) throw error;
    return mapRow(data);
  } catch {
    const materials = await readLocalStore();
    const material: Material = {
      id: randomUUID(),
      name: input.name,
      type: input.type,
      description: input.description,
      fileUrl: input.fileUrl ?? null,
      parsedText: input.parsedText ?? null,
      sessionId: input.sessionId ?? null,
      createdAt: new Date().toISOString()
    };
    materials.push(material);
    await writeLocalStore(materials);
    return material;
  }
}

export async function findMaterialBySessionId(sessionId: string): Promise<Material | null> {
  try {
    const supabase = getSupabaseServiceClient();
    const { data, error } = await supabase
      .from("materials")
      .select("*")
      .eq("session_id", sessionId)
      .maybeSingle<MaterialRow>();

    if (error) throw error;
    return data ? mapRow(data) : null;
  } catch {
    const materials = await readLocalStore();
    return materials.find((m) => m.sessionId === sessionId) ?? null;
  }
}

export async function deleteMaterial(id: string): Promise<void> {
  try {
    const supabase = getSupabaseServiceClient();
    const { error } = await supabase.from("materials").delete().eq("id", id);
    if (error) throw error;
  } catch {
    const materials = await readLocalStore();
    const filtered = materials.filter((m) => m.id !== id);
    await writeLocalStore(filtered);
  }
}

function getDefaultMaterials(): Material[] {
  return [
    {
      id: "default-rubric-1",
      name: "Apartment In-Person Tour Rubric",
      type: "rubric",
      description: "Official RBG mystery shopping evaluation rubric — 200 points across 4 sections: The Greeting, Property Tour & Demonstration, Closing Techniques, Follow Up, plus Fair Housing compliance.",
      fileUrl: null,
      parsedText: [
        "=== THE GREETING (50 points) ===",
        "Q110. Stand and greet promptly / acknowledge if busy (10 pts)",
        "Q120. Introduce themselves (5 pts)",
        "Q130. Give undivided attention throughout tour (5 pts)",
        "Q140. Complete guest card / confirm information (10 pts)",
        "Q150. Ask: school classification, move-in date/term, how heard about property, 3 things looking for, telephone number (2 pts each, 10 pts max)",
        "Q160. Ask for photo ID before tour (5 pts)",
        "Q170. Overview of what tour will consist of (5 pts)",
        "",
        "=== PROPERTY TOUR & DEMONSTRATION (80 points) ===",
        "Q205. Take control of the presentation (5 pts)",
        "Q210. Use gathered information to personalize presentation (10 pts)",
        "Q215. Use prospect's name throughout (5 pts)",
        "Q220. Knowledgeable about apartment community (10 pts)",
        "Q225. Sell benefits and features of apartment and community (10 pts)",
        "Q230. Show clean, made-ready, comfortable-temp apartment/model (10 pts)",
        "Q235. Offer snack/refreshment from stocked fridge/freezer (5 pts)",
        "Q240. Highlight apartment features and show how they are beneficial (5 pts)",
        "Q245. Tailor presentation to prospect's needs (5 pts)",
        "Q255. Overcome objection stated during demonstration (10 pts)",
        "Q260. Inquire about other communities visited / positive comparison (5 pts)",
        "",
        "=== CLOSING TECHNIQUES (65 points) ===",
        "Q305. Sit prospect at computer/iPad and explain application details (15 pts)",
        "Q310. Well versed in all rental rates (5 pts)",
        "Q315. Attempt to sell premium amenities (view, carports, etc.) while reviewing floor plans/rates (5 pts)",
        "Q320. Discuss rental guarantor/qualification procedures (5 pts)",
        "Q325. Review floor plan and rate sheet (10 pts)",
        "Q330. Convey strong sense of urgency to rent today (5 pts)",
        "Q335. Ask if ready to sign the lease today (15 pts)",
        "Q340. Effectively uncover and overcome objections for not leasing (5 pts)",
        "",
        "=== FOLLOW UP (5 points) ===",
        "Q410. Follow-up email, phone call, or text within 24 hours (5 pts)",
        "",
        "=== FAIR HOUSING (Compliance — not scored) ===",
        "Q510. No steering or segregation attempts",
        "Q520. No discrimination of any kind"
      ].join("\n"),
      sessionId: null,
      createdAt: new Date().toISOString()
    },
    {
      id: "default-training-1",
      name: "Closing Techniques Guide",
      type: "training",
      description: "Best practices for closing apartment tours: assumptive close, urgency creation, application walkthrough, and lease-signing ask.",
      fileUrl: null,
      parsedText: null,
      sessionId: null,
      createdAt: new Date().toISOString()
    }
  ];
}
