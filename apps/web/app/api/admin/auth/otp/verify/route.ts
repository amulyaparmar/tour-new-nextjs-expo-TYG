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
  isGlobalPropertyAdminEmail,
  listAccessibleBusinessOptionsForEmail,
  propertySessionKeys,
  resolveAdminContextForUser,
} from "@/lib/admin-auth";
import {
  AdminOtpError,
  consumeAdminOtpChallenge,
  restoreAdminOtpChallenge,
} from "@/lib/admin-otp";
import { ensurePropertyRubric } from "@/lib/rubrics";
import { ensurePropertyTeamMember } from "@/lib/property-team";
import { getSupabaseServiceClient } from "@/lib/supabase";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as {
    email?: string;
    challengeId?: string;
    code?: string;
  };
  const email = body.email?.trim().toLowerCase() ?? "";
  const challengeId = body.challengeId?.trim() ?? "";
  const code = body.code?.trim() ?? "";

  if (!email || !UUID_PATTERN.test(challengeId) || !/^\d{6}$/.test(code)) {
    return NextResponse.json(
      { error: "Email verification is required." },
      { status: 400 }
    );
  }

  let challengeConsumed = false;
  try {
    await consumeAdminOtpChallenge({ challengeId, email, code });
    challengeConsumed = true;

    const accessibleBusinesses = await listAccessibleBusinessOptionsForEmail({
      email,
      limit: 1,
    });
    if (
      accessibleBusinesses.length === 0
      && !isGlobalPropertyAdminEmail(email)
    ) {
      return NextResponse.json({
        verified: true,
        onboardingRequired: true,
        email,
      });
    }

    const service = getSupabaseServiceClient();
    const { data: linkData, error: linkError } = await service.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    const tokenHash = linkData?.properties?.hashed_token;
    if (linkError || !tokenHash) {
      await restoreAdminOtpChallenge(challengeId, email).catch(() => undefined);
      challengeConsumed = false;
      return NextResponse.json(
        { error: linkError?.message ?? "No Tour account is connected to this work email yet." },
        { status: 401 }
      );
    }

    const auth = createSupabaseAnonClient();
    const { data, error } = await auth.auth.verifyOtp({ token_hash: tokenHash, type: "magiclink" });
    if (error || !data.user || !data.session) {
      await restoreAdminOtpChallenge(challengeId, email).catch(() => undefined);
      challengeConsumed = false;
      return NextResponse.json(
        { error: error?.message ?? "Could not create the app session." },
        { status: 400 }
      );
    }

    const workspace = await resolveAdminContextForUser(data.user);
    const hasPropertyCard = workspace.community.teamMembers.some(
      (member) => member.email === workspace.user.email
    );
    if (hasPropertyCard && workspace.communities.length === 1) {
      await ensurePropertyTeamMember({
        propertyId: workspace.community.propertyTygId,
        userId: workspace.user.id,
        email: workspace.user.email,
        name: workspace.user.fullName ?? workspace.teamMember.name,
        alias: workspace.teamMember.alias,
        phone: workspace.user.phone ?? workspace.teamMember.phone,
        role: workspace.teamMember.role,
        title: workspace.user.title ?? workspace.teamMember.title,
        cardAccent: workspace.user.cardAccent ?? workspace.teamMember.cardAccent,
        propertyAlias: workspace.community.alias,
        verified: true,
      });
    }
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
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (caught) {
    const status = caught instanceof AdminOtpError
      ? caught.status
      : caught instanceof AdminAuthError
        ? caught.status
        : 500;
    if (challengeConsumed && status >= 500) {
      await restoreAdminOtpChallenge(challengeId, email).catch(() => undefined);
    }
    return NextResponse.json(
      { error: caught instanceof Error ? caught.message : "Could not verify the sign-in code." },
      { status }
    );
  }
}
