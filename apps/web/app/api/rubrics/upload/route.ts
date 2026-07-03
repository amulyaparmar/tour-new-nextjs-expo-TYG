import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { AdminAuthError, requireAdminContext } from "@/lib/admin-auth";
import { extractRubricFromFile } from "@/lib/rubric-extract";
import { createRubric } from "@/lib/rubrics";
import { storeRecording } from "@/lib/storage";
import { getSupabaseServiceClient } from "@/lib/supabase";

export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const workspace = await requireAdminContext(request);
    if (workspace.membership.role === "member") {
      throw new AdminAuthError("Manager access is required to upload rubrics.", 403);
    }
    const formData = await request.formData();
    const file = formData.get("file");
    const nameOverride = String(formData.get("name") ?? "").trim();

    if (!file || !(file instanceof Blob)) {
      return NextResponse.json({ error: "No file provided." }, { status: 400 });
    }

    const fileName = file instanceof File && file.name ? file.name : "rubric-template.txt";
    const extracted = await extractRubricFromFile(file, fileName);
    const fileUrl = await storeRecording(`rubric-${randomUUID()}`, file);

    const rubric = await createRubric({
      name: nameOverride || extracted.name,
      definition: extracted.definition,
      sourceUrl: fileUrl
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
      { error: error instanceof Error ? error.message : "Failed to upload rubric template." },
      { status: error instanceof AdminAuthError ? error.status : 500 }
    );
  }
}
