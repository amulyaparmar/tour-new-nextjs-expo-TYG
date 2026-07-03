import { NextResponse } from "next/server";

import { AdminAuthError, requireAdminContext } from "@/lib/admin-auth";
import { listCommunityCalendarEvents } from "@/lib/tour-calendar";

export async function GET(request: Request) {
  try {
    const workspace = await requireAdminContext(request);
    const params = new URL(request.url).searchParams;
    const events = await listCommunityCalendarEvents(workspace, {
      fromDate: params.get("fromDate") ?? undefined,
      toDate: params.get("toDate") ?? undefined,
    });
    return NextResponse.json({ community: workspace.community, events });
  } catch (caught) {
    return NextResponse.json(
      { error: caught instanceof Error ? caught.message : "Could not load scheduled tours." },
      { status: caught instanceof AdminAuthError ? caught.status : 500 }
    );
  }
}
