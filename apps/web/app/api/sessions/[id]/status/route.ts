import { NextResponse } from "next/server";

import { getSessionById } from "@/lib/sessions";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  const { id } = await context.params;

  try {
    const session = await getSessionById(id);
    if (!session) {
      return NextResponse.json({ error: "Session not found." }, { status: 404 });
    }

    return NextResponse.json({
      session: {
        id: session.id,
        status: session.status,
        overallScore: session.overallScore,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch session status." },
      { status: 500 }
    );
  }
}
