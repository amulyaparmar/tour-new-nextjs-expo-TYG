import { NextResponse } from "next/server";

import { AdminAuthError, requireAdminContext } from "@/lib/admin-auth";
import { createRubric, listRubrics } from "@/lib/rubrics";
import { getSupabaseServiceClient } from "@/lib/supabase";

const RUBRICS_CACHE_CONTROL = "private, max-age=60, stale-while-revalidate=300";

export async function GET(request: Request) {
  try {
    const workspace = await requireAdminContext(request);
    const supabase = getSupabaseServiceClient();
    const { data: assignments, error } = await supabase
      .from("rubric_communities")
      .select("rubric_id")
      .eq("property_id", workspace.community.id);
    if (error) throw new Error(error.message);
    const ids = new Set(
      ((assignments ?? []) as unknown as Array<{ rubric_id: string }>)
        .map((row) => String(row.rubric_id))
    );
    const rubrics = (await listRubrics()).filter((rubric) => ids.has(rubric.id));
    return NextResponse.json({ rubrics }, {
      headers: { "Cache-Control": RUBRICS_CACHE_CONTROL },
    });
  } catch (caught) {
    return NextResponse.json(
      { error: caught instanceof Error ? caught.message : "Failed to load rubrics." },
      { status: caught instanceof AdminAuthError ? caught.status : 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const workspace = await requireAdminContext(request);
    if (workspace.membership.role === "member") {
      throw new AdminAuthError("Manager access is required to create rubrics.", 403);
    }

    const body = (await request.json()) as {
      name?: string;
      definition?: unknown;
      sourceUrl?: string | null;
      isDefault?: boolean;
      analysisModel?: string;
      transcribeProvider?: string;
      audioUnderstandingEnabled?: boolean;
      sessionType?: string;
      segmentationPrompt?: string | null;
      analysisPrompt?: string | null;
    };
    if (!body.name?.trim() || !body.definition || typeof body.definition !== "object") {
      return NextResponse.json({ error: "name and definition are required." }, { status: 400 });
    }

    const rubric = await createRubric({
      name: body.name,
      definition: body.definition as never,
      sourceUrl: body.sourceUrl ?? null,
      isDefault: body.isDefault ?? false,
      analysisModel: body.analysisModel as never,
      transcribeProvider: body.transcribeProvider as never,
      audioUnderstandingEnabled: body.audioUnderstandingEnabled,
      sessionType: body.sessionType,
      segmentationPrompt: body.segmentationPrompt ?? null,
      analysisPrompt: body.analysisPrompt ?? null,
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
  } catch (caught) {
    return NextResponse.json(
      { error: caught instanceof Error ? caught.message : "Failed to create rubric." },
      { status: caught instanceof AdminAuthError ? caught.status : 500 }
    );
  }
}
