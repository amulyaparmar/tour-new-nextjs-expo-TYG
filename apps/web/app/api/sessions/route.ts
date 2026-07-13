import { NextRequest, NextResponse } from "next/server";

import type { SessionStatus } from "@tour/shared";
import {
  ADMIN_COMMUNITY_COOKIE,
  hasAdminSession,
  readAdminCookie,
  propertySessionKeys,
  requireAdminContext,
  resolveFallbackAdminContext,
} from "@/lib/admin-auth";
import { listTeamAgents } from "@/lib/agents";
import { createSession, listSessionsPaginated } from "@/lib/sessions";

const VALID_STATUSES: SessionStatus[] = [
  "scheduled", "in_progress", "uploaded", "transcribing", "segmenting",
  "analyzing", "analysis_ready", "reviewed", "failed",
];
const COMPLETED_STATUSES: SessionStatus[] = ["analysis_ready", "reviewed"];

const VALID_SORTS = ["newest", "oldest", "score_desc", "score_asc", "scheduled_asc"] as const;

export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;

    const page = Math.max(1, parseInt(sp.get("page") ?? "1", 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(sp.get("limit") ?? "20", 10) || 20));
    const search = sp.get("search")?.trim() || undefined;
    const upcoming = sp.get("upcoming") === "true";
    const statusParam = sp.get("status");
    const status = statusParam && VALID_STATUSES.includes(statusParam as SessionStatus)
      ? statusParam as SessionStatus
      : undefined;
    const statuses = statusParam === "completed" ? COMPLETED_STATUSES : undefined;
    const sortParam = sp.get("sort") as (typeof VALID_SORTS)[number] | null;
    const sort = sortParam && (VALID_SORTS as readonly string[]).includes(sortParam)
      ? sortParam as (typeof VALID_SORTS)[number]
      : undefined;

    const workspace = hasAdminSession(request)
      ? await requireAdminContext(request)
      : await resolveFallbackAdminContext(readAdminCookie(request, ADMIN_COMMUNITY_COOKIE));

    const propertyParam = sp.get("propertyId");
    const accessibleProperties = workspace?.communities ?? [];
    const accessiblePropertyIds = accessibleProperties.map((community) => community.propertyTygId);
    let propertyId: string | undefined;
    let propertyIds: string[] | undefined;

    if (propertyParam && propertyParam !== "all") {
      if (accessiblePropertyIds.includes(propertyParam)) {
        propertyIds = propertySessionKeys(
          accessibleProperties.find((community) => community.propertyTygId === propertyParam)!
        );
      }
    } else if (accessiblePropertyIds.length > 0) {
      propertyIds = accessibleProperties.flatMap(propertySessionKeys);
    }

    const agentParam = sp.get("agentId")?.trim();
    let agentId: string | undefined;
    if (agentParam && workspace) {
      const teamAgents = await listTeamAgents(workspace.communities);
      if (teamAgents.some((agent) => agent.id === agentParam)) {
        agentId = agentParam;
      }
    }

    const result = await listSessionsPaginated({
      page,
      limit,
      search,
      status,
      statuses,
      sort,
      propertyId,
      propertyIds,
      agentId,
      excludeScheduled: !upcoming,
      upcomingFrom: upcoming ? new Date().toISOString() : undefined,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch sessions." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const workspace = hasAdminSession(request)
      ? await requireAdminContext(request)
      : await resolveFallbackAdminContext(readAdminCookie(request, ADMIN_COMMUNITY_COOKIE));
    const body = (await request.json()) as {
      title?: string;
      scheduledAt?: string | null;
      location?: string | null;
      prospectName?: string | null;
      agentName?: string | null;
      notes?: string | null;
      rubricId?: string | null;
      agentId?: string | null;
      propertyId?: string | null;
      unitLabel?: string | null;
    };

    if (!body.title?.trim()) {
      return NextResponse.json({ error: "title is required." }, { status: 400 });
    }

    const requestedPropertyId = body.propertyId?.trim() || workspace.community.propertyTygId;
    if (!workspace.communities.some((community) => community.propertyTygId === requestedPropertyId)) {
      return NextResponse.json({ error: "That property is not available to this team member." }, { status: 403 });
    }

    const session = await createSession({
      title: body.title,
      scheduledAt: body.scheduledAt ?? null,
      location: body.location ?? null,
      prospectName: body.prospectName ?? null,
      agentName: body.agentName ?? workspace.user.fullName ?? null,
      notes: body.notes ?? null,
      rubricId: body.rubricId ?? null,
      agentId: body.agentId ?? `user:${workspace.user.id}`,
      propertyId: requestedPropertyId,
      unitLabel: body.unitLabel ?? null
    });

    return NextResponse.json({ session }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create session." },
      { status: 500 }
    );
  }
}
