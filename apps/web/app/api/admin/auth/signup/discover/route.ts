import { NextResponse } from "next/server";

import { normalizeBusinessIdentity, searchGoogleBusinesses } from "@/lib/google-places";
import { getSupabaseServiceClient } from "@/lib/supabase";

type CommunityMatch = {
  id: string;
  name: string;
  gmb_id: string | null;
  alias: string | null;
  companies: { id: string; name: string } | Array<{ id: string; name: string }> | null;
};

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (query.length < 2) {
    return NextResponse.json({ error: "Enter at least two characters." }, { status: 400 });
  }

  try {
    const places = await searchGoogleBusinesses(query);
    const placeIds = places.map((place) => place.placeId);
    const supabase = getSupabaseServiceClient();
    const { data, error } = await supabase
      .from("communities")
      .select("id,name,gmb_id,alias,companies(id,name)")
      .eq("portal_enabled", true);
    if (error) throw new Error(error.message);

    const communities = (data ?? []) as unknown as CommunityMatch[];
    const matches = new Map<string, CommunityMatch>();
    for (const community of communities) {
      if (community.gmb_id && placeIds.includes(community.gmb_id)) {
        matches.set(community.gmb_id, community);
      }
    }
    for (const place of places) {
      if (matches.has(place.placeId)) continue;
      const identity = normalizeBusinessIdentity(place.name);
      const legacyMatch = communities.find((community) =>
        !community.gmb_id && (
          normalizeBusinessIdentity(community.alias) === identity ||
          normalizeBusinessIdentity(community.name) === identity
        )
      );
      if (legacyMatch) matches.set(place.placeId, legacyMatch);
    }

    return NextResponse.json({
      businesses: places.map((place) => {
        const community = matches.get(place.placeId);
        const company = community
          ? Array.isArray(community.companies)
            ? community.companies[0]
            : community.companies
          : null;
        return {
          ...place,
          existingTeam: community
            ? {
                communityId: community.id,
                communityName: community.name,
                companyName: company?.name ?? "Team",
              }
            : null,
        };
      }),
    });
  } catch (caught) {
    return NextResponse.json(
      { error: caught instanceof Error ? caught.message : "Business search failed." },
      { status: 500 }
    );
  }
}
