import { NextResponse } from "next/server";

import { createSession, listSessions } from "@/lib/sessions";

export async function GET() {
  try {
    const sessions = await listSessions();
    return NextResponse.json({ sessions });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch sessions." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      title?: string;
      scheduledAt?: string | null;
      location?: string | null;
      prospectName?: string | null;
      notes?: string | null;
    };

    if (!body.title?.trim()) {
      return NextResponse.json({ error: "title is required." }, { status: 400 });
    }

    const session = await createSession({
      title: body.title,
      scheduledAt: body.scheduledAt ?? null,
      location: body.location ?? null,
      prospectName: body.prospectName ?? null,
      notes: body.notes ?? null
    });

    return NextResponse.json({ session }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create session." },
      { status: 500 }
    );
  }
}
