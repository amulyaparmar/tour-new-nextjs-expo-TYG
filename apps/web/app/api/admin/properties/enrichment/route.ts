import { NextResponse } from "next/server";

import { AdminAuthError, requireAdminContext } from "@/lib/admin-auth";
import { getSupabaseServiceClient } from "@/lib/supabase";

type PropertyIntelligenceRow = {
  id: string;
  market_key: string | null;
  thumbnail_url: string | null;
  unit_count: number | null;
  estimated_units: number | null;
  estimated_beds: number | null;
  property_manager: string | null;
  extracted_pricing: unknown;
};

function isEnriched(property: PropertyIntelligenceRow) {
  return Boolean(
    property.property_manager?.trim() ||
    property.estimated_units !== null ||
    property.estimated_beds !== null ||
    property.extracted_pricing
  );
}

export async function GET(request: Request) {
  try {
    const workspace = await requireAdminContext(request);
    const propertyIds = workspace.communities.map((community) => community.propertyTygId);
    const supabase = getSupabaseServiceClient();
    const { data, error } = await supabase
      .from("propertiesTYG")
      .select("id,market_key,thumbnail_url,unit_count,estimated_units,estimated_beds,property_manager,extracted_pricing")
      .in("id", propertyIds);
    if (error) throw new Error(error.message);

    const byId = new Map(
      ((data ?? []) as PropertyIntelligenceRow[]).map((property) => [property.id, property] as const)
    );
    const communities = workspace.communities.map((community) => {
      const property = byId.get(community.propertyTygId) ?? null;
      const exactMember = community.teamMembers.find(
        (member) => member.email === workspace.user.email
      );
      return {
        communityId: community.id,
        state: property ? (isEnriched(property) ? "enriched" : "indexed") : "not_linked",
        match: property ? "property_id" : null,
        reportPropertyId: property?.id ?? null,
        marketKey: property?.market_key ?? null,
        thumbnailUrl: property?.thumbnail_url ?? null,
        unitCount: property?.estimated_units ?? property?.unit_count ?? null,
        propertyManager: property?.property_manager ?? null,
        teamRole: exactMember?.role ?? null,
      };
    });

    return NextResponse.json({ communities });
  } catch (caught) {
    const status = caught instanceof AdminAuthError ? caught.status : 500;
    return NextResponse.json(
      { error: caught instanceof Error ? caught.message : "Could not load property intelligence." },
      { status }
    );
  }
}
