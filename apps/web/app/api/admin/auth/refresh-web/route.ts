import { NextResponse } from "next/server";

import {
  ADMIN_COMMUNITY_COOKIE,
  ADMIN_REFRESH_COOKIE,
  adminCookieOptions,
  authAccessCookieMaxAge,
  setAdminAccessCookie,
  createSupabaseAnonClient,
  deleteAdminAccessCookies,
  readAdminCookie,
} from "@/lib/admin-auth";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const nextPath = safeNextPath(requestUrl.searchParams.get("next"));
  const refreshToken = readAdminCookie(request, ADMIN_REFRESH_COOKIE);

  if (!refreshToken) {
    return redirectToLogin(requestUrl, nextPath);
  }

  try {
    const supabase = createSupabaseAnonClient();
    const { data, error } = await withTimeout(
      supabase.auth.refreshSession({
        refresh_token: refreshToken,
      }),
      5_000
    );
    if (error || !data.user || !data.session) {
      return redirectToLogin(requestUrl, nextPath);
    }

    const response = NextResponse.redirect(new URL(nextPath, requestUrl.origin));
    setAdminAccessCookie(response, data.session.access_token, authAccessCookieMaxAge(data.session));
    response.cookies.set(
      ADMIN_REFRESH_COOKIE,
      data.session.refresh_token,
      adminCookieOptions(60 * 60 * 24 * 30)
    );
    const communityId = readAdminCookie(request, ADMIN_COMMUNITY_COOKIE);
    if (communityId) {
      response.cookies.set(
        ADMIN_COMMUNITY_COOKIE,
        communityId,
        adminCookieOptions(60 * 60 * 24 * 30)
      );
    }
    return response;
  } catch {
    return redirectToLogin(requestUrl, nextPath);
  }
}

function redirectToLogin(requestUrl: URL, nextPath: string) {
  const loginUrl = new URL("/login", requestUrl.origin);
  if (nextPath !== "/") loginUrl.searchParams.set("next", nextPath);
  const response = NextResponse.redirect(loginUrl);
  deleteAdminAccessCookies(response);
  response.cookies.delete(ADMIN_REFRESH_COOKIE);
  return response;
}

function safeNextPath(value: string | null) {
  if (!value?.startsWith("/") || value.startsWith("//")) return "/";
  if (value.startsWith("/api/")) return "/";
  if (value.startsWith("/login")) return "/";
  return value;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error("Refresh timed out.")), ms);
    }),
  ]);
}
