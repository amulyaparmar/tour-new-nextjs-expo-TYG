import { NextResponse } from "next/server";

import { AdminAuthError, requireAdminContext } from "@/lib/admin-auth";

const TOUR_REPORT_BASE_URL = (process.env.TOUR_REPORT_BASE_URL || "https://tour.report").replace(/\/$/, "");

type ReportProperty = {
  id?: string;
  name?: string;
  market_key?: string | null;
  thumbnail_url?: string | null;
  website?: string | null;
  unitCount?: number | string | null;
  propertyManager?: string | null;
  teamRole?: string | null;
};

type FullReportProperty = {
  id?: string;
  property_manager?: string | null;
  estimated_beds?: number | string | null;
  extracted_pricing?: unknown;
};

function normalizeIdentity(value: string | null | undefined) {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function hasEnrichedData(property: ReportProperty) {
  return Boolean(
    property.propertyManager?.trim() ||
    (property.unitCount !== null && property.unitCount !== undefined && String(property.unitCount) !== "")
  );
}

function hasFullEnrichedData(property: FullReportProperty) {
  return Boolean(
    property.property_manager?.trim() ||
    (property.estimated_beds !== null &&
      property.estimated_beds !== undefined &&
      String(property.estimated_beds) !== "") ||
    property.extracted_pricing
  );
}

export async function GET(request: Request) {
  try {
    const workspace = await requireAdminContext(request);
    const response = await fetch(
      `${TOUR_REPORT_BASE_URL}/api/property-enrichment/team-properties?email=${encodeURIComponent(workspace.user.email)}`,
      {
        cache: "no-store",
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(8_000),
      }
    );
    const body = await response.json().catch(() => null) as {
      success?: boolean;
      properties?: ReportProperty[];
      error?: string;
    } | null;
    if (!response.ok || !body?.success || !Array.isArray(body.properties)) {
      return NextResponse.json(
        { error: body?.error ?? "Could not load property intelligence." },
        { status: response.status || 502 }
      );
    }

    const reportProperties = body.properties.filter((property) => property.id && property.name);
    const byPlaceId = new Map(reportProperties.map((property) => [String(property.id), property]));
    const byIdentity = new Map<string, ReportProperty>();
    for (const property of reportProperties) {
      const identity = normalizeIdentity(property.name);
      if (identity && !byIdentity.has(identity)) byIdentity.set(identity, property);
    }

    const matchByCommunity = new Map(
      workspace.communities.map((community) => {
        const exactMatch = community.gmbId ? byPlaceId.get(community.gmbId) : undefined;
        const nameMatch =
          byIdentity.get(normalizeIdentity(community.alias)) ??
          byIdentity.get(normalizeIdentity(community.name));
        return [community.id, exactMatch ?? nameMatch] as const;
      })
    );
    const matchedIds = [...new Set(
      [...matchByCommunity.values()]
        .map((property) => property?.id)
        .filter((id): id is string => Boolean(id))
    )];
    const fullRecords = await Promise.allSettled(
      matchedIds.map(async (id) => {
        const detailResponse = await fetch(
          `${TOUR_REPORT_BASE_URL}/api/property-enrichment/fetch?id=${encodeURIComponent(id)}`,
          {
            cache: "no-store",
            headers: { Accept: "application/json" },
            signal: AbortSignal.timeout(6_000),
          }
        );
        const detailBody = await detailResponse.json().catch(() => null) as {
          success?: boolean;
          property?: FullReportProperty;
        } | null;
        if (!detailResponse.ok || !detailBody?.success || !detailBody.property) return null;
        return [id, detailBody.property] as const;
      })
    );
    const fullRecordById = new Map<string, FullReportProperty>();
    for (const result of fullRecords) {
      if (result.status === "fulfilled" && result.value) {
        fullRecordById.set(result.value[0], result.value[1]);
      }
    }

    const communities = workspace.communities.map((community) => {
      const exactMatch = community.gmbId ? byPlaceId.get(community.gmbId) : undefined;
      const match = matchByCommunity.get(community.id);
      const fullRecord = match?.id ? fullRecordById.get(match.id) : undefined;
      const enriched = fullRecord ? hasFullEnrichedData(fullRecord) : match ? hasEnrichedData(match) : false;
      return {
        communityId: community.id,
        state: match ? (enriched ? "enriched" : "indexed") : "not_linked",
        match: exactMatch ? "place_id" : match ? "normalized_name" : null,
        reportPropertyId: match?.id ?? null,
        marketKey: match?.market_key ?? null,
        thumbnailUrl: match?.thumbnail_url ?? null,
        unitCount: match?.unitCount ?? null,
        propertyManager: match?.propertyManager ?? null,
        teamRole: match?.teamRole ?? null,
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
