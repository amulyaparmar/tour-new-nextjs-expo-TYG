import { NextResponse } from "next/server";

import {
  ADMIN_ACCESS_COOKIE,
  ADMIN_COMMUNITY_COOKIE,
  ADMIN_REFRESH_COOKIE,
  AdminAuthError,
  adminCookieOptions,
  createSupabaseAnonClient,
  resolveAdminContextForUser,
} from "@/lib/admin-auth";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    email?: string;
    password?: string;
    communityId?: string;
  };

  if (!body.email?.trim() || !body.password || !body.communityId) {
    return NextResponse.json(
      { error: "Business, email, and password are required." },
      { status: 400 }
    );
  }

  let authResult;
  try {
    const supabase = createSupabaseAnonClient();
    authResult = await supabase.auth.signInWithPassword({
      email: body.email.trim(),
      password: body.password,
    });
  } catch (caught) {
    return NextResponse.json(
      { error: caught instanceof Error ? caught.message : "Authentication is unavailable." },
      { status: 500 }
    );
  }
  const { data, error } = authResult;

  if (error || !data.user || !data.session) {
    return NextResponse.json(
      { error: error?.message ?? "Sign in failed." },
      { status: 401 }
    );
  }

  try {
    const workspace = await resolveAdminContextForUser(data.user, body.communityId);
    if (workspace.community.id !== body.communityId) {
      throw new AdminAuthError("You do not have access to the selected business.", 403);
    }

    const isMobileClient = request.headers.get("x-tour-client") === "mobile";
    const response = NextResponse.json({
      workspace,
      ...(isMobileClient
        ? {
            session: {
              accessToken: data.session.access_token,
              refreshToken: data.session.refresh_token,
              expiresAt: data.session.expires_at ?? Math.floor(Date.now() / 1000) + data.session.expires_in,
            },
          }
        : {}),
    });
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
  } catch (caught) {
    const status = caught instanceof AdminAuthError ? caught.status : 500;
    return NextResponse.json(
      { error: caught instanceof Error ? caught.message : "Sign in failed." },
      { status }
    );
  }
}
