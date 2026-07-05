import { NextResponse } from "next/server";

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
  const supabase = getSupabaseServiceClient();
  let builder = supabase
    .from("communities")
    .select("id,name,gmb_id,alias,entrata_property_id,companies(id,name,slug)")
    .eq("portal_enabled", true)
    .order("name", { ascending: true })
    .limit(1000);

  if (query) builder = builder.ilike("name", `%${query}%`);
  const { data, error } = await builder;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    businesses: ((data ?? []) as unknown as BusinessRow[]).map((row) => {
      const company = Array.isArray(row.companies)
        ? row.companies[0]
        : row.companies;
      return {
        id: row.id,
        name: row.name,
        companyName: company?.name ?? "Company",
        gmbId: row.gmb_id,
        alias: row.alias,
        calendarConnected: Boolean(row.entrata_property_id),
      };
    }),
  });
}
