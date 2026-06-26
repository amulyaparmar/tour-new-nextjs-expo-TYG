import { NextResponse } from "next/server";

import { deleteRubric, getRubricById, updateRubric } from "@/lib/rubrics";

type Context = { params: Promise<{ id: string }> };

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
    const body = (await request.json()) as {
      name?: string;
      definition?: unknown;
      sourceUrl?: string | null;
      isDefault?: boolean;
    };

    if (body.name !== undefined && !body.name.trim()) {
      return NextResponse.json({ error: "name cannot be empty." }, { status: 400 });
    }
    if (body.definition !== undefined && (!body.definition || typeof body.definition !== "object")) {
      return NextResponse.json({ error: "definition must be an object." }, { status: 400 });
    }

    const rubric = await updateRubric(id, {
      name: body.name,
      definition: body.definition as never,
      sourceUrl: body.sourceUrl,
      isDefault: body.isDefault
    });

    return NextResponse.json({ rubric });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update rubric.";
    return NextResponse.json(
      { error: message },
      { status: message === "Rubric not found." ? 404 : 500 }
    );
  }
}

export async function DELETE(_request: Request, context: Context) {
  const { id } = await context.params;
  try {
    await deleteRubric(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete rubric." },
      { status: 500 }
    );
  }
}
