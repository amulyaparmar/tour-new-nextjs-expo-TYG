import { NextResponse } from "next/server";

import type { SessionLead } from "@tour/shared";
import { addSessionLead, createSession, findOpenQrSession } from "@/lib/sessions";
import { getSupabaseServiceClient } from "@/lib/supabase";

type CheckInPropertyRow = {
  id: string;
  metadata: unknown;
};

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
      repName?: string | null;
      propertyId?: string | null;
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
    const propertyId = body.propertyId?.trim() || null;
    let agentId = body.repSlug?.trim() || null;
    let agentName = body.repName?.trim() || null;
    if (propertyId) {
      const { data, error } = await getSupabaseServiceClient()
        .from("propertiesTYG")
        .select("id,metadata")
        .eq("id", propertyId)
        .maybeSingle<CheckInPropertyRow>();
      if (error) throw new Error(error.message);
      if (!data) return NextResponse.json({ error: "Property not found." }, { status: 404 });

      if (agentId) {
        const team = isRecord(data.metadata) && Array.isArray(data.metadata.property_team)
          ? data.metadata.property_team
          : [];
        const memberKey = agentId.toLowerCase().replace(/^@/, "");
        const member = team.find((candidate) => {
          if (!isRecord(candidate)) return false;
          const email = cleanString(candidate.email).toLowerCase();
          return [candidate.alias, candidate.id, candidate.user_id, candidate.userId, email.split("@")[0]]
            .map((value) => cleanString(value).toLowerCase().replace(/^@/, ""))
            .includes(memberKey);
        });
        if (!isRecord(member)) {
          return NextResponse.json({ error: "Team member not found for this property." }, { status: 404 });
        }
        agentId = cleanString(member.alias ?? member.id ?? member.user_id ?? member.userId)
          || cleanString(member.email)
          || agentId;
        agentName = cleanString(member.name) || agentName;
      }
    }

    const openSession = await findOpenQrSession(propertyId, agentId);
    if (openSession) {
      await addSessionLead(openSession.id, lead);
      return NextResponse.json({ sessionId: openSession.id, grouped: true }, { status: 200 });
    }

    const property = body.propertyName?.trim() || "Property";
    const session = await createSession({
      title: `${property} tour check-in`,
      status: "in_progress",
      scheduledAt: new Date().toISOString(),
      prospectName: lead.name,
      agentName,
      agentId,
      location: property,
      source: "qr",
      leads: [lead],
      propertyId,
    });

    return NextResponse.json({ sessionId: session.id, grouped: false }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to submit lead." },
      { status: 500 }
    );
  }
}

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
