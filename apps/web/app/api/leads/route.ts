import { NextResponse } from "next/server";

import type { SessionLead } from "@tour/shared";
import { addSessionLead, createSession, findOpenQrSession } from "@/lib/sessions";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      name?: string;
      firstName?: string | null;
      lastName?: string | null;
      email?: string | null;
      phone?: string | null;
      wantsSummary?: boolean;
      propertyName?: string | null;
      jobTitle?: string | null;
      reason?: string | null;
      questionAnswers?: Record<string, string>;
      repSlug?: string | null;
    };

    const firstName = body.firstName?.trim() || null;
    const lastName = body.lastName?.trim() || null;
    const name = body.name?.trim() || [firstName, lastName].filter(Boolean).join(" ").trim();
    if (!name) {
      return NextResponse.json({ error: "name is required." }, { status: 400 });
    }

    const lead: SessionLead = {
      name,
      firstName,
      lastName,
      email: body.email?.trim() || null,
      phone: body.phone?.trim() || null,
      wantsSummary: body.wantsSummary ?? false,
      jobTitle: body.jobTitle?.trim() || null,
      reason: body.reason?.trim() || null,
      questionAnswers: body.questionAnswers && Object.keys(body.questionAnswers).length ? body.questionAnswers : undefined,
      repSlug: body.repSlug?.trim() || null,
      createdAt: new Date().toISOString()
    };

    // A second person scanning during the same tour joins the open session
    // group instead of creating a duplicate session.
    const openSession = await findOpenQrSession();
    if (openSession) {
      await addSessionLead(openSession.id, lead);
      return NextResponse.json({ sessionId: openSession.id, grouped: true }, { status: 200 });
    }

    const property = body.propertyName?.trim() || "Property";
    const session = await createSession({
      title: `${property} tour — ${lead.name}`,
      scheduledAt: new Date().toISOString(),
      prospectName: lead.name,
      source: "qr",
      leads: [lead]
    });

    return NextResponse.json({ sessionId: session.id, grouped: false }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to submit lead." },
      { status: 500 }
    );
  }
}
