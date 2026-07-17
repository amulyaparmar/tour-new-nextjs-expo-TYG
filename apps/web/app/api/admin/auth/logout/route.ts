import { NextResponse } from "next/server";

import {
  ADMIN_COMMUNITY_COOKIE,
  ADMIN_REFRESH_COOKIE,
  deleteAdminAccessCookies,
} from "@/lib/admin-auth";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  deleteAdminAccessCookies(response);
  response.cookies.delete(ADMIN_REFRESH_COOKIE);
  response.cookies.delete(ADMIN_COMMUNITY_COOKIE);
  return response;
}
