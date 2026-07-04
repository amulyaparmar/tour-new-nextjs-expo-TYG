import { listTeamAgents } from "@/lib/agents";
import { requireTourWorkspace } from "@/lib/tour-auth";

import { SessionsPageClient } from "./SessionsPageClient";

export const dynamic = "force-dynamic";

export default async function SessionsPage() {
  const workspace = await requireTourWorkspace();
  const propertyIds = workspace.communities.map((community) => community.id);
  const agents = await listTeamAgents(workspace.membership.companyId, propertyIds);
  const currentAgentId = agents.find((agent) => agent.authUserId === workspace.user.id)?.id ?? null;

  return (
    <SessionsPageClient
      agents={agents.map((agent) => ({
        id: agent.id,
        name: agent.name,
        fullName: agent.fullName,
      }))}
      currentAgentId={currentAgentId}
      properties={workspace.communities.map((community) => ({
        id: community.id,
        name: community.name,
      }))}
    />
  );
}
