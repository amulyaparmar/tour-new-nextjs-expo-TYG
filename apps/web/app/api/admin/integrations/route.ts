import { NextResponse } from "next/server";

import { disconnectEntrataIntegration, getEntrataIntegration } from "@/lib/entrata";

export async function GET() {
  try {
    const entrata = await getEntrataIntegration();
    return NextResponse.json({ integrations: { entrata } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load integrations." },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as {
      provider?: "entrata";
      status?: "disconnected";
    };

    if (body.provider !== "entrata" || body.status !== "disconnected") {
      return NextResponse.json({ error: "Unsupported integration update." }, { status: 400 });
    }

    const entrata = await disconnectEntrataIntegration();
    return NextResponse.json({ integrations: { entrata } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update integration." },
      { status: 500 }
    );
  }
}
