import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { extractRubricFromFile } from "@/lib/rubric-extract";
import { createRubric } from "@/lib/rubrics";
import { storeRecording } from "@/lib/storage";

export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const nameOverride = String(formData.get("name") ?? "").trim();
    const descriptionOverride = String(formData.get("description") ?? "").trim();

    if (!file || !(file instanceof Blob)) {
      return NextResponse.json({ error: "No file provided." }, { status: 400 });
    }

    const fileName = file instanceof File && file.name ? file.name : "rubric-template.txt";
    const extracted = await extractRubricFromFile(file, fileName);

    const fileUrl = await storeRecording(`rubric-${randomUUID()}`, file);

    const rubric = await createRubric({
      name: nameOverride || extracted.name,
      description: descriptionOverride || extracted.description,
      definition: extracted.definition,
      sourceFileUrl: fileUrl,
      sourceFileName: fileName,
      templateText: extracted.templateText?.slice(0, 50_000) ?? null
    });

    return NextResponse.json({ rubric, extracted }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to upload rubric template." },
      { status: 500 }
    );
  }
}
