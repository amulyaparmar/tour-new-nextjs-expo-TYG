import "server-only";

import type { Session, User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import {
  ADMIN_COMMUNITY_COOKIE,
  ADMIN_REFRESH_COOKIE,
  adminCookieOptions,
  authAccessCookieMaxAge,
  resolveAdminContextForUser,
  setAdminAccessCookie,
} from "./admin-auth";
import { getSupabaseServiceClient } from "./supabase";

export async function completeRegistration(requestId: string, user: User) {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase.rpc("complete_verified_registration", {
    request_id: requestId,
    auth_user_id: user.id,
  } as never);
  if (error) throw new Error(error.message);

  const result = (Array.isArray(data) ? data[0] : data) as {
    selected_community_id?: string;
  } | null;
  if (!result?.selected_community_id) {
    throw new Error("Registration did not return a community.");
  }
  return resolveAdminContextForUser(user, result.selected_community_id);
}

export function registrationSessionResponse(
  workspace: Awaited<ReturnType<typeof resolveAdminContextForUser>>,
  session: Session
) {
  const response = NextResponse.json({ workspace, verified: true });
  setAdminAccessCookie(response, session.access_token, authAccessCookieMaxAge(session));
  response.cookies.set(
    ADMIN_REFRESH_COOKIE,
    session.refresh_token,
    adminCookieOptions(60 * 60 * 24 * 30)
  );
  response.cookies.set(
    ADMIN_COMMUNITY_COOKIE,
    workspace.community.id,
    adminCookieOptions(60 * 60 * 24 * 30)
  );
  return response;
}
