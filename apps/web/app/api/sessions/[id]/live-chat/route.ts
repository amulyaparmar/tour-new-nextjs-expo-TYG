import { streamText, type ModelMessage } from "ai";
import { NextResponse } from "next/server";

import { getBedrockLanguageModelForAnalysis } from "@/lib/bedrock-language-model";
import { getSupabaseServiceClient } from "@/lib/supabase";
import { getSessionById } from "@/lib/sessions";

export const maxDuration = 60;

type Context = { params: Promise<{ id: string }> };

type LiveChatBody = {
  messages?: Array<{ role?: string; content?: string }>;
  liveTranscript?: string;
  propertyContext?: string;
};

function normalizeMessages(body: LiveChatBody): ModelMessage[] {
  if (!Array.isArray(body.messages)) {
    throw new Error("messages must be an array.");
  }

  const messages: ModelMessage[] = [];
  for (const item of body.messages.slice(-12)) {
    if (item.role !== "user" && item.role !== "assistant") {
      throw new Error("Each message must have role user or assistant.");
    }
    const content = typeof item.content === "string" ? item.content.trim() : "";
    if (!content) {
      throw new Error("Each message must have non-empty content.");
    }
    messages.push({ role: item.role, content });
  }

  if (messages.length === 0 || messages.at(-1)?.role !== "user") {
    throw new Error("The last message must be from the user.");
  }

  return messages;
}

function truncate(value: string | null | undefined, maxLength: number) {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > maxLength ? `${trimmed.slice(0, maxLength)}...` : trimmed;
}

async function loadCommunityContext(propertyId: string | null | undefined) {
  if (!propertyId) return null;
  try {
    const supabase = getSupabaseServiceClient();
    const { data, error } = await supabase
      .from("communities")
      .select("id,name,alias,gmb_id,entrata_property_id")
      .eq("id", propertyId)
      .maybeSingle<{
        id: string;
        name: string;
        alias: string | null;
        gmb_id: string | null;
        entrata_property_id: string | null;
      }>();
    if (error || !data) return null;
    return [
      `Community: ${data.name}`,
      data.alias ? `Alias: ${data.alias}` : null,
      data.gmb_id ? `GMB: ${data.gmb_id}` : null,
      data.entrata_property_id ? `Entrata property: ${data.entrata_property_id}` : null,
    ]
      .filter(Boolean)
      .join("\n");
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

    const body = (await request.json()) as LiveChatBody;
    const messages = normalizeMessages(body);
    const liveTranscript = truncate(body.liveTranscript, 8_000);
    const clientPropertyContext = truncate(body.propertyContext, 4_000);
    const dbPropertyContext = await loadCommunityContext(session.propertyId);
    const propertyContext = [dbPropertyContext, clientPropertyContext].filter(Boolean).join("\n\n");

    const instructions = `You are Tour AI, a live in-tour assistant for a multifamily leasing agent.

Help the agent while they are actively touring with a prospect. Be concise, calm, and practical. Use the property/session context and live transcript if available. Prefer short bullets or one clear next line the agent can say out loud.

Format replies in lightweight Markdown when helpful (short bullets, **bold** for key phrases). Keep answers scannable on a phone.

Never suggest discriminatory screening or anything that could create a Fair Housing issue. If the agent asks for risky guidance, redirect to neutral, policy-safe language.

## Current session
Title: ${session.title}
Prospect: ${session.prospectName || "Unknown"}
Agent: ${session.agentName || "Unknown"}
Location/unit: ${session.location || session.unitLabel || "Not provided"}
Session notes: ${session.notes || "None yet"}

## Property context
${propertyContext || "No extra property context was provided."}

## Live transcript so far
${liveTranscript || "No live transcript has been captured yet."}`;

    const result = streamText({
      model: getBedrockLanguageModelForAnalysis(),
      instructions,
      messages,
      temperature: 0.35,
    });

    // octet-stream + no encoding — required for expo/fetch streaming on device.
    return result.toTextStreamResponse({
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Encoding": "none",
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate live chat response." },
      { status: 500 }
    );
  }
}
