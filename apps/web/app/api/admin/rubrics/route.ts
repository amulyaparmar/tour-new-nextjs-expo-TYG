import { NextResponse } from "next/server";

import { propertySessionKeys, AdminAuthError, requireAdminContext } from "@/lib/admin-auth";
import { createRubric, listRubricTemplates, listRubricsForCommunity } from "@/lib/rubrics";

const RUBRICS_CACHE_CONTROL = "private, max-age=60, stale-while-revalidate=300";

export async function GET(request: Request) {
  try {
    const workspace = await requireAdminContext(request);
    const [rubrics, templates] = await Promise.all([
      listRubricsForCommunity(propertySessionKeys(workspace.community)),
      listRubricTemplates(),
    ]);
    return NextResponse.json({ rubrics, templates }, {
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
    if (workspace.teamMember.accessRole === "member") {
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
      propertyId: workspace.community.propertyTygId,
      isTemplate: false,
    });

    return NextResponse.json({ rubric }, { status: 201 });
  } catch (caught) {
    return NextResponse.json(
      { error: caught instanceof Error ? caught.message : "Failed to create rubric." },
      { status: caught instanceof AdminAuthError ? caught.status : 500 }
    );
  }
}
