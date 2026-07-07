import { NextResponse } from "next/server";

import { resolveFallbackAdminContext } from "@/lib/admin-auth";
import { compareCommunityDisplayName, formatCommunityDisplayName } from "@/lib/community-display";
import { getSupabaseServiceClient } from "@/lib/supabase";

type BusinessRow = {
  id: string;
  name: string;
  gmb_id: string | null;
  alias: string | null;
  entrata_property_id: string | null;
  companies: { id: string; name: string; slug: string } | Array<{ id: string; name: string; slug: string }> | null;
};

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  try {
    const supabase = getSupabaseServiceClient();
    const builder = supabase
      .from("communities")
      .select("id,name,gmb_id,alias,entrata_property_id,companies(id,name,slug)")
      .eq("portal_enabled", true)
      .order("name", { ascending: true })
      .limit(1000);

    const { data, error } = await builder;

    if (error) throw new Error(error.message);
    const rows = (data ?? []) as unknown as BusinessRow[];
    if (rows.length === 0 && !query) {
      return NextResponse.json(await fallbackBusinesses(query));
    }

    const normalizedQuery = query.toLowerCase();
    const businesses = rows
      .map((row) => {
        const company = Array.isArray(row.companies)
          ? row.companies[0]
          : row.companies;
        const companyName = company?.name ?? "Company";
        const name = formatCommunityDisplayName({
          name: row.name,
          companyName,
          companySlug: company?.slug,
        });
        return {
          id: row.id,
          name,
          companyName,
          gmbId: row.gmb_id,
          alias: row.alias,
          calendarConnected: Boolean(row.entrata_property_id),
        };
      })
      .filter((business) => {
        if (!normalizedQuery) return true;
        return `${business.name} ${business.companyName} ${business.alias ?? ""}`
          .toLowerCase()
          .includes(normalizedQuery);
      })
      .sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: "base" }));

    return NextResponse.json({
      businesses,
    });
  } catch {
    return NextResponse.json(await fallbackBusinesses(query));
  }
}

async function fallbackBusinesses(query: string) {
  const workspace = await resolveFallbackAdminContext();
  const normalized = query.trim().toLowerCase();
  const businesses = workspace.communities
    .filter((community) => {
      if (!normalized) return true;
      return `${community.name} ${community.companyName ?? workspace.membership.companyName} ${community.alias ?? ""}`
        .toLowerCase()
        .includes(normalized);
    })
    .sort((left, right) => compareCommunityDisplayName(left, right))
    .map((community) => {
      return {
        id: community.id,
        name: formatCommunityDisplayName(community),
        companyName: community.companyName ?? workspace.membership.companyName,
        gmbId: community.gmbId,
        alias: community.alias,
        calendarConnected: false,
      };
    });

  return { businesses };
}
