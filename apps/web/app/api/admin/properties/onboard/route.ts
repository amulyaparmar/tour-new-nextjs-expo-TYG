import { after, NextResponse } from "next/server";

import {
  AdminAuthError,
  propertySessionKeys,
  requireAdminContext,
} from "@/lib/admin-auth";
import { searchGoogleBusinesses } from "@/lib/google-places";
import { ensurePropertyRubric } from "@/lib/rubrics";
import { getSupabaseServiceClient } from "@/lib/supabase";
import { ensurePropertyTeamMember } from "@/lib/property-team";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const TOUR_REPORT_BASE_URL = (process.env.TOUR_REPORT_BASE_URL || "https://tour.report").replace(/\/$/, "");
const PLACE_ID_PATTERN = /^[A-Za-z0-9_-]{8,256}$/;

type PropertyRow = {
  id: string;
  place_id: string | null;
  name: string | null;
  address: string | null;
  website: string | null;
  thumbnail_url: string | null;
  property_manager: string | null;
  estimated_beds: number | null;
  extracted_pricing: unknown;
  metadata: unknown;
};

type PropertyTeamMemberRecord = Record<string, unknown> & {
  email?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeEmail(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function propertyTeam(metadata: unknown): PropertyTeamMemberRecord[] {
  if (!isRecord(metadata) || !Array.isArray(metadata.property_team)) return [];
  return metadata.property_team.filter(isRecord) as PropertyTeamMemberRecord[];
}

function enrichmentState(row: PropertyRow | null) {
  if (!row) return "new" as const;
  return row.property_manager?.trim() || row.estimated_beds || row.extracted_pricing
    ? "enriched" as const
    : "indexed" as const;
}

async function findProperties(placeIds: string[]) {
  if (placeIds.length === 0) return new Map<string, PropertyRow>();
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from("propertiesTYG")
    .select("id,place_id,name,address,website,thumbnail_url,property_manager,estimated_beds,extracted_pricing,metadata")
    .or(`id.in.(${placeIds.join(",")}),place_id.in.(${placeIds.join(",")})`);
  if (error) throw new Error(error.message);

  const byPlaceId = new Map<string, PropertyRow>();
  for (const raw of data ?? []) {
    const row = raw as PropertyRow;
    byPlaceId.set(row.id, row);
    if (row.place_id) byPlaceId.set(row.place_id, row);
  }
  return byPlaceId;
}

async function findProperty(placeId: string) {
  const rows = await findProperties([placeId]);
  return rows.get(placeId) ?? null;
}

async function upsertPropertyFromTourReport(placeId: string) {
  const response = await fetch(`${TOUR_REPORT_BASE_URL}/api/properties/upsert`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ placeId }),
    cache: "no-store",
    signal: AbortSignal.timeout(55_000),
  });
  const body = await response.json().catch(() => null) as {
    success?: boolean;
    property?: PropertyRow;
    error?: string;
  } | null;
  if (!response.ok || !body?.success || !body.property?.id) {
    throw new Error(body?.error ?? "Tour.report could not add this property.");
  }
  return body.property;
}

function startEnrichment(property: PropertyRow) {
  if (enrichmentState(property) === "enriched") return;

  const jobs: Array<{ path: string; body: Record<string, unknown> }> = [
    { path: "/api/property-enrichment/enrich/property-manager", body: { placeId: property.id } },
    { path: "/api/property-enrichment/enrich/floor-plans", body: { placeId: property.id, datalakeTYG: "pricing" } },
    { path: "/api/property-enrichment/enrich/unitdata", body: { placeId: property.id } },
    { path: "/api/property-enrichment/enrich/amenities", body: { placeId: property.id } },
    { path: "/api/report/enrich/reviews", body: { id: property.id, datalakeTYG: "google_reviews" } },
  ];
  if (property.website) {
    jobs.push({
      path: "/api/report/enrich/website-audit",
      body: { placeId: property.id, includePhotos: false },
    });
  }

  after(async () => {
    await Promise.allSettled(
      jobs.map(({ path, body }) => fetch(`${TOUR_REPORT_BASE_URL}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
        cache: "no-store",
        signal: AbortSignal.timeout(240_000),
      }))
    );
  });
}

export async function GET(request: Request) {
  try {
    const workspace = await requireAdminContext(request);
    const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
    if (query.length < 2) return NextResponse.json({ properties: [] });

    const places = (await searchGoogleBusinesses(query)).slice(0, 12);
    const existing = await findProperties(places.map((place) => place.placeId));
    const properties = places.map((place) => {
      const row = existing.get(place.placeId) ?? null;
      return {
        placeId: place.placeId,
        name: place.name,
        address: place.formattedAddress,
        website: place.website,
        state: enrichmentState(row),
        alreadyAssigned: row
          ? propertyTeam(row.metadata).some(
              (member) => normalizeEmail(member.email) === workspace.user.email
            )
          : false,
        thumbnailUrl: row?.thumbnail_url ?? null,
      };
    });
    return NextResponse.json({ properties });
  } catch (caught) {
    const status = caught instanceof AdminAuthError ? caught.status : 500;
    return NextResponse.json(
      { error: caught instanceof Error ? caught.message : "Could not search properties." },
      { status }
    );
  }
}

export async function POST(request: Request) {
  try {
    const workspace = await requireAdminContext(request);
    const body = await request.json().catch(() => ({})) as { placeId?: string };
    const placeId = body.placeId?.trim() ?? "";
    if (!PLACE_ID_PATTERN.test(placeId)) {
      return NextResponse.json({ error: "A valid Google property is required." }, { status: 400 });
    }

    let property = await findProperty(placeId);
    if (!property) property = await upsertPropertyFromTourReport(placeId);

    await ensurePropertyTeamMember({
      propertyId: property.id,
      userId: workspace.user.id,
      name: workspace.user.fullName ?? workspace.teamMember.name ?? workspace.user.email.split("@")[0],
      email: workspace.user.email,
      role: workspace.teamMember.role || "Property Team",
      alias: workspace.teamMember.alias,
      phone: workspace.user.phone ?? workspace.teamMember.phone,
      title: workspace.user.title ?? workspace.teamMember.title,
      cardAccent: workspace.user.cardAccent ?? workspace.teamMember.cardAccent,
      propertyAlias: property.name,
      verified: true,
    });

    const scopedRequest = new Request(request.url, { headers: new Headers(request.headers) });
    scopedRequest.headers.set("x-admin-community-id", property.id);
    const nextWorkspace = await requireAdminContext(scopedRequest);
    await ensurePropertyRubric(
      nextWorkspace.community.propertyTygId,
      propertySessionKeys(nextWorkspace.community)
    );
    startEnrichment(property);

    return NextResponse.json({
      workspace: nextWorkspace,
      property: {
        id: property.id,
        name: property.name,
        state: enrichmentState(property),
        enrichmentStarted: enrichmentState(property) !== "enriched",
      },
    });
  } catch (caught) {
    const status = caught instanceof AdminAuthError ? caught.status : 500;
    return NextResponse.json(
      { error: caught instanceof Error ? caught.message : "Could not add this property." },
      { status }
    );
  }
}
