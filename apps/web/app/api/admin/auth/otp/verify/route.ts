import { NextResponse } from "next/server";

import {
  ADMIN_COMMUNITY_COOKIE,
  ADMIN_REFRESH_COOKIE,
  AdminAuthError,
  adminCookieOptions,
  authAccessCookieMaxAge,
  setAdminAccessCookie,
  createSupabaseAnonClient,
  createMobileWorkspacePayload,
  propertySessionKeys,
  resolveAdminContextForUser,
} from "@/lib/admin-auth";
import { ensurePropertyRubric } from "@/lib/rubrics";
import { getSupabaseServiceClient } from "@/lib/supabase";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as {
    email?: string;
    clientVerified?: boolean;
  };
  const email = body.email?.trim().toLowerCase() ?? "";

  if (!email || body.clientVerified !== true) {
    return NextResponse.json(
      { error: "Email verification is required." },
      { status: 400 }
    );
  }

  try {
    const service = getSupabaseServiceClient();
    const { data: linkData, error: linkError } = await service.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    const tokenHash = linkData?.properties?.hashed_token;
    if (linkError || !tokenHash) {
      return NextResponse.json(
        { error: linkError?.message ?? "No Tour account is connected to this work email yet." },
        { status: 401 }
      );
    }

    const auth = createSupabaseAnonClient();
    const { data, error } = await auth.auth.verifyOtp({ token_hash: tokenHash, type: "magiclink" });
    if (error || !data.user || !data.session) {
      return NextResponse.json(
        { error: error?.message ?? "Could not create the app session." },
        { status: 400 }
      );
    }

    const workspace = await resolveAdminContextForUser(data.user);
    await ensurePropertyRubric(
      workspace.community.propertyTygId,
      propertySessionKeys(workspace.community)
    );
    const compactWorkspace = createMobileWorkspacePayload(workspace);
    const payload = {
      workspace: compactWorkspace,
      session: {
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
        expiresAt:
          data.session.expires_at ??
          Math.floor(Date.now() / 1000) + data.session.expires_in,
      },
    };
    const isMobileClient = request.headers.get("x-tour-client") === "mobile";
    const response = NextResponse.json(isMobileClient ? payload : { workspace: compactWorkspace });
    if (!isMobileClient) {
      setAdminAccessCookie(response, data.session.access_token, authAccessCookieMaxAge(data.session));
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
    }
    return response;
  } catch (caught) {
    const status = caught instanceof AdminAuthError ? caught.status : 500;
    return NextResponse.json(
      { error: caught instanceof Error ? caught.message : "Could not verify the sign-in code." },
      { status }
    );
  }
}
