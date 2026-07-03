import { NextResponse } from "next/server";

import type { SessionDetail } from "@tour/shared";
import { getRepCard } from "@/lib/reps";
import { getSessionById } from "@/lib/sessions";
import { normalizePhoneE164, sendSms, TwilioConfigError } from "@/lib/twilio";

export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: Context) {
  const { id } = await context.params;

  try {
    const session = await getSessionById(id);
    if (!session) {
      return NextResponse.json({ error: "Session not found." }, { status: 404 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      phone?: string;
      includeCardImage?: boolean;
    };

    const lead = session.leads?.[0] ?? null;
    const phone = normalizePhoneE164(body.phone ?? lead?.phone);
    if (!phone) {
      return NextResponse.json({ error: "A valid phone number is required." }, { status: 400 });
    }

    const repCard = getSessionRepCard(session);
    const rep = repCard?.rep;
    const firstName = lead?.firstName || firstToken(session.prospectName) || firstToken(lead?.name) || "there";
    const propertyName = repCard?.property.name ?? session.location ?? "your tour";
    const base = getBaseUrl(request);
    const followUpUrl = `${base}/follow-up/${id}`;
    const mediaUrl =
      body.includeCardImage !== false && rep && base.startsWith("https://")
        ? [`${base}/api/p/${rep.slug}/card?layout=property`]
        : undefined;

    const message = [
      `Hi ${firstName}, thanks again for touring ${propertyName}.`,
      `I put your recap, media, and helpful links here: ${followUpUrl}`,
      "Reply here with any questions. Reply STOP to opt out."
    ].join(" ");

    const result = await sendSms({ to: phone, body: message, mediaUrl });

    return NextResponse.json({
      ok: true,
      sid: result.sid,
      status: result.status,
      to: result.to,
      followUpUrl,
      mediaUrl: mediaUrl?.[0] ?? null
    });
  } catch (error) {
    if (error instanceof TwilioConfigError) {
      return NextResponse.json({ ok: false, skipped: true, reason: "twilio_unconfigured" }, { status: 200 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to send follow-up text." },
      { status: 500 }
    );
  }
}

function getSessionRepCard(session: SessionDetail) {
  const repSlug = session.leads?.find((lead) => lead.repSlug)?.repSlug;
  return getRepCard(repSlug ?? "amulya") ?? getRepCard("alex");
}

function firstToken(value?: string | null) {
  return value?.trim().split(/\s+/)[0] ?? null;
}

function getBaseUrl(request: Request) {
  return (process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin).replace(/\/$/, "");
}
