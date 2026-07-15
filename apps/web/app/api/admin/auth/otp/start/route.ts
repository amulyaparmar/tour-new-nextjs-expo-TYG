import { NextResponse } from "next/server";

const PERSONAL_EMAIL_DOMAINS = new Set(["gmail.com", "googlemail.com"]);
const REPORT_ACCESS_URL = "https://tour.report/api/verify-access";
const REPORT_ACCESS_KEY = "LeaseMagnets2025TYG";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { email?: string };
  const email = body.email?.trim().toLowerCase() ?? "";
  const domain = email.split("@")[1] ?? "";
  const isMobileClient = request.headers.get("x-tour-client") === "mobile";

  if (!email || !domain) {
    return NextResponse.json({ error: "Enter a valid work email address." }, { status: 400 });
  }
  if (PERSONAL_EMAIL_DOMAINS.has(domain)) {
    return NextResponse.json(
      { error: "Use the work email connected to your Tour account." },
      { status: 400 }
    );
  }

  try {
    const challengeCode = String(Math.floor(1000 + Math.random() * 9000));
    const displayName = email
      .split("@")[0]
      ?.split(/[._-]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ") || "Tour user";
    const deliveryResponse = await fetch(REPORT_ACCESS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        e: encodeReportAccessValue(email),
        n: encodeReportAccessValue(displayName),
        c: challengeCode,
        t: "tour-mobile",
      }),
    });
    const deliveryBody = await deliveryResponse.json().catch(() => null) as {
      success?: boolean;
      message?: string;
    } | null;
    if (!deliveryResponse.ok || !deliveryBody?.success) {
      // Mobile verifies client-side. If email delivery fails, still return the
      // challenge so TestFlight/dev can sign in without the inbox.
      if (isMobileClient) {
        return NextResponse.json({
          sent: false,
          email,
          challengeCode,
          deliveryError: deliveryBody?.message ?? "Could not send a sign-in code.",
        });
      }
      return NextResponse.json(
        { error: deliveryBody?.message ?? "Could not send a sign-in code." },
        { status: deliveryResponse.status || 502 }
      );
    }
    return NextResponse.json({ sent: true, email, challengeCode });
  } catch (caught) {
    return NextResponse.json(
      { error: caught instanceof Error ? caught.message : "Could not send a sign-in code." },
      { status: 500 }
    );
  }
}

function encodeReportAccessValue(value: string) {
  let encrypted = "";
  for (let index = 0; index < value.length; index += 1) {
    encrypted += String.fromCharCode(
      value.charCodeAt(index) ^ REPORT_ACCESS_KEY.charCodeAt(index % REPORT_ACCESS_KEY.length)
    );
  }
  return Buffer.from(encrypted, "binary").toString("base64");
}
