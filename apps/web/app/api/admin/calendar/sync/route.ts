import { NextResponse } from "next/server";

import { AdminAuthError, requireAdminContext } from "@/lib/admin-auth";
import { syncCommunityCalendar } from "@/lib/tour-calendar";

export async function POST(request: Request) {
  try {
    const workspace = await requireAdminContext(request);
    const body = await request.json().catch(() => ({})) as {
      fromDate?: string;
      toDate?: string;
    };
    const sync = await syncCommunityCalendar(workspace, body);
    return NextResponse.json({ sync });
  } catch (caught) {
    return NextResponse.json(
      { error: caught instanceof Error ? caught.message : "Calendar sync failed." },
      { status: caught instanceof AdminAuthError ? caught.status : 500 }
    );
  }
}
