import { NextResponse } from "next/server";

import { getSessionById, updateSession } from "@/lib/sessions";

type Context = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(_request: Request, context: Context) {
  const { id } = await context.params;

  try {
    const session = await getSessionById(id);
    if (!session) {
      return NextResponse.json({ error: "Session not found." }, { status: 404 });
    }
    return NextResponse.json({ session });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch session." },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request, context: Context) {
  const { id } = await context.params;
  try {
    const body = await request.json() as Record<string, unknown>;
    await updateSession(id, {
      title: typeof body.title === "string" ? body.title : undefined,
      scheduledAt: typeof body.scheduledAt === "string" ? body.scheduledAt : undefined,
      prospectName: typeof body.prospectName === "string" ? body.prospectName : undefined,
      location: typeof body.location === "string" ? body.location : undefined,
      notes: typeof body.notes === "string" ? body.notes : undefined,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Update failed." },
      { status: 500 }
    );
  }
}
