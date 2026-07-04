import "server-only";

import { getSupabaseServiceClient } from "./supabase";

export type TeamAgent = {
  id: string;
  name: string;
  fullName: string;
  authUserId: string | null;
};

type AgentRow = {
  id: string;
  name: string;
  full_name: string;
  auth_user_id: string | null;
};

export async function listTeamAgents(companyId: string, propertyIds: string[]): Promise<TeamAgent[]> {
  if (!propertyIds.length) return [];

  try {
    const supabase = getSupabaseServiceClient();

    const { data: access, error: accessError } = await supabase
      .from("membership_communities")
      .select("membership_id")
      .in("property_id", propertyIds);
    if (accessError) throw new Error(accessError.message);

    const membershipIds = [...new Set(
      ((access ?? []) as unknown as Array<{ membership_id: string }>)
        .map((row) => String(row.membership_id))
    )];

    let query = supabase
      .from("agents")
      .select("id,name,full_name,auth_user_id")
      .eq("company_id", companyId)
      .order("name", { ascending: true });

    const filters: string[] = [];
    if (propertyIds.length) {
      filters.push(`property_id.in.(${propertyIds.join(",")})`);
    }
    if (membershipIds.length) {
      filters.push(`membership_id.in.(${membershipIds.join(",")})`);
    }
    if (filters.length) {
      query = query.or(filters.join(","));
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const seen = new Set<string>();
    return ((data as AgentRow[] | null) ?? [])
      .filter((row) => {
        if (seen.has(row.id)) return false;
        seen.add(row.id);
        return true;
      })
      .map((row) => ({
        id: row.id,
        name: row.name,
        fullName: row.full_name,
        authUserId: row.auth_user_id,
      }));
  } catch {
    return [];
  }
}
