import { NextResponse } from "next/server";

import { getRepCard } from "@/lib/reps";
import { normalizeLayout, renderCardImage } from "@/lib/card-image";

export const runtime = "nodejs";

type CardParams = {
  params: Promise<{ slug: string }>;
};

/**
 * Generated tour-card PNG for a rep. Powers both the /p/[slug] link preview and
 * the MMS attachment in the text-contact route.
 *
 * Query: ?layout=property (default) | rep
 */
export async function GET(request: Request, { params }: CardParams) {
  const { slug } = await params;
  const card = getRepCard(slug);
  if (!card) {
    return NextResponse.json({ error: "Unknown rep." }, { status: 404 });
  }

  const layout = normalizeLayout(new URL(request.url).searchParams.get("layout"));
  return renderCardImage(card, layout);
}
