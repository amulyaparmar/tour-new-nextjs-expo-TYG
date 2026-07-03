import { NextResponse } from "next/server";

import { AdminAuthError, requireAdminContext } from "@/lib/admin-auth";
import { saveEntrataError, testEntrataConnection } from "@/lib/entrata";

export async function POST(request: Request) {
  try {
    await requireAdminContext(request);
  } catch (caught) {
    return NextResponse.json(
      { error: caught instanceof Error ? caught.message : "Sign in is required." },
      { status: caught instanceof AdminAuthError ? caught.status : 500 }
    );
  }

  const body = (await request.json()) as {
    domain?: string;
    apiKey?: string;
    propertyId?: string;
  };

  if (!body.domain?.trim() || !body.apiKey?.trim()) {
    return NextResponse.json({ error: "domain and apiKey are required." }, { status: 400 });
  }

  try {
    const result = await testEntrataConnection({
      domain: body.domain,
      apiKey: body.apiKey,
      propertyId: body.propertyId,
    });

    return NextResponse.json({
      ok: true,
      integration: {
        provider: "entrata",
        status: "connected",
        domain: result.domain,
        propertyId: result.propertyId,
        propertiesFound: result.propertiesFound,
        lastTestedAt: new Date().toISOString(),
        keyPreview: `${body.apiKey.slice(0, 4)}...${body.apiKey.slice(-4)}`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Entrata connection test failed.";
    await saveEntrataError({ domain: body.domain, propertyId: body.propertyId }, message).catch(() => {});
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
