import "server-only";

import {
  buildSessionTourTitle,
  isGenericSessionTitle,
  normalizeParticipantName,
} from "@tour/shared";

export function deriveSessionTitleFromParticipants(input: {
  currentTitle: string;
  agentName?: string | null;
  prospectName?: string | null;
}): string | null {
  const agentName = normalizeParticipantName(input.agentName);
  const prospectName = normalizeParticipantName(input.prospectName);
  if (!agentName || !prospectName) return null;

  if (!shouldRefreshSessionTitle(input.currentTitle, agentName, prospectName)) {
    return null;
  }

  return buildSessionTourTitle({
    agentName,
    prospectName,
    preferPeopleTitle: true,
  });
}

function shouldRefreshSessionTitle(title: string, agentName: string, prospectName: string) {
  if (isGenericSessionTitle(title)) return true;

  const normalized = title.trim().toLowerCase();
  const agent = agentName.trim().split(/\s+/)[0]?.toLowerCase();
  const prospect = prospectName.trim().split(/\s+/)[0]?.toLowerCase();
  if (!agent || !prospect) return false;

  return normalized.includes(agent) && normalized.includes(prospect);
}
