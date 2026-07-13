import { NextResponse } from "next/server";

import { AdminAuthError, propertySessionKeys, requireAdminContext } from "@/lib/admin-auth";
import { cloneRubricTemplate, deleteRubric, getRubricById, updateRubric } from "@/lib/rubrics";

type Context = { params: Promise<{ id: string }> };

async function assertCommunityRubric(rubricId: string, propertyIds: string[], allowTemplate = false) {
  const rubric = await getRubricById(rubricId);
  if (!rubric || (!propertyIds.includes(rubric.propertyId ?? "") && !(allowTemplate && rubric.isTemplate))) {
    throw new AdminAuthError("Rubric not found for this property.", 403);
  }
  return rubric;
}

export async function GET(request: Request, context: Context) {
  try {
    const workspace = await requireAdminContext(request);
    const { id } = await context.params;
    await assertCommunityRubric(id, propertySessionKeys(workspace.community), true);
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
    if (workspace.teamMember.accessRole === "member") {
      throw new AdminAuthError("Manager access is required to edit rubrics.", 403);
    }
    const { id } = await context.params;
    await assertCommunityRubric(id, propertySessionKeys(workspace.community));
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
    const rubric = await updateRubric(id, {
      name: body.name,
      definition: body.definition as never,
      sourceUrl: body.sourceUrl,
      isDefault: body.isDefault,
      analysisModel: body.analysisModel as never,
      transcribeProvider: body.transcribeProvider as never,
      audioUnderstandingEnabled: body.audioUnderstandingEnabled,
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
    if (workspace.teamMember.accessRole === "member") {
      throw new AdminAuthError("Manager access is required to delete rubrics.", 403);
    }
    const { id } = await context.params;
    await assertCommunityRubric(id, propertySessionKeys(workspace.community));
    await deleteRubric(id);
    return NextResponse.json({ ok: true });
  } catch (caught) {
    return NextResponse.json(
      { error: caught instanceof Error ? caught.message : "Failed to delete rubric." },
      { status: caught instanceof AdminAuthError ? caught.status : 500 }
    );
  }
}

export async function POST(request: Request, context: Context) {
  try {
    const workspace = await requireAdminContext(request);
    if (workspace.teamMember.accessRole === "member") {
      throw new AdminAuthError("Manager access is required to clone rubric templates.", 403);
    }
    const { id } = await context.params;
    await assertCommunityRubric(id, propertySessionKeys(workspace.community), true);
    const body = (await request.json().catch(() => ({}))) as { name?: string | null };
    const rubric = await cloneRubricTemplate(id, workspace.community.propertyTygId, body.name);
    return NextResponse.json({ rubric }, { status: 201 });
  } catch (caught) {
    return NextResponse.json(
      { error: caught instanceof Error ? caught.message : "Failed to clone rubric template." },
      { status: caught instanceof AdminAuthError ? caught.status : 500 }
    );
  }
}
