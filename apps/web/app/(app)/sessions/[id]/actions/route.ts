import { NextResponse } from "next/server";

import { updateFollowUpActionStatus } from "@/lib/sessions";

export async function POST(request: Request) {
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
      { error: error instanceof Error ? error.message : "Failed to update action status." },
      { status: 500 }
    );
  }
}
