import "server-only";

import {
  normalizeParticipantName,
  normalizeParticipantNameConfidence,
  type AnalysisModelId,
} from "@tour/shared";

import type { TranscriptSegment } from "./transcribe";
import { invokeAnalysisTool } from "./analysis-model-invoke";
import type { ClaudeTool } from "./bedrock";
import type { AnalysisParticipantNames } from "./analysis";

type ParticipantNamePayload = {
  agentName: string | null;
  prospectName: string | null;
  agentNameConfidence: number;
  prospectNameConfidence: number;
  agentNameFirstMentionTimestamp: string | null;
  prospectNameFirstMentionTimestamp: string | null;
};

const PARTICIPANT_NAME_TOOL: ClaudeTool = {
  name: "submit_participant_names",
  description: "Submit evidence-grounded participant names from a leasing interaction transcript.",
  input_schema: {
    type: "object",
    properties: {
      agentName: { type: ["string", "null"] },
      prospectName: { type: ["string", "null"] },
      agentNameConfidence: { type: "number" },
      prospectNameConfidence: { type: "number" },
      agentNameFirstMentionTimestamp: { type: ["string", "null"] },
      prospectNameFirstMentionTimestamp: { type: ["string", "null"] },
    },
    required: [
      "agentName",
      "prospectName",
      "agentNameConfidence",
      "prospectNameConfidence",
      "agentNameFirstMentionTimestamp",
      "prospectNameFirstMentionTimestamp",
    ],
    additionalProperties: false,
  },
};

function renderEvidenceWindow(transcript: readonly TranscriptSegment[]): string {
  // Introductions are usually early; the final exchange is useful for role confirmation.
  const first = transcript.slice(0, 180);
  const last = transcript.length > 280 ? transcript.slice(-100) : [];
  const render = (segment: TranscriptSegment) => {
    const minutes = Math.floor(segment.startTime / 60);
    const seconds = Math.floor(segment.startTime % 60).toString().padStart(2, "0");
    return `[${minutes}:${seconds}] ${segment.speaker}: ${segment.text}`;
  };
  return [
    ...first.map(render),
    ...(last.length ? ["[... middle omitted ...]", ...last.map(render)] : []),
  ].join("\n");
}

function parseTimestamp(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^(\d+):([0-5]\d)$/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function normalize(payload: ParticipantNamePayload): AnalysisParticipantNames | null {
  const agentName = normalizeParticipantName(payload.agentName);
  const prospectName = normalizeParticipantName(payload.prospectName);
  if (!agentName && !prospectName) return null;
  return {
    agentName,
    prospectName,
    agentNameConfidence: agentName
      ? normalizeParticipantNameConfidence(payload.agentNameConfidence) ?? 0
      : null,
    prospectNameConfidence: prospectName
      ? normalizeParticipantNameConfidence(payload.prospectNameConfidence) ?? 0
      : null,
    agentNameFirstMentionSeconds: agentName
      ? parseTimestamp(payload.agentNameFirstMentionTimestamp)
      : null,
    prospectNameFirstMentionSeconds: prospectName
      ? parseTimestamp(payload.prospectNameFirstMentionTimestamp)
      : null,
  };
}

/**
 * A focused, independently configured text pass for participant names. It only
 * uses the transcript and never treats property-directory data as audio evidence.
 */
export async function extractParticipantNames(params: {
  transcript: readonly TranscriptSegment[];
  model: AnalysisModelId;
}): Promise<AnalysisParticipantNames | null> {
  if (!params.transcript.length) return null;
  const payload = await invokeAnalysisTool<ParticipantNamePayload>({
    analysisModel: params.model,
    maxTokens: 1_024,
    temperature: 0,
    system: "You identify the two people in leasing recordings with strict evidence discipline. Never invent a name or infer a name from metadata.",
    messages: [{
      role: "user",
      content: [
        "Identify the leasing agent/staff member and the prospect/customer from this timestamped transcript.",
        "Speaker labels are diarization hints only and may be wrong. Determine roles from the conversational behavior.",
        "A self-introduction names the speaker. Direct address names the listener. Do not confuse the two.",
        "Return 90-100 confidence only for an explicit introduction or repeated, unambiguous address. Return null and 0 when unsupported.",
        "The transcript is the only evidence. Ignore all property names, stored names, and any presumed identity outside this text.",
        "Use the earliest spoken mention timestamp in MM:SS when returning a name.",
        "\n=== EVIDENCE WINDOW ===\n",
        renderEvidenceWindow(params.transcript),
      ].join("\n"),
    }],
    tool: PARTICIPANT_NAME_TOOL,
  });
  return normalize(payload);
}
