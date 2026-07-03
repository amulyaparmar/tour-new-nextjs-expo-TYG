import { NextResponse } from "next/server";

import {
  ADMIN_ACCESS_COOKIE,
  ADMIN_COMMUNITY_COOKIE,
  ADMIN_REFRESH_COOKIE,
} from "@/lib/admin-auth";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(ADMIN_ACCESS_COOKIE);
  response.cookies.delete(ADMIN_REFRESH_COOKIE);
  response.cookies.delete(ADMIN_COMMUNITY_COOKIE);
  return response;
}
