import { NextResponse } from "next/server";

import { AdminAuthError, requireAdminContext } from "@/lib/admin-auth";
import { getCommunityCalendarIntegration, syncCommunityCalendar } from "@/lib/tour-calendar";

export async function POST(request: Request) {
  try {
    const workspace = await requireAdminContext(request);
    const sync = await syncCommunityCalendar(workspace);
    const integration = await getCommunityCalendarIntegration(workspace);

    return NextResponse.json({ integration, sync });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Entrata sync failed." },
      { status: error instanceof AdminAuthError ? error.status : 500 }
    );
  }
}
