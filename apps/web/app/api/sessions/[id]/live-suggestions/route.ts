import { generateText } from "ai";
import { NextResponse } from "next/server";

import { getBedrockLanguageModelForAnalysis } from "@/lib/bedrock-language-model";
import { getSupabaseServiceClient } from "@/lib/supabase";
import { getSessionById } from "@/lib/sessions";

export const maxDuration = 30;

type Context = { params: Promise<{ id: string }> };

type LiveSuggestionsBody = {
  liveTranscript?: string;
  propertyContext?: string;
};

const FALLBACK_SUGGESTIONS = [
  "Ask about move-in date",
  "Confirm must-haves",
  "Mention pet policy",
  "Offer floor plan options",
  "Check parking needs",
  "Ask about budget range",
  "Highlight amenities",
  "Suggest a next tour stop",
];

function truncate(value: string | null | undefined, maxLength: number) {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > maxLength ? `${trimmed.slice(0, maxLength)}...` : trimmed;
}

function parseSuggestions(raw: string): string[] {
  const lines = raw
    .split(/\n|•|-|\d+\./)
    .map((line) => line.replace(/^[\s"'\-•]+|[\s"']+$/g, "").trim())
    .filter((line) => line.length >= 8 && line.length <= 42);
  const unique: string[] = [];
  for (const line of lines) {
    const key = line.toLowerCase();
    if (unique.some((item) => item.toLowerCase() === key)) continue;
    unique.push(line);
    if (unique.length >= 4) break;
  }
  return unique;
}

async function loadCommunityName(propertyId: string | null | undefined) {
  if (!propertyId) return null;
  try {
    const supabase = getSupabaseServiceClient();
    const { data } = await supabase
      .from("propertiesTYG")
      .select("name")
      .eq("id", propertyId)
      .maybeSingle<{ name: string }>();
    if (data?.name) return data.name;
    if (!propertyId.startsWith("community:")) return null;
    const legacyId = Number(propertyId.slice("community:".length));
    const { data: legacy } = await supabase
      .from("Community")
      .select("name")
      .eq("id", legacyId)
      .maybeSingle<{ name: string }>();
    return legacy?.name ?? null;
  } catch {
    return null;
  }
}

export async function POST(request: Request, context: Context) {
  const { id } = await context.params;

  try {
    const session = await getSessionById(id);
    if (!session) {
      return NextResponse.json({ error: "Session not found." }, { status: 404 });
    }

    const body = (await request.json().catch(() => ({}))) as LiveSuggestionsBody;
    const liveTranscript = truncate(body.liveTranscript, 4_000);
    const propertyContext = truncate(body.propertyContext, 2_000);
    const communityName = await loadCommunityName(session.propertyId);

    if (!liveTranscript && !propertyContext && !communityName) {
      return NextResponse.json({ suggestions: FALLBACK_SUGGESTIONS.slice(0, 4) });
    }

    const result = await generateText({
      model: getBedrockLanguageModelForAnalysis(),
      instructions: `You help a leasing agent during a live apartment tour.
Return exactly 4 short suggested next lines or questions the agent can say or ask.
Each suggestion must be under 36 characters, practical, and Fair Housing safe.
No numbering, no quotes, one suggestion per line.

Community: ${communityName || session.location || "Unknown"}
Prospect: ${session.prospectName || "Unknown"}
Property context: ${propertyContext || "None"}
Live transcript:
${liveTranscript || "None yet"}`,
      prompt: "Suggest 4 short next prompts for the agent.",
      temperature: 0.5,
    });

    const suggestions = parseSuggestions(result.text);
    return NextResponse.json({
      suggestions: suggestions.length ? suggestions : FALLBACK_SUGGESTIONS.slice(0, 4),
    });
  } catch (error) {
    return NextResponse.json(
      {
        suggestions: FALLBACK_SUGGESTIONS.slice(0, 4),
        error: error instanceof Error ? error.message : "Failed to generate suggestions.",
      },
      { status: 200 }
    );
  }
}
