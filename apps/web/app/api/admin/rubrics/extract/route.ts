import { NextResponse } from "next/server";

import { AdminAuthError, requireAdminContext } from "@/lib/admin-auth";
import { extractRubricFromFile, extractRubricFromTemplate } from "@/lib/rubric-extract";

export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const workspace = await requireAdminContext(request);
    if (workspace.membership.role === "member") {
      throw new AdminAuthError("Manager access is required to extract rubrics.", 403);
    }

    const contentType = request.headers.get("content-type") ?? "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file");
      if (!file || !(file instanceof Blob)) {
        return NextResponse.json({ error: "No file provided." }, { status: 400 });
      }

      const fileName = file instanceof File && file.name ? file.name : "rubric-template.txt";
      const extracted = await extractRubricFromFile(file, fileName);
      return NextResponse.json({ name: extracted.name, definition: extracted.definition });
    }

    const body = (await request.json()) as { text?: string; fileName?: string };
    const text = body.text?.trim();
    if (!text) {
      return NextResponse.json({ error: "text or file is required." }, { status: 400 });
    }

    const extracted = await extractRubricFromTemplate(text, body.fileName ?? "pasted-rubric.txt");
    return NextResponse.json({ name: extracted.name, definition: extracted.definition });
  } catch (caught) {
    return NextResponse.json(
      { error: caught instanceof Error ? caught.message : "Failed to extract rubric." },
      { status: caught instanceof AdminAuthError ? caught.status : 500 }
    );
  }
}
