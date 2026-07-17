import { NextResponse } from "next/server";

import {
  ADMIN_COMMUNITY_COOKIE,
  AdminAuthError,
  requireAdminContext,
} from "@/lib/admin-auth";

export async function GET(request: Request) {
  try {
    const workspace = await requireAdminContext(request);
    const response = NextResponse.json({ workspace });
    response.cookies.set(ADMIN_COMMUNITY_COOKIE, workspace.community.id, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    return response;
  } catch (caught) {
    const status = caught instanceof AdminAuthError ? caught.status : 500;
    return NextResponse.json(
      { error: caught instanceof Error ? caught.message : "Could not load the session." },
      { status }
    );
  }
}
