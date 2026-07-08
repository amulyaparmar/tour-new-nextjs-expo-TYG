export type SessionParticipants = {
  agentName: string | null;
  prospectName: string | null;
};

/** Canonical diarized speaker labels stored on transcript segments. */
export const TRANSCRIPT_SPEAKER_AGENT = "Agent" as const;
export const TRANSCRIPT_SPEAKER_PROSPECT = "Prospect" as const;

const AGENT_ROLE_PATTERN =
  /^(agent|leasing agent|representative|rep|speaker\s*1|staff|associate)$/i;
const PROSPECT_ROLE_PATTERN =
  /^(prospect|customer|client|guest|visitor|speaker\s*2|renter|lead)$/i;
const MARKUP_PATTERN = /<\/?[a-z][\w:-]*(?:\s[^>]*)?>/i;
const WRAPPER_TOKEN_PATTERN = /\b(?:antml|parameter|tool_use|tool_result)\b/i;

/** Map ElevenLabs detect_speaker_roles IDs to our transcript labels. */
export function mapElevenLabsSpeakerId(speakerId: string | null | undefined): string | null {
  if (!speakerId?.trim()) return null;
  const normalized = speakerId.trim().toLowerCase();
  if (normalized === "agent") return TRANSCRIPT_SPEAKER_AGENT;
  if (normalized === "customer" || normalized === "client") return TRANSCRIPT_SPEAKER_PROSPECT;
  return null;
}

export function hasDiarizedRoleLabels(
  transcript: ReadonlyArray<{ speaker: string }>
): boolean {
  return transcript.some(
    (segment) => isAgentSpeakerLabel(segment.speaker) || isProspectSpeakerLabel(segment.speaker)
  );
}

export function buildDiarizedRoleHint(): string {
  return [
    "Speaker labels in this transcript use diarized roles:",
    `- "${TRANSCRIPT_SPEAKER_AGENT}" = leasing agent / staff member`,
    `- "${TRANSCRIPT_SPEAKER_PROSPECT}" = visitor / customer / prospect`,
    "Use self-introductions and how speakers address each other to extract agentName (from Agent lines) and prospectName (from Prospect lines).",
  ].join("\n");
}

export function isAgentSpeakerLabel(speaker: string | null | undefined): boolean {
  const raw = (speaker ?? "").trim();
  if (!raw) return true;
  if (AGENT_ROLE_PATTERN.test(raw)) return true;
  return raw.toLowerCase() === "agent";
}

export function isProspectSpeakerLabel(speaker: string | null | undefined): boolean {
  const raw = (speaker ?? "").trim();
  if (!raw) return false;
  if (PROSPECT_ROLE_PATTERN.test(raw)) return true;
  return raw.toLowerCase() === "prospect";
}

export function normalizeParticipantName(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  const normalized = trimmed.toLowerCase();
  if (normalized === "null" || normalized === "unknown" || normalized === "n/a") {
    return null;
  }

  if (MARKUP_PATTERN.test(trimmed) || WRAPPER_TOKEN_PATTERN.test(trimmed)) {
    return null;
  }

  return trimmed;
}

/** Display name with role annotation, e.g. "Joseph · Agent". */
export function formatSpeakerAnnotation(
  speaker: string | null | undefined,
  participants: SessionParticipants
): string {
  const raw = (speaker ?? "").trim();
  const agent = participants.agentName?.trim() || null;
  const prospect = participants.prospectName?.trim() || null;

  if (isAgentSpeakerLabel(raw)) {
    return agent ? `${agent} · Agent` : TRANSCRIPT_SPEAKER_AGENT;
  }

  if (isProspectSpeakerLabel(raw)) {
    return prospect ? `${prospect} · Prospect` : TRANSCRIPT_SPEAKER_PROSPECT;
  }

  if (agent && raw.toLowerCase() === agent.toLowerCase()) {
    return `${agent} · Agent`;
  }

  if (prospect && raw.toLowerCase() === prospect.toLowerCase()) {
    return `${prospect} · Prospect`;
  }

  return raw || "Speaker";
}

export function buildParticipantPromptLines(participants: SessionParticipants): string[] {
  const lines: string[] = [];
  if (participants.agentName?.trim()) {
    lines.push(`Leasing agent name: ${participants.agentName.trim()}`);
  }
  if (participants.prospectName?.trim()) {
    lines.push(`Prospect name: ${participants.prospectName.trim()}`);
  }
  if (lines.length) {
    lines.push(
      "Label speakers using these names with role annotations (e.g. \"Alex · Agent\", \"Jordan · Prospect\").",
      "Do not use generic labels like \"Agent\" or \"Prospect\" when names are provided."
    );
  }
  return lines;
}
