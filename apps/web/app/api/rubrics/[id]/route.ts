import { NextResponse } from "next/server";

import { isTranscribeProviderId } from "@tour/shared";

import {
  AdminAuthError,
  propertySessionKeys,
  requireAdminContext,
} from "@/lib/admin-auth";
import { deleteRubric, getRubricById, updateRubric } from "@/lib/rubrics";

type Context = { params: Promise<{ id: string }> };

async function assertCommunityRubric(rubricId: string, propertyIds: string[]) {
  const rubric = await getRubricById(rubricId);
  if (!rubric || !propertyIds.includes(rubric.propertyId ?? "")) {
    throw new AdminAuthError("Rubric not found for this property.", 403);
  }
}

export async function GET(_request: Request, context: Context) {
  const { id } = await context.params;
  try {
    const rubric = await getRubricById(id);
    if (!rubric) {
      return NextResponse.json({ error: "Rubric not found." }, { status: 404 });
    }
    return NextResponse.json({ rubric });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch rubric." },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request, context: Context) {
  const { id } = await context.params;
  try {
    const workspace = await requireAdminContext(request);
    if (workspace.teamMember.accessRole === "member") {
      throw new AdminAuthError("Manager access is required to edit rubrics.", 403);
    }
    await assertCommunityRubric(id, propertySessionKeys(workspace.community));
    const body = (await request.json()) as {
      name?: string;
      definition?: unknown;
      sourceUrl?: string | null;
      isDefault?: boolean;
      analysisModel?: string;
      transcribeProvider?: unknown;
      audioUnderstandingEnabled?: boolean;
      sessionType?: string;
      segmentationPrompt?: string | null;
      analysisPrompt?: string | null;
    };

    if (body.name !== undefined && !body.name.trim()) {
      return NextResponse.json({ error: "name cannot be empty." }, { status: 400 });
    }
    if (body.definition !== undefined && (!body.definition || typeof body.definition !== "object")) {
      return NextResponse.json({ error: "definition must be an object." }, { status: 400 });
    }
    if (
      body.transcribeProvider !== undefined
      && (
        typeof body.transcribeProvider !== "string"
        || !isTranscribeProviderId(body.transcribeProvider)
      )
    ) {
      return NextResponse.json({ error: "Invalid transcription provider." }, { status: 400 });
    }

    const rubric = await updateRubric(id, {
      name: body.name,
      definition: body.definition as never,
      sourceUrl: body.sourceUrl,
      isDefault: body.isDefault,
      analysisModel: body.analysisModel as never,
      transcribeProvider: body.transcribeProvider,
      audioUnderstandingEnabled: body.audioUnderstandingEnabled,
      sessionType: body.sessionType,
      segmentationPrompt: body.segmentationPrompt,
      analysisPrompt: body.analysisPrompt,
    });

    return NextResponse.json({ rubric });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update rubric.";
    return NextResponse.json(
      { error: message },
      {
        status: error instanceof AdminAuthError
          ? error.status
          : message === "Rubric not found."
            ? 404
            : 500,
      }
    );
  }
}

export async function DELETE(request: Request, context: Context) {
  const { id } = await context.params;
  try {
    const workspace = await requireAdminContext(request);
    if (workspace.teamMember.accessRole === "member") {
      throw new AdminAuthError("Manager access is required to delete rubrics.", 403);
    }
    await assertCommunityRubric(id, propertySessionKeys(workspace.community));
    await deleteRubric(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete rubric." },
      { status: error instanceof AdminAuthError ? error.status : 500 }
    );
  }
}
