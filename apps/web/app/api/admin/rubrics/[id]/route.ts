import { NextResponse } from "next/server";

import { AdminAuthError, requireAdminContext } from "@/lib/admin-auth";
import { deleteRubric, getRubricById, updateRubric } from "@/lib/rubrics";
import { getSupabaseServiceClient } from "@/lib/supabase";

type Context = { params: Promise<{ id: string }> };

async function assertCommunityRubric(rubricId: string, propertyId: string) {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from("rubric_communities")
    .select("rubric_id")
    .eq("rubric_id", rubricId)
    .eq("property_id", propertyId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new AdminAuthError("Rubric not found in this community.", 403);
}

export async function GET(request: Request, context: Context) {
  try {
    const workspace = await requireAdminContext(request);
    const { id } = await context.params;
    await assertCommunityRubric(id, workspace.community.id);
    const rubric = await getRubricById(id);
    if (!rubric) return NextResponse.json({ error: "Rubric not found." }, { status: 404 });
    return NextResponse.json({ rubric });
  } catch (caught) {
    return NextResponse.json(
      { error: caught instanceof Error ? caught.message : "Failed to load rubric." },
      { status: caught instanceof AdminAuthError ? caught.status : 500 }
    );
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const workspace = await requireAdminContext(request);
    if (workspace.membership.role === "member") {
      throw new AdminAuthError("Manager access is required to edit rubrics.", 403);
    }
    const { id } = await context.params;
    await assertCommunityRubric(id, workspace.community.id);
    const body = (await request.json()) as {
      name?: string;
      definition?: unknown;
      sourceUrl?: string | null;
      isDefault?: boolean;
      analysisModel?: string;
      sessionType?: string;
      segmentationPrompt?: string | null;
      analysisPrompt?: string | null;
    };
    const rubric = await updateRubric(id, {
      name: body.name,
      definition: body.definition as never,
      sourceUrl: body.sourceUrl,
      isDefault: body.isDefault,
      analysisModel: body.analysisModel as never,
      sessionType: body.sessionType,
      segmentationPrompt: body.segmentationPrompt,
      analysisPrompt: body.analysisPrompt,
    });
    return NextResponse.json({ rubric });
  } catch (caught) {
    return NextResponse.json(
      { error: caught instanceof Error ? caught.message : "Failed to update rubric." },
      { status: caught instanceof AdminAuthError ? caught.status : 500 }
    );
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    const workspace = await requireAdminContext(request);
    if (workspace.membership.role === "member") {
      throw new AdminAuthError("Manager access is required to delete rubrics.", 403);
    }
    const { id } = await context.params;
    await assertCommunityRubric(id, workspace.community.id);
    await deleteRubric(id);
    return NextResponse.json({ ok: true });
  } catch (caught) {
    return NextResponse.json(
      { error: caught instanceof Error ? caught.message : "Failed to delete rubric." },
      { status: caught instanceof AdminAuthError ? caught.status : 500 }
    );
  }
}
