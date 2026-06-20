import { NextResponse } from "next/server";

import { deleteRubric, getRubricById } from "@/lib/rubrics";

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
