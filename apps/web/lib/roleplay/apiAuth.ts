// Workspace auth guard shared by every /api/roleplay route.
//
// STRICT on purpose (no resolveFallbackAdminContext demo fallback): the
// roleplay UI lives behind the login-gated /new page, so no legitimate caller
// is anonymous — and the proxy's permissive CORS on /api/* means an
// unauthenticated route is reachable from any third-party page. Scenario CRUD
// mutates shared property data and generate-waypoints spends org credentials,
// so everything requires a real workspace.

import "server-only";

import { NextResponse } from "next/server";
import { AdminAuthError, requireAdminContext } from "@/lib/admin-auth";

type RoleplayAuthResult =
  | { workspace: Awaited<ReturnType<typeof requireAdminContext>>; response: null }
  | { workspace: null; response: NextResponse };

export async function requireRoleplayWorkspace(request: Request): Promise<RoleplayAuthResult> {
  try {
    return { workspace: await requireAdminContext(request), response: null };
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return {
        workspace: null,
        response: NextResponse.json(
          { success: false, message: "Not authorized." },
          { status: error.status || 401 }
        ),
      };
    }
    throw error;
  }
}
