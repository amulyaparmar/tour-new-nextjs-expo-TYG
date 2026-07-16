import { NextResponse } from "next/server";

import { AdminAuthError, requireAdminContext } from "@/lib/admin-auth";
import {
  disconnectCommunityEntrata,
  getCommunityCalendarIntegration,
  setCommunityEntrataAutoSync,
} from "@/lib/tour-calendar";

export async function GET(request: Request) {
  try {
    const workspace = await requireAdminContext(request);
    const entrata = await getCommunityCalendarIntegration(workspace);
    return NextResponse.json({ integrations: { entrata } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load integrations." },
      { status: error instanceof AdminAuthError ? error.status : 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const workspace = await requireAdminContext(request);
    const body = (await request.json()) as {
      provider?: "entrata";
      status?: "disconnected";
      autoSyncEnabled?: boolean;
    };

    if (body.provider !== "entrata") {
      return NextResponse.json({ error: "Unsupported integration update." }, { status: 400 });
    }

    if (typeof body.autoSyncEnabled === "boolean") {
      const entrata = await setCommunityEntrataAutoSync(workspace, body.autoSyncEnabled);
      return NextResponse.json({ integrations: { entrata } });
    }

    if (body.status !== "disconnected") {
      return NextResponse.json({ error: "Unsupported integration update." }, { status: 400 });
    }

    const entrata = await disconnectCommunityEntrata(workspace);
    return NextResponse.json({ integrations: { entrata } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update integration." },
      { status: error instanceof AdminAuthError ? error.status : 500 }
    );
  }
}
