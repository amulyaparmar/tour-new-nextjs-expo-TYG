import "server-only";

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

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

const STORE_PATH = path.join(process.cwd(), ".codex", "materials-store.json");

async function readStore(): Promise<Material[]> {
  try {
    const raw = await readFile(STORE_PATH, "utf-8");
    return JSON.parse(raw) as Material[];
  } catch {
    return getDefaultMaterials();
  }
}

async function writeStore(materials: Material[]) {
  await mkdir(path.dirname(STORE_PATH), { recursive: true });
  await writeFile(STORE_PATH, JSON.stringify(materials, null, 2));
}

export async function listMaterials(): Promise<Material[]> {
  return readStore();
}

export async function getMaterial(id: string): Promise<Material | null> {
  const materials = await readStore();
  return materials.find((m) => m.id === id) ?? null;
}

export async function createMaterial(input: {
  name: string;
  type: MaterialType;
  description: string;
  fileUrl?: string;
  parsedText?: string;
  sessionId?: string;
}): Promise<Material> {
  const materials = await readStore();
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
  await writeStore(materials);
  return material;
}

export async function findMaterialBySessionId(sessionId: string): Promise<Material | null> {
  const materials = await readStore();
  return materials.find((m) => m.sessionId === sessionId) ?? null;
}

export async function deleteMaterial(id: string): Promise<void> {
  const materials = await readStore();
  const filtered = materials.filter((m) => m.id !== id);
  await writeStore(filtered);
}

function getDefaultMaterials(): Material[] {
  return [
    {
      id: "default-rubric-1",
      name: "Apartment Tour Rubric",
      type: "rubric",
      description: "Default mystery shopping rubric with 8 sections: Greeting, Needs Discovery, Tour, Personalization, Objection Handling, Closing, Follow-Up, Compliance.",
      fileUrl: null,
      parsedText: [
        "Greeting & Introduction (0-100): Did the agent greet promptly? Introduce themselves? Give attention?",
        "Needs Discovery (0-100): Asked what customer wants? Move-in timeline? How they heard about property?",
        "Tour & Demonstration (0-100): Explained tour structure? Showed relevant features? Explained benefits?",
        "Personalization (0-100): Tailored tour to stated needs? Referenced prospect priorities?",
        "Objection Handling (0-100): Customer raised objection? Agent addressed properly?",
        "Closing (0-100): Created urgency? Asked for the close? Explained next steps?",
        "Follow-Up (0-100): Mentioned follow-up? Planned a follow-up?",
        "Compliance / Fair Housing (0-100): Avoided discriminatory language or steering?"
      ].join("\n"),
      sessionId: null,
      createdAt: new Date().toISOString()
    },
    {
      id: "default-training-1",
      name: "Closing Techniques Guide",
      type: "training",
      description: "Best practices for closing apartment tours: assumptive close, urgency creation, and next-step confirmation.",
      fileUrl: null,
      parsedText: null,
      sessionId: null,
      createdAt: new Date().toISOString()
    }
  ];
}
