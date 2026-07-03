import "server-only";

import { createClient, type User } from "@supabase/supabase-js";

import { getSupabaseServiceClient } from "./supabase";

export const ADMIN_ACCESS_COOKIE = "tour_admin_access_token";
export const ADMIN_REFRESH_COOKIE = "tour_admin_refresh_token";
export const ADMIN_COMMUNITY_COOKIE = "tour_admin_community";

export type AdminRole = "admin" | "manager" | "member";

export type AdminWorkspace = {
  user: {
    id: string;
    email: string;
    fullName: string | null;
  };
  membership: {
    id: string;
    role: AdminRole;
    companyId: string;
    companyName: string;
  };
  community: {
    id: string;
    name: string;
    tourCommunityId: number | null;
    gmbId: string | null;
    alias: string | null;
    entrataPropertyId: string | null;
  };
  communities: Array<{
    id: string;
    name: string;
    gmbId: string | null;
    alias: string | null;
  }>;
};

type MembershipRow = {
  id: string;
  role: AdminRole;
  status: "invited" | "active" | "suspended";
  company_id: string;
  companies: { id: string; name: string; slug: string } | Array<{ id: string; name: string; slug: string }> | null;
};

type CommunityRow = {
  id: string;
  name: string;
  tour_community_id: number | null;
  gmb_id: string | null;
  alias: string | null;
  entrata_property_id: string | null;
  company_id: string;
};

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
  const { data: memberships, error: membershipError } = await supabase
    .from("company_memberships")
    .select("id,role,status,company_id,companies(id,name,slug)")
    .eq("user_id", user.id)
    .eq("status", "active");

  if (membershipError) throw new Error(membershipError.message);
  const membershipRows = (memberships ?? []) as MembershipRow[];
  if (membershipRows.length === 0) {
    throw new AdminAuthError("This account does not have admin portal access.", 403);
  }

  const membershipIds = membershipRows.map((row) => row.id);
  const { data: accessRows, error: accessError } = await supabase
    .from("membership_communities")
    .select("membership_id,property_id")
    .in("membership_id", membershipIds);
  if (accessError) throw new Error(accessError.message);

  const accessByProperty = new Map(
    ((accessRows ?? []) as unknown as Array<{ property_id: string; membership_id: string }>)
      .map((row) => [String(row.property_id), String(row.membership_id)])
  );
  const propertyIds = [...accessByProperty.keys()];
  if (propertyIds.length === 0) {
    throw new AdminAuthError("No communities are assigned to this account.", 403);
  }

  const { data: properties, error: propertiesError } = await supabase
    .from("communities")
    .select("id,name,tour_community_id,gmb_id,alias,entrata_property_id,company_id")
    .in("id", propertyIds)
    .eq("portal_enabled", true)
    .order("name", { ascending: true });
  if (propertiesError) throw new Error(propertiesError.message);

  const communityRows = (properties ?? []) as CommunityRow[];
  const community =
    communityRows.find((row) => row.id === requestedCommunityId) ??
    communityRows[0];
  if (!community) {
    throw new AdminAuthError("No available community was found.", 403);
  }

  const membershipId = accessByProperty.get(community.id);
  const membership = membershipRows.find((row) => row.id === membershipId);
  if (!membership || membership.company_id !== community.company_id) {
    throw new AdminAuthError("You do not have access to this community.", 403);
  }

  const company = Array.isArray(membership.companies)
    ? membership.companies[0]
    : membership.companies;
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("full_name")
    .eq("user_id", user.id)
    .maybeSingle<{ full_name: string | null }>();

  return {
    user: {
      id: user.id,
      email: user.email ?? "",
      fullName: profile?.full_name ?? null,
    },
    membership: {
      id: membership.id,
      role: membership.role,
      companyId: membership.company_id,
      companyName: company?.name ?? "Company",
    },
    community: {
      id: community.id,
      name: community.name,
      tourCommunityId: community.tour_community_id,
      gmbId: community.gmb_id,
      alias: community.alias,
      entrataPropertyId: community.entrata_property_id,
    },
    communities: communityRows.map((row) => ({
      id: row.id,
      name: row.name,
      gmbId: row.gmb_id,
      alias: row.alias,
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

function readBearerToken(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.toLowerCase().startsWith("bearer ")) return null;
  return authorization.slice(7).trim() || null;
}
