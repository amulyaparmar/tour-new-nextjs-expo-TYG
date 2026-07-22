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
import { ensurePropertyTeamMember } from "@/lib/property-team";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    email?: string;
    password?: string;
    communityId?: string;
  };

  if (!body.email?.trim() || !body.password) {
    return NextResponse.json(
      { error: "Email and password are required." },
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
    if (body.communityId && workspace.community.id !== body.communityId) {
      throw new AdminAuthError("You do not have access to the selected business.", 403);
    }
    const hasPropertyCard = workspace.community.teamMembers.some(
      (member) => member.email === workspace.user.email
    );
    if (hasPropertyCard && (body.communityId || workspace.communities.length === 1)) {
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

    const isMobileClient = request.headers.get("x-tour-client") === "mobile";
    const responseWorkspace = isMobileClient ? createMobileWorkspacePayload(workspace) : workspace;
    const response = NextResponse.json({
      workspace: responseWorkspace,
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
    return response;
  } catch (caught) {
    const status = caught instanceof AdminAuthError ? caught.status : 500;
    return NextResponse.json(
      { error: caught instanceof Error ? caught.message : "Sign in failed." },
      { status }
    );
  }
}
