import "server-only";

import {
  AdminAuthError,
  isGlobalPropertyAdminEmail,
  propertySessionKeys,
  requireAdminContext,
  type AdminWorkspace,
} from "./admin-auth";
import { getSessionById } from "./sessions";

export async function requireSessionReadAccess(request: Request, sessionId: string) {
  const workspace = await requireAdminContext(request);
  const session = await getSessionById(sessionId);
  if (!session) throw new AdminAuthError("Session not found.", 403);
  return { workspace, session };
}

export async function requireSessionWriteAccess(request: Request, sessionId: string) {
  const result = await requireSessionReadAccess(request, sessionId);
  if (canWriteSession(result.workspace, result.session.propertyId)) return result;
  throw new AdminAuthError(
    "Request access to this property's team before changing this session.",
    403
  );
}

export function canWriteSession(workspace: AdminWorkspace, propertyId: string | null | undefined) {
  if (isGlobalPropertyAdminEmail(workspace.user.email)) return true;
  return workspace.communities.some((community) =>
    propertySessionKeys(community).includes(propertyId ?? "")
  );
}
