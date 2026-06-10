import { NextResponse } from "next/server";
import { getScreenshotsForSession } from "@/lib/evidence";

type Context = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(_request: Request, context: Context) {
  const { id } = await context.params;
  const screenshots = await getScreenshotsForSession(id);

  return NextResponse.json({ screenshots });
}
