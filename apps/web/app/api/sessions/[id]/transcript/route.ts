import { NextResponse } from "next/server";
import { getTranscriptForSession } from "@/lib/evidence";

type Context = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(_request: Request, context: Context) {
  const { id } = await context.params;
  const transcript = await getTranscriptForSession(id);
  return NextResponse.json({ transcript });
}
