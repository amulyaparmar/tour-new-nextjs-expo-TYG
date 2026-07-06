import { NextResponse } from "next/server";

import { AdminAuthError, requireAdminContext } from "@/lib/admin-auth";
import { extractRubricFromFile } from "@/lib/rubric-extract";
import { createRubric } from "@/lib/rubrics";
import {
  downloadStorageObject,
  getRecordingPlaybackPath,
  storageObjectExists,
} from "@/lib/storage";
import { getSupabaseServiceClient } from "@/lib/supabase";

export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const workspace = await requireAdminContext(request);
    if (workspace.membership.role === "member") {
      throw new AdminAuthError("Manager access is required to upload rubrics.", 403);
    }

    const body = (await request.json()) as {
      objectKey?: string;
      storageId?: string;
      fileName?: string;
      name?: string;
    };

    const objectKey = String(body.objectKey ?? "").trim();
    const fileName = String(body.fileName ?? "rubric-template.txt").trim() || "rubric-template.txt";
    const nameOverride = String(body.name ?? "").trim();

    if (!objectKey || !objectKey.startsWith("rubric-")) {
      return NextResponse.json({ error: "Invalid upload object key." }, { status: 400 });
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
    const storageId = objectKey.replace(/\.[^.]+$/, "");
    const fileUrl = getRecordingPlaybackPath(storageId);

    const rubric = await createRubric({
      name: nameOverride || extracted.name,
      definition: extracted.definition,
      sourceUrl: fileUrl,
    });

    const supabase = getSupabaseServiceClient();
    const { error: rubricError } = await supabase
      .from("rubrics")
      .update({ company_id: workspace.membership.companyId } as never)
      .eq("id", rubric.id);
    if (rubricError) throw new Error(rubricError.message);

    const { error: assignmentError } = await supabase
      .from("rubric_communities")
      .upsert({
        rubric_id: rubric.id,
        property_id: workspace.community.id,
      } as never);
    if (assignmentError) throw new Error(assignmentError.message);

    return NextResponse.json({ rubric }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to finalize upload." },
      { status: error instanceof AdminAuthError ? error.status : 500 }
    );
  }
}
