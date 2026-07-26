export type SessionParticipants = {
  agentName: string | null;
  prospectName: string | null;
  /** Model confidence that the extracted agent name is correct, from 0–100. */
  agentNameConfidence?: number | null;
  /** Model confidence that the extracted prospect name is correct, from 0–100. */
  prospectNameConfidence?: number | null;
  /** Earliest point where the agent name is spoken, in seconds. */
  agentNameFirstMentionSeconds?: number | null;
  /** Earliest point where the prospect name is spoken, in seconds. */
  prospectNameFirstMentionSeconds?: number | null;
};

export const PARTICIPANT_NAME_CONFIDENCE_THRESHOLD = 60;

/** Canonical diarized speaker labels stored on transcript segments. */
export const TRANSCRIPT_SPEAKER_AGENT = "Agent" as const;
export const TRANSCRIPT_SPEAKER_PROSPECT = "Prospect" as const;

const AGENT_ROLE_PATTERN =
  /^(agent|leasing agent|representative|rep|speaker\s*1|staff|associate)$/i;
const PROSPECT_ROLE_PATTERN =
  /^(prospect|customer|client|guest|visitor|speaker\s*2|renter|lead)$/i;
const AGENT_ANNOTATION_PATTERN =
  /(?:^|\s*[·|—-]\s*)(?:agent|leasing agent|representative|rep|staff|associate)$/i;
const PROSPECT_ANNOTATION_PATTERN =
  /(?:^|\s*[·|—-]\s*)(?:prospect|customer|client|guest|visitor|renter|lead)$/i;
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
    "Speaker labels in this transcript are provider-inferred role hints and can be wrong:",
    `- "${TRANSCRIPT_SPEAKER_AGENT}" usually means leasing agent / staff member`,
    `- "${TRANSCRIPT_SPEAKER_PROSPECT}" usually means visitor / customer / prospect`,
    "Independently check the full conversational behavior before assigning roles. The person conducting the tour, explaining the property, or guiding the leasing process is the agent; the person shopping for housing is the prospect.",
    "First attach each audible name to the correct speaker: a self-introduction names the speaker, while direct address names the listener. Then assign that speaker to agentName or prospectName. Context wins when it conflicts with a provider label.",
  ].join("\n");
}

export function isAgentSpeakerLabel(speaker: string | null | undefined): boolean {
  const raw = (speaker ?? "").trim();
  if (!raw) return false;
  if (AGENT_ROLE_PATTERN.test(raw)) return true;
  return AGENT_ANNOTATION_PATTERN.test(raw);
}

export function isProspectSpeakerLabel(speaker: string | null | undefined): boolean {
  const raw = (speaker ?? "").trim();
  if (!raw) return false;
  if (PROSPECT_ROLE_PATTERN.test(raw)) return true;
  return PROSPECT_ANNOTATION_PATTERN.test(raw);
}

export function normalizeParticipantName(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  if (!trimmed) return null;
  const isUncertain = trimmed.startsWith("~");
  const withoutMarker = trimmed.replace(/^~+\s*/, "").replace(/\s+/g, " ").slice(0, 120);
  if (!withoutMarker) return null;

  const normalized = withoutMarker.toLowerCase();
  if (
    normalized === "null"
    || normalized === "unknown"
    || normalized === "n/a"
    || normalized === "na"
    || normalized === "none"
    || normalized === "not provided"
    || normalized === "agent"
    || normalized === "leasing agent"
    || normalized === "representative"
    || normalized === "staff"
    || normalized === "prospect"
    || normalized === "customer"
    || normalized === "client"
    || normalized === "guest"
    || normalized === "visitor"
    || normalized === "lead"
  ) {
    return null;
  }

  if (MARKUP_PATTERN.test(withoutMarker) || WRAPPER_TOKEN_PATTERN.test(withoutMarker)) {
    return null;
  }

  return isUncertain ? `~${withoutMarker}` : withoutMarker;
}

export function normalizeParticipantNameConfidence(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, value));
}

/** Remove the display-only uncertainty marker before prompts or comparisons. */
export function participantNameWithoutConfidenceMarker(
  value: string | null | undefined,
): string | null {
  const normalized = normalizeParticipantName(value);
  return normalized?.replace(/^~/, "") || null;
}

/** Prefix an extracted name with `~` when model confidence is below 60%. */
export function decorateParticipantNameByConfidence(
  value: unknown,
  confidence: unknown,
): string | null {
  const name = participantNameWithoutConfidenceMarker(normalizeParticipantName(value));
  if (!name) return null;
  const normalizedConfidence = normalizeParticipantNameConfidence(confidence);
  return normalizedConfidence !== null
    && normalizedConfidence < PARTICIPANT_NAME_CONFIDENCE_THRESHOLD
    ? `~${name}`
    : name;
}

/** Display name with role annotation, e.g. "Joseph · Agent". */
export function formatSpeakerAnnotation(
  speaker: string | null | undefined,
  participants: SessionParticipants
): string {
  const raw = (speaker ?? "").trim();
  const agent = participants.agentName?.trim() || null;
  const prospect = participants.prospectName?.trim() || null;
  const comparableAgent = participantNameWithoutConfidenceMarker(agent);
  const comparableProspect = participantNameWithoutConfidenceMarker(prospect);

  if (isAgentSpeakerLabel(raw)) {
    return agent ? `${agent} · Agent` : TRANSCRIPT_SPEAKER_AGENT;
  }

  if (isProspectSpeakerLabel(raw)) {
    return prospect ? `${prospect} · Prospect` : TRANSCRIPT_SPEAKER_PROSPECT;
  }

  if (agent && comparableAgent && raw.toLowerCase() === comparableAgent.toLowerCase()) {
    return `${agent} · Agent`;
  }

  if (prospect && comparableProspect && raw.toLowerCase() === comparableProspect.toLowerCase()) {
    return `${prospect} · Prospect`;
  }

  return raw || "Speaker";
}

export function buildParticipantPromptLines(participants: SessionParticipants): string[] {
  const lines: string[] = [];
  const agentName = participantNameWithoutConfidenceMarker(participants.agentName);
  const prospectName = participantNameWithoutConfidenceMarker(participants.prospectName);
  if (agentName) {
    lines.push(`Leasing agent name: ${agentName}`);
  }
  if (prospectName) {
    lines.push(`Prospect name: ${prospectName}`);
  }
  if (lines.length) {
    lines.push(
      "Label speakers using these names with role annotations (e.g. \"Alex · Agent\", \"Jordan · Prospect\").",
      "Do not use generic labels like \"Agent\" or \"Prospect\" when names are provided."
    );
  }
  return lines;
}
