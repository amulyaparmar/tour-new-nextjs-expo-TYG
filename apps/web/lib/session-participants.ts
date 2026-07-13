import "server-only";

import type { SessionDetail, SessionSummary } from "@tour/shared";

import type { AdminWorkspace } from "./admin-auth";
import { listTeamAgents } from "./agents";

export async function resolveSessionAgentName(
  session: Pick<SessionSummary, "agentId" | "agentName">,
  workspace: AdminWorkspace
): Promise<string | null> {
  if (session.agentName?.trim()) {
    return session.agentName.trim();
  }

  const agents = await listTeamAgents(workspace.communities);

  if (session.agentId) {
    const matched = agents.find((agent) => agent.id === session.agentId);
    if (matched) {
      return matched.fullName?.trim() || matched.name?.trim() || null;
    }

    if (session.agentId === `user:${workspace.user.id}`) {
      return workspace.user.fullName?.trim() || null;
    }
  }

  const currentAgent = agents.find((agent) => agent.email === workspace.user.email);
  if (currentAgent) {
    return currentAgent.fullName?.trim() || currentAgent.name?.trim() || null;
  }

  return workspace.user.fullName?.trim() || null;
}

export function sessionParticipants(
  agentName: string | null,
  prospectName: string | null
) {
  return {
    agentName: agentName?.trim() || null,
    prospectName: prospectName?.trim() || null,
  };
}

export async function enrichSessionWithAgentName(
  session: SessionDetail,
  workspace: AdminWorkspace
): Promise<SessionDetail> {
  const agentName = await resolveSessionAgentName(session, workspace);
  return {
    ...session,
    agentName: session.agentName?.trim() || agentName,
  };
}
