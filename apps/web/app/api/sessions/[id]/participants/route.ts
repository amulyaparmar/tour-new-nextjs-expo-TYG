import { NextResponse } from "next/server";

import type { SessionLead } from "@tour/shared";
import { AdminAuthError, propertySessionKeys, requireAdminContext } from "@/lib/admin-auth";
import { addSessionLead, getSessionById, updateSessionLeadNotes } from "@/lib/sessions";

type Context = { params: Promise<{ id: string }> };

async function requireAccessibleSession(request: Request, id: string) {
  const workspace = await requireAdminContext(request);
  const session = await getSessionById(id);
  if (!session) throw new AdminAuthError("Session not found.", 403);
  const allowedKeys = new Set(workspace.communities.flatMap(propertySessionKeys));
  if (!session.propertyId || !allowedKeys.has(session.propertyId)) {
    throw new AdminAuthError("This session is not available to you.", 403);
  }
  return session;
}

export async function POST(request: Request, context: Context) {
  const { id } = await context.params;
  try {
    await requireAccessibleSession(request, id);
    const body = await request.json() as {
      name?: string;
      firstName?: string | null;
      lastName?: string | null;
      email?: string | null;
      phone?: string | null;
      wantsSummary?: boolean;
      jobTitle?: string | null;
      reason?: string | null;
      questionAnswers?: Record<string, string>;
    };
    const firstName = body.firstName?.trim() || null;
    const lastName = body.lastName?.trim() || null;
    const name = body.name?.trim() || [firstName, lastName].filter(Boolean).join(" ");
    if (!name.trim()) return NextResponse.json({ error: "Name is required." }, { status: 400 });

    const lead: SessionLead = {
      name: name.trim(),
      firstName,
      lastName,
      email: body.email?.trim() || null,
      phone: body.phone?.trim() || null,
      wantsSummary: body.wantsSummary ?? false,
      jobTitle: body.jobTitle?.trim() || null,
      reason: body.reason?.trim() || null,
      questionAnswers: body.questionAnswers && Object.keys(body.questionAnswers).length ? body.questionAnswers : undefined,
      createdAt: new Date().toISOString(),
      notes: null,
    };
    await addSessionLead(id, lead);
    return NextResponse.json({ lead }, { status: 201 });
  } catch (caught) {
    return NextResponse.json(
      { error: caught instanceof Error ? caught.message : "Could not add this person." },
      { status: caught instanceof AdminAuthError ? caught.status : 500 },
    );
  }
}

export async function PATCH(request: Request, context: Context) {
  const { id } = await context.params;
  try {
    const session = await requireAccessibleSession(request, id);
    const body = await request.json() as { createdAt?: string; notes?: string | null };
    const createdAt = body.createdAt?.trim();
    if (!createdAt || !session.leads.some((lead) => lead.createdAt === createdAt)) {
      return NextResponse.json({ error: "Checked-in person not found." }, { status: 404 });
    }
    const notes = typeof body.notes === "string" ? body.notes.trim() || null : null;
    await updateSessionLeadNotes(id, createdAt, notes);
    return NextResponse.json({ ok: true, notes });
  } catch (caught) {
    return NextResponse.json(
      { error: caught instanceof Error ? caught.message : "Could not save person notes." },
      { status: caught instanceof AdminAuthError ? caught.status : 500 },
    );
  }
}
