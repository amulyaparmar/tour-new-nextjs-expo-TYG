import { NextResponse } from "next/server";

import { listAnalysisRuns } from "@/lib/sessions";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  const { id } = await context.params;
  try {
    const runs = await listAnalysisRuns(id);
    return NextResponse.json({ runs });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list analysis runs." },
      { status: 500 }
    );
  }
}
