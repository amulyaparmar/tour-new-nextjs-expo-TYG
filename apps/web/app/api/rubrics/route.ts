import { NextResponse } from "next/server";

import { hasAdminSession, requireAdminContext } from "@/lib/admin-auth";
import { createRubric, listRubrics, listRubricsForCommunity } from "@/lib/rubrics";

export async function GET(request: Request) {
  try {
    const workspace = hasAdminSession(request) ? await requireAdminContext(request) : null;
    const rubrics = workspace
      ? await listRubricsForCommunity(workspace.community.id)
      : await listRubrics();
    return NextResponse.json({ rubrics });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch rubrics." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      name?: string;
      definition?: unknown;
      sourceUrl?: string | null;
      isDefault?: boolean;
      analysisModel?: string;
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
    });

    return NextResponse.json({ rubric }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create rubric." },
      { status: 500 }
    );
  }
}
