import { NextResponse } from "next/server";

import { normalizeGeminiAudioModelId } from "@tour/shared";

import { chatWithAudioRecording } from "@/lib/audio-insights";
import { getAudioInsights, getSessionById } from "@/lib/sessions";
import type { GeminiChatMessage } from "@/lib/gemini-client";

export const maxDuration = 120;

type Context = { params: Promise<{ id: string }> };

type ChatRequestBody = {
  messages?: Array<{ role?: string; content?: string }>;
  model?: string;
};

function normalizeMessages(body: ChatRequestBody): GeminiChatMessage[] {
  if (!Array.isArray(body.messages)) {
    throw new Error("messages must be an array.");
  }

  const messages: GeminiChatMessage[] = [];
  for (const item of body.messages) {
    if (item?.role !== "user" && item?.role !== "assistant") {
      throw new Error("Each message must have role user or assistant.");
    }
    const content = typeof item.content === "string" ? item.content.trim() : "";
    if (!content) {
      throw new Error("Each message must have non-empty content.");
    }
    messages.push({ role: item.role, content });
  }

  if (messages.length === 0) {
    throw new Error("At least one message is required.");
  }
  if (messages.at(-1)?.role !== "user") {
    throw new Error("The last message must be from the user.");
  }

  return messages;
}

export async function POST(request: Request, context: Context) {
  const { id } = await context.params;

  try {
    const session = await getSessionById(id);
    if (!session) {
      return NextResponse.json({ error: "Session not found." }, { status: 404 });
    }

    if (session.audioInsightsStatus !== "ready") {
      return NextResponse.json(
        { error: "Audio insights are not ready for this session." },
        { status: 409 }
      );
    }

    const insights = await getAudioInsights(id);
    if (!insights?.audioFile) {
      return NextResponse.json(
        { error: "Recording file reference is not available for chat." },
        { status: 409 }
      );
    }

    const body = (await request.json()) as ChatRequestBody;
    const messages = normalizeMessages(body);
    const model = normalizeGeminiAudioModelId(body.model, normalizeGeminiAudioModelId(insights.model));
    const reply = await chatWithAudioRecording({ insights, messages, model });

    return NextResponse.json({ reply });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to chat with recording." },
      { status: 500 }
    );
  }
}
