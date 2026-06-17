import { NextResponse } from "next/server";

import { getRepCard, type RepProfile } from "@/lib/reps";
import { sendSms, TwilioConfigError, normalizePhoneE164 } from "@/lib/twilio";

export const dynamic = "force-dynamic";

type TextContactParams = {
  params: Promise<{ slug: string }>;
};

function buildContactMessage(rep: RepProfile): string {
  const lines = [
    `Hi! This is ${rep.name}, ${rep.title} at ${rep.company}.`,
    "Here's my contact info:",
    rep.phoneDisplay,
    rep.email
  ];
  if (rep.website) lines.push(rep.website);
  lines.push("", "Save my card and reply here anytime. Reply STOP to opt out.");
  return lines.filter((line) => line !== undefined).join("\n");
}

export async function POST(request: Request, { params }: TextContactParams) {
  try {
    const { slug } = await params;
    const card = getRepCard(slug);
    if (!card) {
      return NextResponse.json({ error: "Unknown rep." }, { status: 404 });
    }

    const body = (await request.json().catch(() => ({}))) as { phone?: string; layout?: string };
    const phone = normalizePhoneE164(body.phone);
    if (!phone) {
      return NextResponse.json({ error: "A valid phone number is required." }, { status: 400 });
    }

    // Attach the generated tour-card image as MMS. Twilio fetches this URL
    // server-side, so it must be publicly reachable — works once deployed (and
    // anywhere NEXT_PUBLIC_SITE_URL is a public host); from localhost Twilio
    // can't reach it and the image is silently dropped to a plain SMS.
    const base = (process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin).replace(/\/$/, "");
    const layout = body.layout === "rep" ? "rep" : "property";
    const cardImageUrl = `${base}/api/p/${slug}/card?layout=${layout}`;

    const message = buildContactMessage(card.rep);
    const result = await sendSms({ to: phone, body: message, mediaUrl: [cardImageUrl] });
    return NextResponse.json({ ok: true, sid: result.sid, status: result.status, mediaUrl: cardImageUrl });
  } catch (error) {
    if (error instanceof TwilioConfigError) {
      // Not configured in this environment — surface as a soft failure so the
      // client can treat texting as best-effort without showing a hard error.
      return NextResponse.json({ ok: false, skipped: true, reason: "twilio_unconfigured" }, { status: 200 });
    }
    console.error("text-contact error", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to send contact text." },
      { status: 500 }
    );
  }
}
