import "server-only";

import { headers } from "next/headers";

import {
  ADMIN_COMMUNITY_COOKIE,
  AdminAuthError,
  readAdminCookie,
  requireAdminContext,
  resolveFallbackAdminContext,
} from "./admin-auth";

export async function requireTourWorkspace() {
  const requestHeaders = await headers();
  const request = new Request("http://tour.local", {
    headers: requestHeaders,
  });
  try {
    return await requireAdminContext(request);
  } catch (caught) {
    if (caught instanceof AdminAuthError) {
      return resolveFallbackAdminContext(readAdminCookie(request, ADMIN_COMMUNITY_COOKIE));
    }
    throw caught;
  }
}
