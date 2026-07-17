import { NextResponse } from "next/server";

import {
  type AdminWorkspace,
  ADMIN_COMMUNITY_COOKIE,
  ADMIN_REFRESH_COOKIE,
  AdminAuthError,
  adminCookieOptions,
  authAccessCookieMaxAge,
  createSupabaseAnonClient,
  createMobileWorkspacePayload,
  propertySessionKeys,
  readAdminCookie,
  requireAdminContext,
  resolveAdminContextForUser,
  setAdminAccessCookie,
} from "@/lib/admin-auth";
import { ensurePropertyRubric } from "@/lib/rubrics";

export async function POST(request: Request) {
  const body = (await request.json()) as { communityId?: string };
  if (!body.communityId) {
    return NextResponse.json({ error: "communityId is required." }, { status: 400 });
  }

  const scopedRequest = new Request(request.url, {
    headers: new Headers(request.headers),
  });
  scopedRequest.headers.set("x-admin-community-id", body.communityId);

  try {
    const { workspace, session } = await resolveWorkspace(scopedRequest, body.communityId);
    await ensurePropertyRubric(
      workspace.community.propertyTygId,
      propertySessionKeys(workspace.community)
    );
    const response = NextResponse.json({
      workspace: request.headers.get("x-tour-client") === "mobile"
        ? createMobileWorkspacePayload(workspace)
        : workspace,
    });
    response.cookies.set(
      ADMIN_COMMUNITY_COOKIE,
      workspace.community.id,
      adminCookieOptions(60 * 60 * 24 * 30)
    );
    if (session) {
      setAdminAccessCookie(response, session.access_token, authAccessCookieMaxAge(session));
      response.cookies.set(
        ADMIN_REFRESH_COOKIE,
        session.refresh_token,
        adminCookieOptions(60 * 60 * 24 * 30)
      );
    }
    return response;
  } catch (caught) {
    const status = caught instanceof AdminAuthError ? caught.status : 500;
    return NextResponse.json(
      { error: caught instanceof Error ? caught.message : "Could not switch community." },
      { status }
    );
  }
}

async function resolveWorkspace(
  request: Request,
  communityId: string
): Promise<{ workspace: AdminWorkspace; session?: { access_token: string; refresh_token: string; expires_at?: number | null; expires_in?: number | null } }> {
  try {
    return { workspace: await requireAdminContext(request) };
  } catch (caught) {
    if (!(caught instanceof AdminAuthError) || caught.status !== 401) {
      throw caught;
    }
    const refreshToken = readAdminCookie(request, ADMIN_REFRESH_COOKIE);
    if (!refreshToken) throw caught;
    const supabase = createSupabaseAnonClient();
    const { data, error } = await withTimeout(
      supabase.auth.refreshSession({
        refresh_token: refreshToken,
      }),
      5_000
    );
    if (error || !data.user || !data.session) throw caught;
    const workspace = await resolveAdminContextForUser(data.user, communityId);
    return { workspace, session: data.session };
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error("Refresh timed out.")), ms);
    }),
  ]);
}
