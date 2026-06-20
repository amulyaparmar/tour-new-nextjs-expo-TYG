import "server-only";

import type { RubricDefinition } from "@tour/shared";
import { invokeClaudeTool, type ClaudeTool } from "./bedrock";
import { computeRubricTotalPoints } from "./default-rubric";

const MAX_PDF_BYTES = 20 * 1024 * 1024;

const EXTRACT_TOOL: ClaudeTool = {
  name: "submit_rubric",
  description: "Submit the structured evaluation rubric extracted from the template document.",
  input_schema: {
    type: "object",
    properties: {
      name: { type: "string", description: "Short rubric name, e.g. 'Apartment In-Person Tour'" },
      description: { type: "string", description: "One-sentence description of what this rubric evaluates" },
      scoringInstructions: { type: "string" },
      sections: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string", description: "kebab-case section id" },
            name: { type: "string" },
            maxPoints: { type: "number" },
            questions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string", description: "Question code if present, else generated e.g. Q101" },
                  question: { type: "string" },
                  maxPoints: { type: "number" },
                  guidance: { type: "string" }
                },
                required: ["id", "question", "maxPoints"]
              }
            }
          },
          required: ["id", "name", "maxPoints", "questions"]
        }
      },
      complianceQuestions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            question: { type: "string" },
            maxPoints: { type: "number" },
            guidance: { type: "string" }
          },
          required: ["id", "question", "maxPoints"]
        }
      }
    },
    required: ["name", "description", "sections"]
  }
};

const EXTRACT_SYSTEM = [
  "You extract structured evaluation rubrics from mystery-shopping or leasing evaluation forms.",
  "Read the template carefully and produce a complete machine-readable rubric.",
  "",
  "Rules:",
  "- Group questions into logical sections (e.g. Greeting, Tour, Closing).",
  "- Preserve question IDs/codes from the document when present (Q110, etc.).",
  "- Each section maxPoints must equal the sum of its question maxPoints.",
  "- Put fair housing / compliance items in complianceQuestions with maxPoints 0.",
  "- Include scoringInstructions summarizing how to score (yes/no, partial credit, etc.).",
  "- Do not invent questions that are not in the template.",
  "- If point values are missing, infer reasonable values or use 1 per question."
].join("\n");

export type ExtractedRubric = {
  name: string;
  description: string;
  definition: RubricDefinition;
  totalPoints: number;
  templateText: string | null;
};

function isPdfFile(file: Blob, fileName: string): boolean {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  const type = file.type.toLowerCase();
  return ext === "pdf" || type === "application/pdf";
}

/** Main entry: text files are read locally; PDFs are sent directly to Claude. */
export async function extractRubricFromFile(file: Blob, fileName: string): Promise<ExtractedRubric> {
  if (isPdfFile(file, fileName)) {
    return extractRubricFromPdfDocument(file, fileName);
  }

  const templateText = await readTemplateText(file, fileName);
  const extracted = await extractRubricFromTemplate(templateText, fileName);
  return { ...extracted, templateText };
}

export async function extractRubricFromTemplate(templateText: string, fileName?: string): Promise<Omit<ExtractedRubric, "templateText">> {
  const trimmed = templateText.trim();
  if (!trimmed) throw new Error("Template file is empty or unreadable.");

  const user = [
    fileName ? `File: ${fileName}` : "Uploaded rubric template",
    "",
    "=== TEMPLATE CONTENT ===",
    trimmed.slice(0, 120_000)
  ].join("\n");

  const raw = await invokeClaudeTool<Record<string, unknown>>({
    system: EXTRACT_SYSTEM,
    messages: [{ role: "user", content: user }],
    tool: EXTRACT_TOOL,
    maxTokens: 8192,
    temperature: 0.2
  });

  return buildExtractedRubric(raw);
}

async function extractRubricFromPdfDocument(file: Blob, fileName: string): Promise<ExtractedRubric> {
  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.byteLength > MAX_PDF_BYTES) {
    throw new Error("PDF is too large (max 20 MB). Try a smaller file or export as .txt.");
  }

  const base64 = buffer.toString("base64");

  const raw = await invokeClaudeTool<Record<string, unknown>>({
    system: EXTRACT_SYSTEM,
    messages: [{
      role: "user",
      content: [
        {
          type: "document",
          source: {
            type: "base64",
            media_type: "application/pdf",
            data: base64
          }
        },
        {
          type: "text",
          text: [
            `Extract the complete evaluation rubric from the attached PDF.`,
            fileName ? `File name: ${fileName}` : "",
            "Include every scored question, section, and compliance item you can find."
          ].filter(Boolean).join("\n")
        }
      ]
    }],
    tool: EXTRACT_TOOL,
    maxTokens: 8192,
    temperature: 0.2
  });

  const extracted = buildExtractedRubric(raw);
  return { ...extracted, templateText: null };
}

function buildExtractedRubric(raw: Record<string, unknown>): Omit<ExtractedRubric, "templateText"> {
  const definition = normalizeDefinition(raw);
  const totalPoints = computeRubricTotalPoints(definition);

  return {
    name: String(raw.name ?? "Custom Rubric").trim() || "Custom Rubric",
    description: String(raw.description ?? "Custom evaluation rubric").trim(),
    definition,
    totalPoints
  };
}

function normalizeDefinition(raw: Record<string, unknown>): RubricDefinition {
  const sections = Array.isArray(raw.sections) ? raw.sections : [];
  const normalizedSections = sections.map((section, si) => {
    const s = section as Record<string, unknown>;
    const questions = Array.isArray(s.questions) ? s.questions : [];
    const normalizedQuestions = questions.map((q, qi) => {
      const item = q as Record<string, unknown>;
      return {
        id: String(item.id ?? `Q${si + 1}${qi + 1}`),
        question: String(item.question ?? "").trim(),
        maxPoints: Number(item.maxPoints ?? 0),
        guidance: item.guidance ? String(item.guidance) : undefined
      };
    }).filter((q) => q.question);

    const maxPoints = Number(s.maxPoints ?? normalizedQuestions.reduce((sum, q) => sum + q.maxPoints, 0));

    return {
      id: String(s.id ?? `section-${si + 1}`),
      name: String(s.name ?? `Section ${si + 1}`),
      maxPoints,
      questions: normalizedQuestions
    };
  }).filter((s) => s.questions.length > 0);

  if (normalizedSections.length === 0) {
    throw new Error("Could not extract any rubric sections from the template.");
  }

  const compliance = Array.isArray(raw.complianceQuestions) ? raw.complianceQuestions : [];

  return {
    sections: normalizedSections,
    complianceQuestions: compliance.map((q, i) => {
      const item = q as Record<string, unknown>;
      return {
        id: String(item.id ?? `C${i + 1}`),
        question: String(item.question ?? ""),
        maxPoints: 0,
        guidance: item.guidance ? String(item.guidance) : "Flag only — do not deduct points"
      };
    }).filter((q) => q.question),
    scoringInstructions: raw.scoringInstructions ? String(raw.scoringInstructions) : undefined
  };
}

export async function readTemplateText(file: Blob, fileName: string): Promise<string> {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  const type = file.type.toLowerCase();

  if (isPdfFile(file, fileName)) {
    throw new Error("PDF files are processed directly by AI — use extractRubricFromFile instead.");
  }

  if (type.startsWith("text/") || ext === "txt" || ext === "md" || ext === "csv") {
    return await file.text();
  }

  if (ext === "json") {
    const text = await file.text();
    try {
      const parsed = JSON.parse(text) as { templateText?: string; text?: string; content?: string };
      return parsed.templateText ?? parsed.text ?? parsed.content ?? text;
    } catch {
      return text;
    }
  }

  throw new Error("Unsupported file type. Upload PDF, TXT, MD, CSV, or JSON.");
}
