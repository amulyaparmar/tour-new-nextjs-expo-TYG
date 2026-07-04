import { NextResponse } from "next/server";

import {
  ADMIN_COMMUNITY_COOKIE,
  AdminAuthError,
  adminCookieOptions,
  requireAdminContext,
  resolveFallbackAdminContext,
} from "@/lib/admin-auth";

export async function POST(request: Request) {
  const body = (await request.json()) as { communityId?: string };
  if (!body.communityId) {
    return NextResponse.json({ error: "communityId is required." }, { status: 400 });
  }

  try {
    const scopedRequest = new Request(request.url, {
      headers: new Headers(request.headers),
    });
    scopedRequest.headers.set("x-admin-community-id", body.communityId);
    const workspace = await requireAdminContext(scopedRequest);
    const response = NextResponse.json({ workspace });
    response.cookies.set(
      ADMIN_COMMUNITY_COOKIE,
      workspace.community.id,
      adminCookieOptions(60 * 60 * 24 * 30)
    );
    return response;
  } catch (caught) {
    if (caught instanceof AdminAuthError) {
      const workspace = await resolveFallbackAdminContext(body.communityId);
      const response = NextResponse.json({ workspace });
      response.cookies.set(
        ADMIN_COMMUNITY_COOKIE,
        workspace.community.id,
        adminCookieOptions(60 * 60 * 24 * 30)
      );
      return response;
    }

    const status = 500;
    return NextResponse.json(
      { error: caught instanceof Error ? caught.message : "Could not switch community." },
      { status }
    );
  }
}
