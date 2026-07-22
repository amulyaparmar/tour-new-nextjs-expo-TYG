import { NextResponse } from "next/server";

import type { SessionLead } from "@tour/shared";
import { addSessionLead, createSession, findOpenQrSession, getSessionById, updateSession } from "@/lib/sessions";
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
      sessionId?: string | null;
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

    const targetSessionId = body.sessionId?.trim() || null;
    if (targetSessionId) {
      const existing = await getSessionById(targetSessionId);
      if (!existing) {
        return NextResponse.json({ error: "Session not found." }, { status: 404 });
      }
      await addSessionLead(targetSessionId, lead);
      if (!existing.prospectName?.trim()) {
        await updateSession(targetSessionId, { prospectName: lead.name });
      }
      return NextResponse.json({ sessionId: targetSessionId, grouped: true, startRecording: true }, { status: 200 });
    }

    // A second person scanning during the same tour joins the open session
    // group instead of creating a duplicate session.
    const propertyId = body.propertyId?.trim() || null;
    let agentId = body.repSlug?.trim() || null;
    let agentName = body.repName?.trim() || null;
    let agentMatchIds: string[] | null = agentId ? [agentId] : null;

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

        const alias = cleanString(member.alias);
        const authUserId = cleanString(member.user_id ?? member.userId);
        const memberId = cleanString(member.id);
        const emailLocal = cleanString(member.email).split("@")[0] ?? "";

        // Prefer auth id for ownership filters; alias is public URL key + fallback.
        agentId = authUserId
          ? `user:${authUserId}`
          : alias || memberId || emailLocal || agentId;
        agentName = cleanString(member.name) || agentName;

        agentMatchIds = uniqueNonEmpty([
          agentId,
          alias,
          authUserId ? `user:${authUserId}` : "",
          authUserId,
          memberId,
          emailLocal,
          body.repSlug?.trim() || "",
        ]);
      }
    }

    const openSession = await findOpenQrSession(propertyId, agentMatchIds ?? agentId);
    if (openSession) {
      await addSessionLead(openSession.id, lead);
      return NextResponse.json({ sessionId: openSession.id, grouped: true, startRecording: true }, { status: 200 });
    }

    const property = body.propertyName?.trim() || "Property";
    const session = await createSession({
      title: null,
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

    return NextResponse.json({ sessionId: session.id, grouped: false, startRecording: true }, { status: 201 });
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

function uniqueNonEmpty(values: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}
