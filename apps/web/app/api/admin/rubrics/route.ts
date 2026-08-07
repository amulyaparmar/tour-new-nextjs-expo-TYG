import { NextResponse } from "next/server";

import {
  isAnalysisModelId,
  isGeminiAudioModelId,
  isTranscribeProviderId,
  normalizeAudioAnalysisModes,
} from "@tour/shared";

import {
  propertySessionKeys,
  AdminAuthError,
  requireAdminContext,
} from "@/lib/admin-auth";
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
      nameExtractionModel?: string;
      transcribeProvider?: unknown;
      audioUnderstandingEnabled?: boolean;
      audioAnalysisModes?: unknown;
      audioAnalysisModel?: string;
      sessionType?: string;
      segmentationPrompt?: string | null;
      analysisPrompt?: string | null;
    };
    if (!body.name?.trim() || !body.definition || typeof body.definition !== "object") {
      return NextResponse.json({ error: "name and definition are required." }, { status: 400 });
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
    if (body.analysisModel !== undefined && !isAnalysisModelId(body.analysisModel)) {
      return NextResponse.json({ error: "Invalid analysis model." }, { status: 400 });
    }
    if (body.nameExtractionModel !== undefined && !isAnalysisModelId(body.nameExtractionModel)) {
      return NextResponse.json({ error: "Invalid name extraction model." }, { status: 400 });
    }
    if (body.audioAnalysisModel !== undefined && !isGeminiAudioModelId(body.audioAnalysisModel)) {
      return NextResponse.json({ error: "Invalid audio analysis model." }, { status: 400 });
    }
    if (
      body.audioAnalysisModes !== undefined
      && (!Array.isArray(body.audioAnalysisModes)
        || normalizeAudioAnalysisModes(body.audioAnalysisModes).length !== body.audioAnalysisModes.length)
    ) {
      return NextResponse.json({ error: "Invalid audio analysis modes." }, { status: 400 });
    }

    const rubric = await createRubric({
      name: body.name,
      definition: body.definition as never,
      sourceUrl: body.sourceUrl ?? null,
      isDefault: body.isDefault ?? false,
      analysisModel: body.analysisModel as never,
      nameExtractionModel: body.nameExtractionModel as never,
      transcribeProvider: body.transcribeProvider,
      audioUnderstandingEnabled: body.audioUnderstandingEnabled,
      audioAnalysisModes: body.audioAnalysisModes as never,
      audioAnalysisModel: body.audioAnalysisModel as never,
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
