import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import {
  participantNameWithoutConfidenceMarker,
  type SessionDetail,
  type SessionLead,
} from "@tour/shared";

import { AdminAuthError, findPropertyForSessionKey } from "@/lib/admin-auth";
import {
  composeContextualFollowUpSms,
  generateContextualFollowUpDraft,
} from "@/lib/customer-follow-up";
import { getRepCard } from "@/lib/reps";
import { getRubricForSession } from "@/lib/rubrics";
import { requireSessionWriteAccess } from "@/lib/session-access";
import {
  getAnalysisBySessionId,
  getSessionById,
  getTranscript,
  listFollowUpActions,
} from "@/lib/sessions";
import { getSupabaseServiceClient } from "@/lib/supabase";
import { normalizePhoneE164, sendSms, TwilioConfigError } from "@/lib/twilio";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

type Context = {
  params: Promise<{ id: string }>;
};

type RequestBody = {
  leadIndex?: number;
  phone?: string;
  consentConfirmed?: boolean;
  previewOnly?: boolean;
  includeCardImage?: boolean;
};

class FollowUpRequestError extends Error {
  constructor(message: string, public status: 400 | 404) {
    super(message);
    this.name = "FollowUpRequestError";
  }
}

export async function POST(request: Request, context: Context) {
  const { id } = await context.params;

  try {
    const session = await requireFollowUpAccess(request, id);
    const body = (await request.json().catch(() => ({}))) as RequestBody;
    const leadIndex = normalizeLeadIndex(body.leadIndex);
    const lead = session.leads?.[leadIndex] ?? null;
    const phone = normalizePhoneE164(body.phone ?? lead?.phone);

    if (!phone) {
      return NextResponse.json(
        { error: "A valid customer phone number is required." },
        { status: 400 }
      );
    }
    if (!body.previewOnly && lead?.wantsSummary !== true && body.consentConfirmed !== true) {
      return NextResponse.json(
        {
          error: "Customer follow-up consent is required before sending.",
          code: "consent_required",
        },
        { status: 409 }
      );
    }

    const [transcript, analysis, actions, rubric, propertyIdentity] = await Promise.all([
      getTranscript(id),
      getAnalysisBySessionId(id),
      listFollowUpActions(id),
      getRubricForSession(session.rubricId, session.propertyId),
      findPropertyForSessionKey(session.propertyId),
    ]);
    if (transcript.length === 0) {
      return NextResponse.json(
        { error: "The session transcript is not available yet.", code: "transcript_unavailable" },
        { status: 409 }
      );
    }

    const repCard = resolveRepCard(lead);
    const baseUrl = getBaseUrl(request);
    const followUpUrl = `${baseUrl}/follow-up/${encodeURIComponent(id)}`;
    const contactUrl = repCard
      ? `${baseUrl}/p/${encodeURIComponent(repCard.rep.slug)}`
      : null;
    const analyzedProspectName = (analysis?.participantNames?.prospectNameConfidence ?? 0) >= 60
      ? analysis?.participantNames?.prospectName
      : null;
    const firstName = meaningfulFirstName(analyzedProspectName)
      || meaningfulFirstName(session.prospectName)
      || meaningfulFirstName(lead?.firstName)
      || firstToken(lead?.name)
      || "there";
    const propertyName = repCard?.property.name
      || propertyIdentity?.name
      || session.location
      || "the community";

    const draft = await generateContextualFollowUpDraft({
      firstName,
      propertyName,
      sessionType: session.sessionKind,
      transcript,
      analysis,
      actions,
      analysisModel: rubric.analysisModel,
    });
    const message = composeContextualFollowUpSms({
      message: draft.message,
      followUpUrl,
      contactUrl,
      contactName: repCard?.rep.name ?? null,
    });

    const sharedResponse = {
      message,
      nextStep: draft.nextStep,
      contextSummary: draft.contextSummary,
      generatedBy: draft.generatedBy,
      followUpUrl,
      tourUrl: followUpUrl,
      contactUrl,
      leadIndex,
      to: phone,
    };

    if (body.previewOnly) {
      return NextResponse.json({ ok: true, preview: true, ...sharedResponse });
    }

    const mediaUrl = body.includeCardImage !== false
      && repCard
      && baseUrl.startsWith("https://")
      ? [`${baseUrl}/api/p/${encodeURIComponent(repCard.rep.slug)}/card?layout=property`]
      : undefined;
    let result;
    try {
      result = await sendSms({ to: phone, body: message, mediaUrl });
    } catch (error) {
      if (error instanceof TwilioConfigError) {
        return NextResponse.json({
          ok: false,
          skipped: true,
          reason: "twilio_unconfigured",
          mediaUrl: mediaUrl?.[0] ?? null,
          ...sharedResponse,
        });
      }
      throw error;
    }
    const tracked = await recordFollowUpSent(id, leadIndex);

    return NextResponse.json({
      ok: true,
      preview: false,
      sid: result.sid,
      status: result.status,
      tracked,
      mediaUrl: mediaUrl?.[0] ?? null,
      ...sharedResponse,
    });
  } catch (error) {
    const status = error instanceof AdminAuthError || error instanceof FollowUpRequestError
      ? error.status
      : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to send contextual follow-up." },
      { status }
    );
  }
}

async function requireFollowUpAccess(request: Request, sessionId: string): Promise<SessionDetail> {
  const configuredSecret = process.env.CONTEXTUAL_FOLLOW_UP_API_SECRET?.trim();
  const suppliedSecret = readBearerToken(request);
  if (configuredSecret && suppliedSecret && secretsMatch(configuredSecret, suppliedSecret)) {
    const session = await getSessionById(sessionId);
    if (!session) throw new FollowUpRequestError("Session not found.", 404);
    return session;
  }

  const { session } = await requireSessionWriteAccess(request, sessionId);
  return session;
}

function readBearerToken(request: Request) {
  const authorization = request.headers.get("authorization")?.trim() ?? "";
  return authorization.toLowerCase().startsWith("bearer ")
    ? authorization.slice(7).trim()
    : "";
}

function secretsMatch(expected: string, supplied: string) {
  const expectedBuffer = Buffer.from(expected);
  const suppliedBuffer = Buffer.from(supplied);
  return expectedBuffer.length === suppliedBuffer.length
    && timingSafeEqual(expectedBuffer, suppliedBuffer);
}

function normalizeLeadIndex(value: unknown) {
  if (value === undefined) return 0;
  if (!Number.isInteger(value) || Number(value) < 0) {
    throw new FollowUpRequestError("leadIndex must be a non-negative integer.", 400);
  }
  return Number(value);
}

function resolveRepCard(lead: SessionLead | null) {
  const slug = lead?.repSlug?.trim();
  return slug ? getRepCard(slug) : null;
}

function firstToken(value?: string | null) {
  return participantNameWithoutConfidenceMarker(value)?.split(/\s+/)[0] ?? null;
}

function meaningfulFirstName(value?: string | null) {
  const candidate = firstToken(value);
  if (!candidate) return null;
  return new Set(["prospect", "customer", "visitor", "shopper", "unknown", "there"])
    .has(candidate.toLowerCase())
    ? null
    : candidate;
}

function getBaseUrl(request: Request) {
  return (process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin).replace(/\/$/, "");
}

async function recordFollowUpSent(sessionId: string, leadIndex: number) {
  try {
    const supabase = getSupabaseServiceClient();
    const { data: existing, error: readError } = await supabase
      .from("prospect_follow_ups")
      .select("notes")
      .eq("session_id", sessionId)
      .eq("lead_index", leadIndex)
      .maybeSingle<{ notes: Array<{ text: string; timestamp: string; author: string }> | null }>();
    if (readError) throw new Error(readError.message);

    const now = new Date().toISOString();
    const notes = [
      ...(existing?.notes ?? []),
      {
        text: "Context-driven follow-up SMS sent.",
        timestamp: now,
        author: "Tour AI",
      },
    ];
    const { error } = await supabase
      .from("prospect_follow_ups")
      .upsert({
        session_id: sessionId,
        lead_index: leadIndex,
        status: "sent",
        last_contact_at: now,
        next_follow_up_at: null,
        notes,
        updated_at: now,
      } as never, { onConflict: "session_id,lead_index" });
    if (error) throw new Error(error.message);
    return true;
  } catch (error) {
    console.warn("Contextual follow-up sent but tracking update failed.", error);
    return false;
  }
}
