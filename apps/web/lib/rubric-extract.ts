import "server-only";

import type { RubricDefinition } from "@tour/shared";
import { normalizeRubricDefinition, rubricTotalPoints } from "@tour/shared";
import { invokeClaudeTool, type ClaudeTool } from "./bedrock";

const MAX_PDF_BYTES = 20 * 1024 * 1024;

const EXTRACT_TOOL: ClaudeTool = {
  name: "submit_rubric",
  description: "Submit the structured evaluation rubric extracted from the template document.",
  input_schema: {
    type: "object",
    properties: {
      name: { type: "string" },
      notes: { type: "string", description: "How to score (yes/no, partial credit, etc.)" },
      sections: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            items: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  text: { type: "string" },
                  points: { type: "number" },
                  note: { type: "string" }
                },
                required: ["id", "text", "points"]
              }
            }
          },
          required: ["name", "items"]
        }
      },
      compliance: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            text: { type: "string" },
            note: { type: "string" }
          },
          required: ["id", "text"]
        }
      }
    },
    required: ["name", "sections"]
  }
};

const EXTRACT_SYSTEM = [
  "You extract structured evaluation rubrics from mystery-shopping or leasing evaluation forms.",
  "Read the template carefully and produce a complete machine-readable rubric.",
  "",
  "Rules:",
  "- Group items into logical sections (e.g. Greeting, Tour, Closing).",
  "- Preserve question IDs/codes from the document when present (Q110, etc.).",
  "- Put fair housing / compliance items in compliance with points omitted (they are flag-only).",
  "- Include notes summarizing how to score.",
  "- Do not invent items that are not in the template.",
  "- If point values are missing, infer reasonable values or use 1 per item."
].join("\n");

export type ExtractedRubric = {
  name: string;
  definition: RubricDefinition;
};

function isPdfFile(file: Blob, fileName: string): boolean {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  const type = file.type.toLowerCase();
  return ext === "pdf" || type === "application/pdf";
}

export async function extractRubricFromFile(file: Blob, fileName: string): Promise<ExtractedRubric> {
  if (isPdfFile(file, fileName)) {
    return extractRubricFromPdfDocument(file, fileName);
  }

  const templateText = await readTemplateText(file, fileName);
  return extractRubricFromTemplate(templateText, fileName);
}

export async function extractRubricFromTemplate(templateText: string, fileName?: string): Promise<ExtractedRubric> {
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
            data: buffer.toString("base64")
          }
        },
        {
          type: "text",
          text: [
            "Extract the complete evaluation rubric from the attached PDF.",
            fileName ? `File name: ${fileName}` : "",
            "Include every scored item, section, and compliance item you can find."
          ].filter(Boolean).join("\n")
        }
      ]
    }],
    tool: EXTRACT_TOOL,
    maxTokens: 8192,
    temperature: 0.2
  });

  return buildExtractedRubric(raw);
}

function buildExtractedRubric(raw: Record<string, unknown>): ExtractedRubric {
  const definition = normalizeRubricDefinition(raw);
  if (definition.sections.length === 0) {
    throw new Error("Could not extract any rubric sections from the template.");
  }

  rubricTotalPoints(definition); // validates structure is usable

  return {
    name: String(raw.name ?? "Custom Rubric").trim() || "Custom Rubric",
    definition
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
