import { NextResponse } from "next/server";

import { hasAdminSession, propertySessionKeys, requireAdminContext } from "@/lib/admin-auth";
import { createRubric, listRubricTemplates, listRubrics, listRubricsForCommunity } from "@/lib/rubrics";

const RUBRICS_CACHE_CONTROL = "private, max-age=60, stale-while-revalidate=300";

export async function GET(request: Request) {
  try {
    const workspace = hasAdminSession(request) ? await requireAdminContext(request) : null;
    const rubrics = workspace
      ? await listRubricsForCommunity(propertySessionKeys(workspace.community))
      : await listRubrics();
    const templates = workspace ? await listRubricTemplates() : [];
    return NextResponse.json({ rubrics, templates }, {
      headers: { "Cache-Control": RUBRICS_CACHE_CONTROL },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch rubrics." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const workspace = hasAdminSession(request) ? await requireAdminContext(request) : null;
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

    if (!body.name?.trim()) {
      return NextResponse.json({ error: "name is required." }, { status: 400 });
    }
    if (!body.definition || typeof body.definition !== "object") {
      return NextResponse.json({ error: "definition is required." }, { status: 400 });
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
      propertyId: workspace?.community.propertyTygId ?? null,
      isTemplate: false,
    });

    return NextResponse.json({ rubric }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create rubric." },
      { status: 500 }
    );
  }
}
