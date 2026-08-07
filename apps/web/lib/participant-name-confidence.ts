import "server-only";

import { normalizeParticipantName, normalizeParticipantNameConfidence } from "@tour/shared";

import { getSupabaseServiceClient } from "./supabase";

type ParticipantNameEvidence = {
  agentName: string | null;
  agentNameConfidence?: number | null;
  prospectName: string | null;
  prospectNameConfidence?: number | null;
  agentNameFirstMentionSeconds?: number | null;
  prospectNameFirstMentionSeconds?: number | null;
};

type PropertyNameSignalSource = "property_manager" | "apm" | "property_team";

type PropertyNameSignal = {
  name: string;
  source: PropertyNameSignalSource;
};

type PropertyRow = {
  property_manager: string | null;
  metadata: unknown;
};

const SOURCE_BOOST: Record<PropertyNameSignalSource, number> = {
  property_manager: 16,
  apm: 16,
  property_team: 8,
};

const SOURCE_PRIORITY: Record<PropertyNameSignalSource, number> = {
  property_manager: 3,
  apm: 2,
  property_team: 1,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizedName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function nameTokens(value: string): string[] {
  return normalizedName(value).split(" ").filter(Boolean);
}

function isPlausiblePersonName(value: string): boolean {
  const tokens = nameTokens(value);
  if (tokens.length < 1 || tokens.length > 4) return false;
  if (tokens.some((token) => token.length < 2 || token.length > 32 || /\d/.test(token))) return false;
  return !/\b(?:apartments?|realty|residential|management|properties|property|homes?|living|llc|inc|group|company|communities)\b/i.test(value);
}

function sourceForTeamMember(member: Record<string, unknown>): PropertyNameSignalSource {
  const role = `${cleanString(member.role)} ${cleanString(member.title)}`.toLowerCase();
  if (/\b(?:assistant\s+property\s+manager|apm)\b/.test(role)) return "apm";
  if (/\b(?:property\s+manager|community\s+manager|leasing\s+manager|\bpm\b)\b/.test(role)) {
    return "property_manager";
  }
  return "property_team";
}

function addSignal(
  signals: Map<string, PropertyNameSignal>,
  name: unknown,
  source: PropertyNameSignalSource,
) {
  const displayName = cleanString(name);
  if (!isPlausiblePersonName(displayName)) return;
  const key = normalizedName(displayName);
  if (!key) return;
  const existing = signals.get(key);
  if (!existing || SOURCE_PRIORITY[source] > SOURCE_PRIORITY[existing.source]) {
    signals.set(key, { name: displayName, source });
  }
}

/**
 * Names configured on the property are only corroborating signals: callers must
 * already have a name heard/inferred from the recording before using one.
 */
export async function getPropertyParticipantNameSignals(propertyId: string | null | undefined) {
  if (!propertyId?.trim()) return [] as PropertyNameSignal[];
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from("propertiesTYG")
    .select("property_manager,metadata")
    .eq("id", propertyId)
    .maybeSingle<PropertyRow>();
  if (error) throw new Error(`Could not load property name signals: ${error.message}`);
  if (!data) return [] as PropertyNameSignal[];

  const signals = new Map<string, PropertyNameSignal>();
  addSignal(signals, data.property_manager, "property_manager");

  if (!isRecord(data.metadata)) return [...signals.values()];
  const configuredManager = data.metadata.property_manager ?? data.metadata.propertyManager;
  if (isRecord(configuredManager)) addSignal(signals, configuredManager.name, "property_manager");
  else addSignal(signals, configuredManager, "property_manager");

  const team = data.metadata.property_team;
  if (Array.isArray(team)) {
    for (const member of team) {
      if (!isRecord(member)) continue;
      addSignal(signals, member.name, sourceForTeamMember(member));
    }
  }

  return [...signals.values()];
}

function editDistance(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    let diagonal = previous[0]!;
    previous[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const above = previous[rightIndex]!;
      previous[rightIndex] = Math.min(
        previous[rightIndex - 1]! + 1,
        above + 1,
        diagonal + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
      diagonal = above;
    }
  }
  return previous[right.length]!;
}

function similarity(left: string, right: string): number {
  if (!left || !right) return 0;
  if (left === right) return 1;
  return 1 - editDistance(left, right) / Math.max(left.length, right.length);
}

type NameMatch = {
  signal: PropertyNameSignal;
  score: number;
};

/**
 * Finds a single, high-confidence team match. A first-name-only match is used
 * only when it is unique in the property team, so two people named Alex do not
 * silently change the identity shown to the user.
 */
export function findClosestPropertyNameMatch(
  extractedName: string | null | undefined,
  signals: readonly PropertyNameSignal[],
): NameMatch | null {
  const name = normalizeParticipantName(extractedName);
  if (!name) return null;
  const tokens = nameTokens(name);
  if (!tokens.length) return null;
  const full = tokens.join(" ");

  const matches = signals.map((signal) => {
    const candidateTokens = nameTokens(signal.name);
    const candidateFull = candidateTokens.join(" ");
    const first = tokens[0]!;
    const candidateFirst = candidateTokens[0] ?? "";
    let score = similarity(full, candidateFull);

    if (full === candidateFull) score = 1;
    else if (tokens.length === 1 && first === candidateFirst) score = 0.96;
    else if (tokens.length >= 2 && candidateTokens.length >= 2 && first === candidateFirst) {
      const last = tokens.at(-1)!;
      const candidateLast = candidateTokens.at(-1)!;
      if (last === candidateLast) score = 0.99;
      else if (last[0] === candidateLast[0]) score = Math.max(score, 0.95);
    } else if (tokens.length === 1 && first.length >= 4) {
      // ASR commonly misses or adds one phonetic character in a first name
      // (for example, "Graice" for "Grace"). The unique-team-member guard
      // below keeps this useful without treating a loose similarity as proof.
      score = Math.max(score, similarity(first, candidateFirst));
    }
    return { signal, score };
  }).sort((a, b) => b.score - a.score);

  const best = matches[0];
  if (!best) return null;
  const runnerUp = matches[1];
  const uniqueFirstName = tokens.length !== 1
    || matches.filter(({ signal }) => nameTokens(signal.name)[0] === tokens[0]).length === 1;
  const requiredScore = tokens.length === 1 ? 0.8 : 0.86;
  if (!uniqueFirstName || best.score < requiredScore) return null;
  if (runnerUp && best.score - runnerUp.score < 0.08 && runnerUp.signal.name !== best.signal.name) return null;
  return best;
}

function boostedConfidence(
  original: number | null | undefined,
  match: NameMatch,
): number | null {
  const base = normalizeParticipantNameConfidence(original);
  if (base === null || base < 40) return base;
  const weight = SOURCE_BOOST[match.signal.source];
  const increase = Math.max(2, Math.round(weight * Math.max(0.4, (match.score - 0.8) / 0.2)));
  // A directory match should corroborate recorded evidence, never manufacture
  // certainty from a weak or absent audio/transcript result.
  const cap = base < 60 ? 89 : 98;
  return Math.min(cap, base + increase);
}

/**
 * Canonicalize an already-extracted agent name against the property directory
 * and apply a bounded, evidence-preserving confidence boost. Prospect fields
 * are deliberately untouched: property staff are not evidence about a prospect.
 */
export async function corroborateParticipantNamesWithPropertyTeam<T extends ParticipantNameEvidence>(
  propertyId: string | null | undefined,
  participants: T | undefined,
): Promise<T | undefined> {
  if (!participants?.agentName || !propertyId?.trim()) return participants;
  const signals = await getPropertyParticipantNameSignals(propertyId);
  const match = findClosestPropertyNameMatch(participants.agentName, signals);
  if (!match) return participants;

  return {
    ...participants,
    agentName: match.signal.name,
    agentNameConfidence: boostedConfidence(participants.agentNameConfidence, match),
  };
}
