import "server-only";

import { getSupabaseServiceClient } from "./supabase";

export type EntrataSyncSettings = {
  autoSyncEnabled: boolean;
  status: string;
  lastSyncedAt: string | null;
  lastError: string | null;
  stats: Record<string, unknown>;
  externalPropertyId: string | null;
};

export type NotificationPreferences = Record<string, boolean>;

export type EnsurePropertyTeamMemberInput = {
  propertyId: string;
  userId: string;
  email: string;
  name: string;
  alias?: string | null;
  phone?: string | null;
  role?: string | null;
  title?: string | null;
  cardAccent?: string | null;
  verified?: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : value === null || value === undefined ? "" : String(value).trim();
}

function aliasBase(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "team-member";
}

function uniqueMemberAlias(
  preferred: string,
  team: unknown[],
  ownEmail: string
) {
  const used = new Set(
    team
      .filter(isRecord)
      .filter((member) => cleanString(member.email).toLowerCase() !== ownEmail)
      .map((member) => cleanString(member.alias ?? member.user_alias ?? member.userAlias).replace(/^@/, "").toLowerCase())
      .filter(Boolean)
  );
  const base = aliasBase(preferred);
  if (!used.has(base)) return base;
  for (let suffix = 2; suffix < 1000; suffix += 1) {
    const candidate = `${base}-${suffix}`;
    if (!used.has(candidate)) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

/**
 * Idempotently creates or completes the authenticated user's contact/access
 * record in PropertiesTYG.metadata.property_team. This is the sole membership
 * model for Tour.you; no parallel memberships table is involved.
 */
export async function ensurePropertyTeamMember(
  input: EnsurePropertyTeamMemberInput
): Promise<{ member: Record<string, unknown>; created: boolean }> {
  const supabase = getSupabaseServiceClient();
  const email = input.email.trim().toLowerCase();
  if (!email) throw new Error("A verified email is required for the property card.");

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data, error } = await supabase
      .from("propertiesTYG")
      .select("metadata,updated_at")
      .eq("id", input.propertyId)
      .single<{ metadata: unknown; updated_at: string | null }>();
    if (error || !data) throw new Error(error?.message ?? "Property not found.");

    const metadata = isRecord(data.metadata) ? { ...data.metadata } : {};
    const team = Array.isArray(metadata.property_team)
      ? metadata.property_team.map((member) => isRecord(member) ? { ...member } : member)
      : [];
    const memberIndex = team.findIndex(
      (member) => isRecord(member) && cleanString(member.email).toLowerCase() === email
    );
    const existing = memberIndex >= 0 && isRecord(team[memberIndex])
      ? team[memberIndex]
      : null;
    const name = cleanString(existing?.name) || cleanString(input.name) || email.split("@")[0] || "Team member";
    const preferredAlias = cleanString(existing?.alias ?? input.alias) || name || email.split("@")[0] || "team-member";
    const member: Record<string, unknown> = {
      ...(existing ?? {}),
      id: cleanString(existing?.id) || input.userId,
      user_id: input.userId,
      alias: cleanString(existing?.alias) || uniqueMemberAlias(preferredAlias, team, email),
      name,
      email,
      phone: cleanString(existing?.phone) || cleanString(input.phone) || null,
      role: cleanString(existing?.role) || cleanString(input.role) || "Property Team",
      title: cleanString(existing?.title) || cleanString(input.title) || null,
      card_accent: cleanString(existing?.card_accent ?? existing?.cardAccent)
        || cleanString(input.cardAccent)
        || "#4D8AE5",
      verified: input.verified ?? true,
      dateJoined: cleanString(existing?.dateJoined ?? existing?.date_joined) || new Date().toISOString(),
      src: cleanString(existing?.src) || "Tour.you App TYG",
    };

    if (memberIndex >= 0) team[memberIndex] = member;
    else team.push(member);
    metadata.property_team = team;

    let update = supabase
      .from("propertiesTYG")
      .update({ metadata, updated_at: new Date().toISOString() } as never)
      .eq("id", input.propertyId);
    update = data.updated_at === null
      ? update.is("updated_at", null)
      : update.eq("updated_at", data.updated_at);
    const { data: updated, error: updateError } = await update.select("id").maybeSingle();
    if (updateError) throw new Error(updateError.message);
    if (updated) return { member, created: !existing };
  }

  throw new Error("The property team changed while your card was being prepared. Please try again.");
}

export async function recordPropertyAccessRequest(input: {
  propertyId: string;
  sessionId: string;
  userId: string;
  email: string;
  name: string;
}) {
  const supabase = getSupabaseServiceClient();
  const email = input.email.trim().toLowerCase();

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data, error } = await supabase
      .from("propertiesTYG")
      .select("metadata,updated_at")
      .eq("id", input.propertyId)
      .single<{ metadata: unknown; updated_at: string | null }>();
    if (error || !data) throw new Error(error?.message ?? "Property not found.");
    const metadata = isRecord(data.metadata) ? { ...data.metadata } : {};
    const requests = Array.isArray(metadata.access_requests)
      ? metadata.access_requests.filter(isRecord).map((request) => ({ ...request }))
      : [];
    const existingIndex = requests.findIndex((request) => (
      cleanString(request.email).toLowerCase() === email
      && cleanString(request.session_id ?? request.sessionId) === input.sessionId
      && cleanString(request.status || "pending") === "pending"
    ));
    const request = {
      ...(existingIndex >= 0 ? requests[existingIndex] : {}),
      id: existingIndex >= 0 ? cleanString(requests[existingIndex]?.id) : crypto.randomUUID(),
      user_id: input.userId,
      email,
      name: input.name,
      session_id: input.sessionId,
      status: "pending",
      requested_at: new Date().toISOString(),
      src: "Tour.you session access request",
    };
    if (existingIndex >= 0) requests[existingIndex] = request;
    else requests.push(request);
    metadata.access_requests = requests;

    let update = supabase
      .from("propertiesTYG")
      .update({ metadata, updated_at: new Date().toISOString() } as never)
      .eq("id", input.propertyId);
    update = data.updated_at === null
      ? update.is("updated_at", null)
      : update.eq("updated_at", data.updated_at);
    const { data: updated, error: updateError } = await update.select("id").maybeSingle();
    if (updateError) throw new Error(updateError.message);
    if (updated) return request;
  }
  throw new Error("The property changed while the request was being saved. Please try again.");
}

export function readEntrataSyncSettings(metadata: unknown): EntrataSyncSettings {
  const integrations = isRecord(metadata) && isRecord(metadata.integrations) ? metadata.integrations : null;
  const entrata = integrations && isRecord(integrations.entrata) ? integrations.entrata : {};
  return {
    autoSyncEnabled: Boolean(entrata.autoSyncEnabled ?? entrata.auto_sync_enabled),
    status: cleanString(entrata.status) || "disconnected",
    lastSyncedAt: cleanString(entrata.lastSyncedAt ?? entrata.last_synced_at) || null,
    lastError: cleanString(entrata.lastError ?? entrata.last_error) || null,
    stats: isRecord(entrata.stats) ? entrata.stats : {},
    externalPropertyId:
      cleanString(entrata.externalPropertyId ?? entrata.external_property_id) || null,
  };
}

export async function patchPropertyTeamMember(input: {
  propertyId: string;
  email: string;
  patch: Record<string, unknown>;
}): Promise<Record<string, unknown>> {
  const supabase = getSupabaseServiceClient();
  const email = input.email.trim().toLowerCase();

  const { data: property, error } = await supabase
    .from("propertiesTYG")
    .select("metadata")
    .eq("id", input.propertyId)
    .single<{ metadata: unknown }>();
  if (error || !property) throw new Error(error?.message ?? "Property not found.");

  const metadata = isRecord(property.metadata) ? { ...property.metadata } : {};
  const team = Array.isArray(metadata.property_team)
    ? metadata.property_team.map((member) => (isRecord(member) ? { ...member } : member))
    : [];
  const memberIndex = team.findIndex(
    (member) => isRecord(member) && String(member.email ?? "").trim().toLowerCase() === email
  );
  if (memberIndex < 0 || !isRecord(team[memberIndex])) {
    throw new Error("Your property-team record could not be found.");
  }

  const nextMember = { ...team[memberIndex] };
  for (const [key, value] of Object.entries(input.patch)) {
    if (value === undefined) continue;
    if (value === null || value === "") delete nextMember[key];
    else nextMember[key] = value;
  }
  team[memberIndex] = nextMember;
  metadata.property_team = team;

  const { error: updateError } = await supabase
    .from("propertiesTYG")
    .update({ metadata, updated_at: new Date().toISOString() } as never)
    .eq("id", input.propertyId);

  if (updateError) throw new Error(updateError.message);
  return nextMember;
}

export async function patchPropertyEntrataSettings(input: {
  propertyId: string;
  patch: Partial<EntrataSyncSettings> & { autoSyncEnabled?: boolean };
}): Promise<EntrataSyncSettings> {
  const supabase = getSupabaseServiceClient();

  const { data: property, error } = await supabase
    .from("propertiesTYG")
    .select("metadata,entrata_auto_sync_enabled")
    .eq("id", input.propertyId)
    .single<{ metadata: unknown; entrata_auto_sync_enabled: boolean | null }>();
  if (error || !property) throw new Error(error?.message ?? "Property not found.");

  const current = readEntrataSyncSettings(property.metadata);
  const next: EntrataSyncSettings = {
    autoSyncEnabled:
      input.patch.autoSyncEnabled !== undefined ? input.patch.autoSyncEnabled : current.autoSyncEnabled,
    status: input.patch.status !== undefined ? input.patch.status : current.status,
    lastSyncedAt:
      input.patch.lastSyncedAt !== undefined ? input.patch.lastSyncedAt : current.lastSyncedAt,
    lastError: input.patch.lastError !== undefined ? input.patch.lastError : current.lastError,
    stats: input.patch.stats !== undefined ? input.patch.stats : current.stats,
    externalPropertyId:
      input.patch.externalPropertyId !== undefined
        ? input.patch.externalPropertyId
        : current.externalPropertyId,
  };

  const metadata = isRecord(property.metadata) ? { ...property.metadata } : {};
  const integrations = isRecord(metadata.integrations) ? { ...metadata.integrations } : {};
  integrations.entrata = {
    autoSyncEnabled: next.autoSyncEnabled,
    status: next.status,
    lastSyncedAt: next.lastSyncedAt,
    lastError: next.lastError,
    stats: next.stats,
    externalPropertyId: next.externalPropertyId,
  };
  metadata.integrations = integrations;

  const { error: updateError } = await supabase
    .from("propertiesTYG")
    .update({
      metadata,
      entrata_auto_sync_enabled: next.autoSyncEnabled,
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", input.propertyId);

  if (updateError) throw new Error(updateError.message);
  return next;
}

export async function listPropertyTeamAuthUserIds(propertyId: string): Promise<string[]> {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from("propertiesTYG")
    .select("metadata")
    .eq("id", propertyId)
    .maybeSingle<{ metadata: unknown }>();
  if (error) throw new Error(error.message);
  if (!data || !isRecord(data.metadata) || !Array.isArray(data.metadata.property_team)) return [];

  const userIds = new Set<string>();
  for (const member of data.metadata.property_team) {
    if (!isRecord(member)) continue;
    const userId = cleanString(member.user_id ?? member.userId);
    if (userId) userIds.add(userId);
  }
  return [...userIds];
}

export async function resolveAuthUserIdFromAgentRef(
  agentId: string | null | undefined
): Promise<string | null> {
  if (!agentId) return null;
  const trimmed = agentId.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("user:")) {
    const id = trimmed.slice("user:".length).trim();
    return id || null;
  }
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(trimmed)) {
    return trimmed;
  }

  const supabase = getSupabaseServiceClient();
  const pageSize = 1000;
  const needle = trimmed.replace(/^@/, "").toLowerCase();

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("propertiesTYG")
      .select("metadata")
      .not("metadata->property_team", "is", null)
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const batch = (data ?? []) as Array<{ metadata: unknown }>;
    for (const row of batch) {
      if (!isRecord(row.metadata) || !Array.isArray(row.metadata.property_team)) continue;
      for (const member of row.metadata.property_team) {
        if (!isRecord(member)) continue;
        const keys = [member.id, member.alias, member.user_id, member.userId, member.email]
          .map((value) => cleanString(value).replace(/^@/, "").toLowerCase())
          .filter(Boolean);
        if (!keys.includes(needle)) continue;
        const userId = cleanString(member.user_id ?? member.userId);
        if (userId) return userId;
      }
    }
    if (batch.length < pageSize) break;
  }

  return null;
}

export async function notificationPrefsForAuthUser(input: {
  propertyId?: string | null;
  userId: string;
}): Promise<NotificationPreferences> {
  if (!input.propertyId) return {};
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from("propertiesTYG")
    .select("metadata")
    .eq("id", input.propertyId)
    .maybeSingle<{ metadata: unknown }>();
  if (error) throw new Error(error.message);
  if (!data || !isRecord(data.metadata) || !Array.isArray(data.metadata.property_team)) return {};

  for (const member of data.metadata.property_team) {
    if (!isRecord(member)) continue;
    const userId = cleanString(member.user_id ?? member.userId);
    if (userId !== input.userId) continue;
    const prefs = member.notification_preferences ?? member.notificationPreferences;
    return isRecord(prefs)
      ? Object.fromEntries(
          Object.entries(prefs).filter(([, value]) => typeof value === "boolean")
        ) as NotificationPreferences
      : {};
  }
  return {};
}
