import { NextResponse } from "next/server";

import { connectEntrataIntegration, syncEntrataReferenceData } from "@/lib/entrata";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    domain?: string;
    apiKey?: string;
    propertyId?: string;
  };

  if (!body.domain?.trim() || !body.apiKey?.trim()) {
    return NextResponse.json({ error: "domain and apiKey are required." }, { status: 400 });
  }

  try {
    const credentials = {
      domain: body.domain,
      apiKey: body.apiKey,
      propertyId: body.propertyId,
    };
    const sync = await syncEntrataReferenceData(credentials).catch(() => null);
    const integration = await connectEntrataIntegration(credentials, sync ? {
      propertiesSynced: sync.propertiesSynced,
      guestCardsSynced: sync.guestCardsSynced,
      unitsSynced: sync.unitsSynced,
    } : undefined);

    return NextResponse.json({ integration, sync });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to connect Entrata." },
      { status: 500 }
    );
  }
}
