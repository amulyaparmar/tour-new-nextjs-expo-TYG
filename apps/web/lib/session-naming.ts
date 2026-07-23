import "server-only";

import {
  buildSessionTourTitle,
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

  const derivedTitle = buildSessionTourTitle({
    title: input.currentTitle,
    agentName,
    prospectName,
  });

  return derivedTitle === input.currentTitle.trim() ? null : derivedTitle;
}
