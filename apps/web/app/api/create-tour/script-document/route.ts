import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase";

type ScriptSectionPayload = {
  key: string;
  label: string;
  helper?: string;
  markdown: string;
  prompt?: string;
  model?: string;
  core_elements?: string[];
};

type GenProjectRow = {
  id: string;
  name: string | null;
  gmb_id: string | null;
  metadata: unknown;
  created_at: string | null;
};

function normalizeMetadata(metadata: unknown) {
  return metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? metadata as Record<string, any>
    : {};
}

function buildResearchContext(body: any, savedAt: string) {
  return {
    type: "research_context",
    source: body.source || "tour-new-home",
    place_id: body.place_id,
    property_name: body.property_name,
    property_website: body.property_website || null,
    property_data: body.property_data || null,
    research_agent: body.research_agent || null,
    research_prompt: body.research_prompt || null,
    saved_at: savedAt
  };
}

async function findProjectByGmbId(placeId: string) {
  const supabase = getSupabaseServiceClient() as any;
  const { data, error } = await supabase
    .from("GenProjectsTYG")
    .select("id,name,gmb_id,metadata,created_at")
    .eq("gmb_id", placeId)
    .order("created_at", { ascending: false })
    .limit(1);

  return { data: (data?.[0] || null) as GenProjectRow | null, error };
}

export async function GET(request: NextRequest) {
  try {
    const placeId = request.nextUrl.searchParams.get("place_id");

    if (!placeId) {
      return NextResponse.json({ success: false, error: "place_id is required" }, { status: 400 });
    }

    const { data: project, error } = await findProjectByGmbId(placeId);

    if (error) {
      return NextResponse.json({ success: false, error: error.message, table: "GenProjectsTYG" }, { status: 500 });
    }

    if (!project) {
      return NextResponse.json({ success: true, found: false, project: null, script_document: null, research_context: null });
    }

    const metadata = normalizeMetadata(project.metadata);

    return NextResponse.json({
      success: true,
      found: Boolean(metadata.script_document || metadata.research_context),
      project: {
        id: project.id,
        name: project.name,
        gmb_id: project.gmb_id,
        created_at: project.created_at
      },
      script_document: metadata.script_document || null,
      research_context: metadata.research_context || null,
      metadata
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to load generated script document" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const sections = Array.isArray(body.sections) ? body.sections as ScriptSectionPayload[] : [];

    if (!body.place_id || !body.property_name) {
      return NextResponse.json(
        { success: false, error: "place_id and property_name are required" },
        { status: 400 }
      );
    }

    if (sections.length === 0) {
      return NextResponse.json(
        { success: false, error: "At least one script section is required" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseServiceClient() as any;
    const savedAt = new Date().toISOString();
    const researchContext = buildResearchContext(body, savedAt);
    const scriptDocument = {
      type: "generated_script_document",
      source: body.source || "tour-new-home",
      place_id: body.place_id,
      property_name: body.property_name,
      property_website: body.property_website || null,
      property_data: body.property_data || null,
      research_agent: body.research_agent || null,
      research_context: researchContext,
      research_prompt: body.research_prompt || null,
      sections,
      prompts: body.prompts || null,
      models: body.models || null,
      saved_at: savedAt
    };

    const { data: existing, error: findError } = await findProjectByGmbId(body.place_id);

    if (findError) {
      return NextResponse.json({ success: false, error: findError.message, table: "GenProjectsTYG" }, { status: 500 });
    }

    const existingMetadata = normalizeMetadata(existing?.metadata);
    const existingSavedPrompts = Array.isArray(existingMetadata.saved_prompts) ? existingMetadata.saved_prompts : [];
    const metadata = {
      ...existingMetadata,
      website_url: body.property_website || existingMetadata.website_url || null,
      partner: "script-generator",
      project_type: "script-generator",
      research_context: researchContext,
      script_document: scriptDocument,
      saved_prompts: [
        ...existingSavedPrompts,
        {
          type: "script_document",
          saved_at: savedAt,
          prompts: body.prompts || null,
          models: body.models || null
        }
      ]
    };

    if (existing?.id) {
      const { data, error } = await supabase
        .from("GenProjectsTYG")
        .update({ name: body.property_name, metadata })
        .eq("id", existing.id)
        .select("id,name,gmb_id,metadata")
        .single();

      if (error) {
        return NextResponse.json({ success: false, error: error.message, table: "GenProjectsTYG" }, { status: 500 });
      }

      return NextResponse.json({ success: true, id: data?.id || null, table: "GenProjectsTYG", mode: "updated" });
    }

    const { data, error } = await supabase
      .from("GenProjectsTYG")
      .insert([{
        name: body.property_name,
        community_id: null,
        user_id: "script-generator",
        gmb_id: body.place_id,
        metadata
      }])
      .select("id,name,gmb_id,metadata")
      .single();

    if (error) {
      return NextResponse.json({ success: false, error: error.message, table: "GenProjectsTYG" }, { status: 500 });
    }

    return NextResponse.json({ success: true, id: data?.id || null, table: "GenProjectsTYG", mode: "created" });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to save generated script document" },
      { status: 500 }
    );
  }
}
