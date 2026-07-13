import "server-only";

import { createClient, type User } from "@supabase/supabase-js";

import { compareCommunityDisplayName, formatCommunityDisplayName } from "./community-display";
import { getSupabaseServiceClient } from "./supabase";

export const ADMIN_ACCESS_COOKIE = "tour_admin_access_token";
export const ADMIN_REFRESH_COOKIE = "tour_admin_refresh_token";
export const ADMIN_COMMUNITY_COOKIE = "tour_admin_community";
const DEFAULT_TOUR_COMMUNITY_ID = "community:548";

export type AdminRole = "admin" | "manager" | "member";

export type PropertyTeamMember = {
  id: string | null;
  alias: string | null;
  name: string;
  email: string;
  role: string;
  accessRole: AdminRole;
  phone: string | null;
  verified: boolean | null;
};

export type AdminCommunity = {
  id: string;
  propertyTygId: string;
  portalCommunityId: string | null;
  name: string;
  companyName: string | null;
  companySlug: string | null;
  tourCommunityId: number | null;
  gmbId: string | null;
  alias: string | null;
  entrataPropertyId: string | null;
  teamMembers: PropertyTeamMember[];
};

export type AdminWorkspace = {
  user: {
    id: string;
    email: string;
    fullName: string | null;
  };
  teamMember: PropertyTeamMember;
  organization: {
    id: string;
    name: string;
  };
  community: AdminCommunity;
  communities: AdminCommunity[];
};

/** Canonical storage key first, followed by any legacy session key still in use. */
export function propertySessionKeys(community: AdminCommunity) {
  return Array.from(new Set([
    community.propertyTygId,
    community.tourCommunityId === null ? null : `community:${community.tourCommunityId}`,
  ].filter((value): value is string => Boolean(value))));
}

type PropertyTeamRow = {
  id: string;
  name: string | null;
  alias: string | null;
  place_id: string | null;
  tour_video_id: unknown;
  property_manager: string | null;
  metadata: unknown;
};

type LegacyTourCommunityRow = {
  id: number;
  alias: string | null;
  gmbId: unknown;
};

type CommunityRow = {
  id: string;
  name: string;
  tour_community_id: number | null;
  gmb_id: string | null;
  alias: string | null;
  entrata_property_id: string | null;
  company_id: string;
  companies?: { id: string; name: string; slug: string } | Array<{ id: string; name: string; slug: string }> | null;
};

const fallbackCommunityRows: CommunityRow[] = [
  {
    id: "community:548",
    name: "40Fifty Lofts",
    tour_community_id: 548,
    gmb_id: null,
    alias: "4050lofts",
    entrata_property_id: null,
    company_id: "company:leasemagnets-demo",
  },
  {
    id: "community:517",
    name: "20 Hawley",
    tour_community_id: 517,
    gmb_id: null,
    alias: "20hawley",
    entrata_property_id: null,
    company_id: "company:leasemagnets-demo",
  },
];

export class AdminAuthError extends Error {
  constructor(message: string, public status: 401 | 403 = 401) {
    super(message);
  }
}

export function createSupabaseAnonClient() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey) {
    throw new Error("Missing Supabase Auth environment variables.");
  }
  return createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export async function requireAdminContext(request: Request): Promise<AdminWorkspace> {
  const token = readBearerToken(request) ?? readCookie(request, ADMIN_ACCESS_COOKIE);
  if (!token) throw new AdminAuthError("Sign in is required.");

  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) throw new AdminAuthError("Your session has expired.");

  const requestedCommunityId =
    request.headers.get("x-admin-community-id") ??
    readCookie(request, ADMIN_COMMUNITY_COOKIE);

  return resolveAdminContextForUser(data.user, requestedCommunityId);
}

export function hasAdminSession(request: Request) {
  return Boolean(readBearerToken(request) ?? readAdminCookie(request, ADMIN_ACCESS_COOKIE));
}

export function readAdminCookie(request: Request, name: string) {
  return readCookie(request, name);
}

export async function resolveAdminContextForUser(
  user: User,
  requestedCommunityId?: string | null
): Promise<AdminWorkspace> {
  const supabase = getSupabaseServiceClient();
  const email = normalizeEmail(user.email);
  if (!email) throw new AdminAuthError("A work email is required.", 403);

  const teamProperties = await listPropertyTeamRows();
  const legacyTourCommunities = await listLegacyTourCommunities(
    teamProperties.filter((row) => !parseTourCommunityId(row.tour_video_id)).map((row) => row.place_id)
  );
  const accessible = teamProperties
    .map((row) => resolvePropertyAccess(row, email, user, legacyTourCommunities))
    .filter((entry): entry is ResolvedPropertyAccess => Boolean(entry))
    .sort((left, right) => left.community.name.localeCompare(right.community.name, undefined, { sensitivity: "base" }));

  if (accessible.length === 0) {
    throw new AdminAuthError("This email is not listed on a Tour.report property team.", 403);
  }

  const selected = accessible.find((entry) => communityMatches(entry.community, requestedCommunityId)) ?? accessible[0];
  if (!selected) throw new AdminAuthError("No available property was found.", 403);

  const profileName = selected.teamMember.name || displayNameFromUser(user);

  return {
    user: {
      id: user.id,
      email,
      fullName: profileName || null,
    },
    teamMember: selected.teamMember,
    organization: {
      id: selected.organizationId,
      name: selected.community.companyName ?? "Property team",
    },
    community: selected.community,
    communities: accessible.map((entry) => entry.community),
  };
}

async function listLegacyTourCommunities(placeIds: Array<string | null>) {
  const wanted = new Set(placeIds.map(cleanString).filter(Boolean));
  const byGmbId = new Map<string, LegacyTourCommunityRow>();
  if (wanted.size === 0) return byGmbId;

  const supabase = getSupabaseServiceClient();
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("Community")
      .select("id,alias,gmbId")
      .not("gmbId", "is", null)
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const batch = (data ?? []) as LegacyTourCommunityRow[];
    for (const row of batch) {
      const gmbId = normalizeLegacyGmbId(row.gmbId);
      if (gmbId && wanted.has(gmbId) && !byGmbId.has(gmbId)) byGmbId.set(gmbId, row);
    }
    if (batch.length < pageSize) break;
  }
  return byGmbId;
}

type ResolvedPropertyAccess = {
  community: AdminCommunity;
  teamMember: PropertyTeamMember;
  organizationId: string;
};

async function listPropertyTeamRows(): Promise<PropertyTeamRow[]> {
  const supabase = getSupabaseServiceClient();
  const rows: PropertyTeamRow[] = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("propertiesTYG")
      .select("id,name,alias,place_id,tour_video_id,property_manager,metadata")
      .not("metadata->property_team", "is", null)
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const batch = (data ?? []) as PropertyTeamRow[];
    rows.push(...batch);
    if (batch.length < pageSize) break;
  }

  return rows;
}

function resolvePropertyAccess(
  row: PropertyTeamRow,
  email: string,
  user: User,
  legacyTourCommunities: Map<string, LegacyTourCommunityRow>
): ResolvedPropertyAccess | null {
  const team = normalizePropertyTeam(row.metadata);
  if (team.length === 0) return null;

  const exactMember = team.find((member) => member.email === email) ?? null;
  if (!exactMember) return null;

  const visibleTeam = team;
  const teamMember = exactMember;
  const domain = emailDomain(email);
  const companyName = cleanString(row.property_manager) || companyNameFromTeam(visibleTeam) || domain;
  const companySlug = slugify(companyName);
  const placeId = cleanString(row.place_id);
  const legacyTourCommunity = placeId ? legacyTourCommunities.get(placeId) ?? null : null;
  const tourCommunityId = parseTourCommunityId(row.tour_video_id) ?? parseTourCommunityId(legacyTourCommunity?.id);

  return {
    teamMember,
    organizationId: `property-team:${companySlug || row.id}`,
    community: {
      id: row.id,
      propertyTygId: row.id,
      portalCommunityId: null,
      name: cleanString(row.name) || `Property ${row.id}`,
      companyName: companyName || null,
      companySlug: companySlug || null,
      tourCommunityId,
      gmbId: placeId || null,
      alias: cleanString(row.alias) || cleanString(legacyTourCommunity?.alias) || null,
      entrataPropertyId: null,
      teamMembers: visibleTeam,
    },
  };
}

function normalizeLegacyGmbId(value: unknown) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return "";
    try {
      const parsed = JSON.parse(trimmed);
      return typeof parsed === "string" ? parsed.trim() : trimmed;
    } catch {
      return trimmed;
    }
  }
  return cleanString(value);
}

function normalizePropertyTeam(metadata: unknown): PropertyTeamMember[] {
  if (!isRecord(metadata) || !Array.isArray(metadata.property_team)) return [];

  const seen = new Set<string>();
  return metadata.property_team
    .map((value) => {
      if (!isRecord(value)) return null;
      const email = normalizeEmail(value.email);
      if (!email || seen.has(email)) return null;
      seen.add(email);
      const role = cleanString(value.role) || "Property Team";
      return {
        id: cleanString(value.id ?? value.user_id ?? value.userId) || null,
        alias: cleanString(value.alias ?? value.user_alias ?? value.userAlias) || null,
        name: cleanString(value.name) || email.split("@")[0] || "Team member",
        email,
        role,
        accessRole: accessRoleForPropertyTeamRole(role),
        phone: cleanString(value.phone) || null,
        verified: typeof value.verified === "boolean" ? value.verified : null,
      } satisfies PropertyTeamMember;
    })
    .filter((member): member is PropertyTeamMember => Boolean(member));
}

function accessRoleForPropertyTeamRole(role: string): AdminRole {
  const normalized = role.toLowerCase();
  if (/owner|corporate|regional|\brm\b|\brsm\b|manager|executive|admin/.test(normalized)) {
    return "manager";
  }
  return "member";
}

function communityMatches(community: AdminCommunity, requested: string | null | undefined) {
  if (!requested) return false;
  const normalized = requested.trim().replace(/^@/, "").toLowerCase();
  return [
    community.id,
    community.propertyTygId,
    community.portalCommunityId,
    community.alias,
    community.tourCommunityId === null ? null : String(community.tourCommunityId),
  ].some((value) => value !== null && String(value).replace(/^@/, "").toLowerCase() === normalized);
}

function parseTourCommunityId(value: unknown) {
  const candidate = isRecord(value)
    ? value.community_id ?? value.communityId ?? value.tourCommunityId
    : value;
  const parsed = Number(candidate);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function companyNameFromTeam(team: PropertyTeamMember[]) {
  const domains = team.map((member) => emailDomain(member.email)).filter(Boolean);
  return domains[0] ?? "";
}

function displayNameFromUser(user: User) {
  const metadataName = cleanString(user.user_metadata?.full_name ?? user.user_metadata?.name);
  if (metadataName) return metadataName;
  return (user.email?.split("@")[0] ?? "Tour user")
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function normalizeEmail(value: unknown) {
  return cleanString(value).toLowerCase();
}

function emailDomain(value: unknown) {
  return normalizeEmail(value).split("@")[1] ?? "";
}

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : value === null || value === undefined ? "" : String(value).trim();
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function resolveFallbackAdminContext(
  requestedCommunityId?: string | null
): Promise<AdminWorkspace> {
  const communityRows = await listFallbackCommunities();
  const community =
    communityRows.find((row) => row.id === requestedCommunityId) ??
    communityRows.find((row) => row.id === DEFAULT_TOUR_COMMUNITY_ID) ??
    communityRows[0] ??
    fallbackCommunityRows[0]!;

  return {
    user: {
      id: "tour-demo-user",
      email: "lease@tour.video",
      fullName: "LeaseMagnets",
    },
    teamMember: {
      id: null,
      alias: null,
      name: "LeaseMagnets",
      email: "lease@tour.video",
      role: "LeaseMagnets Admin",
      accessRole: "admin",
      phone: null,
      verified: true,
    },
    organization: {
      id: community.company_id,
      name: "LeaseMagnets",
    },
    community: {
      id: community.id,
      propertyTygId: community.id,
      portalCommunityId: community.id,
      name: community.name,
      companyName: "LeaseMagnets",
      companySlug: "leasemagnets",
      tourCommunityId: community.tour_community_id,
      gmbId: community.gmb_id,
      alias: community.alias,
      entrataPropertyId: community.entrata_property_id,
      teamMembers: [],
    },
    communities: communityRows.map((row) => ({
      id: row.id,
      propertyTygId: row.id,
      portalCommunityId: row.id,
      name: formatCommunityDisplayName(row),
      companyName: "LeaseMagnets",
      companySlug: "leasemagnets",
      tourCommunityId: row.tour_community_id,
      gmbId: row.gmb_id,
      alias: row.alias,
      entrataPropertyId: row.entrata_property_id,
      teamMembers: [],
    })),
  };
}

export function adminCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}

function readCookie(request: Request, name: string) {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return null;

  for (const part of cookieHeader.split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (rawName === name) {
      return decodeURIComponent(rawValue.join("="));
    }
  }
  return null;
}

function companyForCommunity(row: CommunityRow) {
  if (!row.companies) return null;
  return Array.isArray(row.companies) ? row.companies[0] : row.companies;
}

function communityDisplayInput(
  row: CommunityRow,
  fallbackCompany?: { name: string; slug: string } | null
) {
  const company = companyForCommunity(row) ?? fallbackCompany ?? null;
  return {
    name: row.name,
    companyName: company?.name ?? null,
    companySlug: company?.slug ?? null,
  };
}

async function listFallbackCommunities(): Promise<CommunityRow[]> {
  try {
    const supabase = getSupabaseServiceClient();
    const { data, error } = await supabase
      .from("propertiesTYG")
      .select("id,name,tour_video_id,place_id,alias,property_manager")
      .order("name", { ascending: true })
      .limit(100);

    if (error) throw new Error(error.message);
    const rows = (data ?? []).map((row) => {
      const property = row as {
        id: string;
        name: string | null;
        tour_video_id: unknown;
        place_id: string | null;
        alias: string | null;
        property_manager: string | null;
      };
      return {
        id: property.id,
        name: property.name?.trim() || `Property ${property.id}`,
        tour_community_id: parseTourCommunityId(property.tour_video_id),
        gmb_id: property.place_id,
        alias: property.alias,
        entrata_property_id: null,
        company_id: `property-team:${slugify(property.property_manager || property.id)}`,
      } satisfies CommunityRow;
    });
    return rows.length > 0 ? rows : fallbackCommunityRows;
  } catch {
    return fallbackCommunityRows;
  }
}

function readBearerToken(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.toLowerCase().startsWith("bearer ")) return null;
  return authorization.slice(7).trim() || null;
}
