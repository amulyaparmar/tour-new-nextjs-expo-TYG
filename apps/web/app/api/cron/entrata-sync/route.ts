import { NextResponse } from "next/server";

import { buildSystemWorkspaceForProperty } from "@/lib/admin-auth";
import {
  listAutoSyncEntrataIntegrations,
  syncCommunityCalendar,
} from "@/lib/tour-calendar";

function authorizeCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const header = request.headers.get("authorization");
  if (header === `Bearer ${secret}`) return true;
  // Vercel Cron sends this header in production when CRON_SECRET is set.
  const vercelAuth = request.headers.get("x-vercel-cron-auth");
  if (vercelAuth && vercelAuth === secret) return true;
  return false;
}

export async function GET(request: Request) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const targets = await listAutoSyncEntrataIntegrations();
  const results: Array<{
    propertyId: string;
    ok: boolean;
    eventsSynced?: number;
    error?: string;
  }> = [];

  for (const target of targets) {
    try {
      const workspace = await buildSystemWorkspaceForProperty(target.propertyId);
      const sync = await syncCommunityCalendar(workspace);
      results.push({
        propertyId: target.propertyId,
        ok: true,
        eventsSynced: sync.eventsSynced,
      });
    } catch (caught) {
      results.push({
        propertyId: target.propertyId,
        ok: false,
        error: caught instanceof Error ? caught.message : "Sync failed.",
      });
    }
  }

  return NextResponse.json({
    ok: true,
    ranAt: new Date().toISOString(),
    attempted: targets.length,
    results,
  });
}
