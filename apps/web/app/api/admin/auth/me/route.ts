import { NextResponse } from "next/server";

import {
  ADMIN_ACCESS_COOKIE,
  ADMIN_COMMUNITY_COOKIE,
  ADMIN_REFRESH_COOKIE,
  AdminAuthError,
  adminCookieOptions,
  createSupabaseAnonClient,
  readAdminCookie,
  requireAdminContext,
  resolveAdminContextForUser,
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
    const refreshToken = readAdminCookie(request, ADMIN_REFRESH_COOKIE);
    if (status === 401 && refreshToken) {
      try {
        const supabase = createSupabaseAnonClient();
        const { data, error } = await supabase.auth.refreshSession({
          refresh_token: refreshToken,
        });
        if (error || !data.user || !data.session) throw error ?? new Error("Refresh failed.");
        const workspace = await resolveAdminContextForUser(
          data.user,
          readAdminCookie(request, ADMIN_COMMUNITY_COOKIE)
        );
        const response = NextResponse.json({ workspace });
        response.cookies.set(
          ADMIN_ACCESS_COOKIE,
          data.session.access_token,
          adminCookieOptions(Math.max(60, data.session.expires_in))
        );
        response.cookies.set(
          ADMIN_REFRESH_COOKIE,
          data.session.refresh_token,
          adminCookieOptions(60 * 60 * 24 * 30)
        );
        response.cookies.set(
          ADMIN_COMMUNITY_COOKIE,
          workspace.community.id,
          adminCookieOptions(60 * 60 * 24 * 30)
        );
        return response;
      } catch {
        // Fall through and clear the expired session cookies.
      }
    }
    const response = NextResponse.json(
      { error: caught instanceof Error ? caught.message : "Could not load the session." },
      { status }
    );
    if (status === 401) {
      response.cookies.delete(ADMIN_ACCESS_COOKIE);
      response.cookies.delete(ADMIN_REFRESH_COOKIE);
    }
    return response;
  }
}
