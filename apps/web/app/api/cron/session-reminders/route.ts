import { NextResponse } from "next/server";

import { sendUpcomingSessionReminders } from "@/lib/push";

function authorizeCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const header = request.headers.get("authorization");
  if (header === `Bearer ${secret}`) return true;
  const vercelAuth = request.headers.get("x-vercel-cron-auth");
  if (vercelAuth && vercelAuth === secret) return true;
  return false;
}

export async function GET(request: Request) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const result = await sendUpcomingSessionReminders(60);
    return NextResponse.json({
      ok: true,
      ranAt: new Date().toISOString(),
      ...result,
    });
  } catch (caught) {
    return NextResponse.json(
      { error: caught instanceof Error ? caught.message : "Reminder cron failed." },
      { status: 500 },
    );
  }
}
