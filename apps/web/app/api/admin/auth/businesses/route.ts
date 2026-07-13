import { NextResponse } from "next/server";

import { getSupabaseServiceClient } from "@/lib/supabase";

type PropertyRow = {
  id: string;
  name: string | null;
  alias: string | null;
  place_id: string | null;
  property_manager: string | null;
  metadata: unknown;
};

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const email = params.get("email")?.trim().toLowerCase() ?? "";
  const query = params.get("q")?.trim().toLowerCase() ?? "";
  if (!email.includes("@")) {
    return NextResponse.json({ businesses: [], error: "Enter your work email to load your properties." }, { status: 400 });
  }

  try {
    const supabase = getSupabaseServiceClient();
    const rows: PropertyRow[] = [];
    const pageSize = 1000;
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await supabase
        .from("propertiesTYG")
        .select("id,name,alias,place_id,property_manager,metadata")
        .not("metadata->property_team", "is", null)
        .order("name", { ascending: true })
        .range(from, from + pageSize - 1);
      if (error) throw new Error(error.message);
      const batch = (data ?? []) as PropertyRow[];
      rows.push(...batch);
      if (batch.length < pageSize) break;
    }

    const businesses = rows
      .filter((row) => propertyTeamEmails(row.metadata).includes(email))
      .map((row) => ({
        id: row.id,
        name: row.name?.trim() || `Property ${row.id}`,
        companyName: row.property_manager?.trim() || email.split("@")[1] || "Property team",
        gmbId: row.place_id?.trim() || null,
        alias: row.alias?.trim() || null,
        calendarConnected: false,
      }))
      .filter((business) => !query || `${business.name} ${business.companyName} ${business.alias ?? ""}`.toLowerCase().includes(query))
      .sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: "base" }));

    return NextResponse.json({ businesses }, { headers: { "Cache-Control": "no-store" } });
  } catch (caught) {
    return NextResponse.json(
      { error: caught instanceof Error ? caught.message : "Could not load properties." },
      { status: 500 }
    );
  }
}

function propertyTeamEmails(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return [];
  const team = (metadata as { property_team?: unknown }).property_team;
  if (!Array.isArray(team)) return [];
  return team.flatMap((member) => {
    if (!member || typeof member !== "object" || Array.isArray(member)) return [];
    const email = String((member as { email?: unknown }).email ?? "").trim().toLowerCase();
    return email ? [email] : [];
  });
}
