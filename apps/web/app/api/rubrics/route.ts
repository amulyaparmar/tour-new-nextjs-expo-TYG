import { NextResponse } from "next/server";

import { createRubric, listRubrics } from "@/lib/rubrics";

export async function GET() {
  try {
    const rubrics = await listRubrics();
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
      description?: string | null;
      definition?: unknown;
      sourceFileUrl?: string | null;
      sourceFileName?: string | null;
      templateText?: string | null;
    };

    if (!body.name?.trim()) {
      return NextResponse.json({ error: "name is required." }, { status: 400 });
    }
    if (!body.definition || typeof body.definition !== "object") {
      return NextResponse.json({ error: "definition is required." }, { status: 400 });
    }

    const rubric = await createRubric({
      name: body.name,
      description: body.description ?? null,
      definition: body.definition as never,
      sourceFileUrl: body.sourceFileUrl ?? null,
      sourceFileName: body.sourceFileName ?? null,
      templateText: body.templateText ?? null
    });

    return NextResponse.json({ rubric }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create rubric." },
      { status: 500 }
    );
  }
}
