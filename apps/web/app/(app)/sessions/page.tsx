import { listTeamAgents } from "@/lib/agents";
import { requireTourWorkspace } from "@/lib/tour-auth";

import { SessionsPageClient } from "./SessionsPageClient";

export const dynamic = "force-dynamic";

export default async function SessionsPage() {
  const workspace = await requireTourWorkspace();
  const agents = await listTeamAgents(workspace.communities);
  const currentAgentId = agents.find((agent) => agent.email === workspace.user.email)?.id ?? null;

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
