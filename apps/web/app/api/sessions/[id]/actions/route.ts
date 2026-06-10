import { NextResponse } from "next/server";

import { listFollowUpActions, updateFollowUpActionStatus } from "@/lib/sessions";

type Context = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(_request: Request, context: Context) {
  const { id } = await context.params;

  try {
    const actions = await listFollowUpActions(id);
    return NextResponse.json({ actions });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch actions." },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as {
      actionId?: string;
      status?: "open" | "completed" | "dismissed";
    };

    if (!body.actionId || !body.status) {
      return NextResponse.json(
        { error: "actionId and status are required." },
        { status: 400 }
      );
    }

    await updateFollowUpActionStatus(body.actionId, body.status);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update action." },
      { status: 500 }
    );
  }
}
