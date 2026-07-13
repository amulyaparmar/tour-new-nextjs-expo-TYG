import { NextResponse } from "next/server";

import { AdminAuthError, requireAdminContext } from "@/lib/admin-auth";
import { extractRubricFromFile, extractRubricFromTemplate } from "@/lib/rubric-extract";
import { downloadStorageObject, storageObjectExists } from "@/lib/storage";

export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const workspace = await requireAdminContext(request);
    if (workspace.teamMember.accessRole === "member") {
      throw new AdminAuthError("Manager access is required to extract rubrics.", 403);
    }

    const body = (await request.json()) as {
      text?: string;
      fileName?: string;
      objectKey?: string;
    };

    const text = body.text?.trim();
    if (text) {
      const extracted = await extractRubricFromTemplate(text, body.fileName ?? "pasted-rubric.txt");
      return NextResponse.json({ name: extracted.name, definition: extracted.definition });
    }

    const objectKey = String(body.objectKey ?? "").trim();
    const fileName = String(body.fileName ?? "rubric-template.txt").trim() || "rubric-template.txt";
    if (!objectKey || !objectKey.startsWith("extract-")) {
      return NextResponse.json({ error: "text or objectKey is required." }, { status: 400 });
    }

    const exists = await storageObjectExists(objectKey);
    if (!exists) {
      return NextResponse.json({ error: "Uploaded file not found in storage." }, { status: 400 });
    }

    const stored = await downloadStorageObject(objectKey);
    if (!stored) {
      return NextResponse.json({ error: "Could not read uploaded file." }, { status: 400 });
    }

    const file = new Blob([new Uint8Array(stored.buffer)], { type: stored.mimeType });
    const extracted = await extractRubricFromFile(file, fileName);
    return NextResponse.json({ name: extracted.name, definition: extracted.definition });
  } catch (caught) {
    return NextResponse.json(
      { error: caught instanceof Error ? caught.message : "Failed to extract rubric." },
      { status: caught instanceof AdminAuthError ? caught.status : 500 }
    );
  }
}
