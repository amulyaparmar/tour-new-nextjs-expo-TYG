import { NextResponse } from "next/server";

import {
  loadEntrataCredentials,
  syncEntrataReferenceData,
  updateEntrataSyncStats,
} from "@/lib/entrata";

export async function POST() {
  try {
    const credentials = await loadEntrataCredentials();
    if (!credentials) {
      return NextResponse.json({ error: "Entrata is not connected." }, { status: 409 });
    }

    const sync = await syncEntrataReferenceData(credentials);
    const integration = await updateEntrataSyncStats({
      propertiesSynced: sync.propertiesSynced,
      guestCardsSynced: sync.guestCardsSynced,
      unitsSynced: sync.unitsSynced,
    });

    return NextResponse.json({ integration, sync });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Entrata sync failed." },
      { status: 500 }
    );
  }
}
