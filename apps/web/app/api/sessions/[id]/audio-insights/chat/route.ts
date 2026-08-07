import { NextResponse } from "next/server";

import { normalizeGeminiAudioModelId } from "@tour/shared";
import type { GeminiAudioFileRef } from "@tour/shared";

import {
  chatWithAudioRecording,
  createGeminiAudioFileRef,
  isGeminiAudioFileExpired,
} from "@/lib/audio-insights";
import { safeAiChatError } from "@/lib/safe-ai-error";
import {
  getAudioInsights,
  getSessionById,
  saveAudioInsights,
} from "@/lib/sessions";
import { fetchRecordingFile } from "@/lib/storage";
import type { GeminiChatMessage } from "@/lib/gemini-client";

export const maxDuration = 120;

type Context = { params: Promise<{ id: string }> };

type ChatRequestBody = {
  messages?: Array<{ role?: string; content?: string }>;
  model?: string;
  audioFile?: GeminiAudioFileRef;
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

function normalizeAudioFileRef(value: unknown): GeminiAudioFileRef | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as Partial<GeminiAudioFileRef>;
  if (
    typeof candidate.uri !== "string" ||
    typeof candidate.mimeType !== "string"
  ) {
    return undefined;
  }
  return {
    uri: candidate.uri,
    mimeType: candidate.mimeType,
    name: typeof candidate.name === "string" ? candidate.name : undefined,
    createdAt:
      typeof candidate.createdAt === "string" ? candidate.createdAt : undefined,
    expiresAt:
      typeof candidate.expiresAt === "string" ? candidate.expiresAt : undefined,
  };
}

export async function POST(request: Request, context: Context) {
  const { id } = await context.params;

  try {
    const session = await getSessionById(id);
    if (!session) {
      return NextResponse.json(
        { error: "Session not found." },
        { status: 404 },
      );
    }

    const loadedInsights = await getAudioInsights(id);

    const body = (await request.json()) as ChatRequestBody;
    const messages = normalizeMessages(body);
    const model = normalizeGeminiAudioModelId(
      body.model,
      normalizeGeminiAudioModelId(loadedInsights?.model),
    );
    let audioFileRefreshed = false;
    let audioFile: GeminiAudioFileRef | undefined =
      loadedInsights?.audioFile ?? normalizeAudioFileRef(body.audioFile);

    const refreshAudioFile = async () => {
      const recording = await fetchRecordingFile(id);
      if (!recording) {
        throw new Error("Recording file is not available for re-indexing.");
      }

      audioFile = await createGeminiAudioFileRef({
        audioBuffer: recording.buffer,
        mimeType: recording.mimeType,
        fileName: recording.fileName,
      });
      if (loadedInsights) {
        await saveAudioInsights(id, { ...loadedInsights, audioFile });
      }
      audioFileRefreshed = true;
    };

    if (isGeminiAudioFileExpired(audioFile)) {
      try {
        await refreshAudioFile();
      } catch (error) {
        return NextResponse.json(
          {
            error:
              error instanceof Error
                ? error.message
                : "Recording file is not available for re-indexing.",
          },
          { status: 409 },
        );
      }
    }

    let reply: string;
    try {
      if (!audioFile)
        throw new Error("Recording file is not available for audio chat.");
      reply = await chatWithAudioRecording({
        audioFile,
        messages,
        model,
        summary: loadedInsights?.summary,
      });
    } catch (error) {
      if (audioFileRefreshed || !isGeminiFileReferenceError(error)) {
        throw error;
      }
      await refreshAudioFile();
      if (!audioFile)
        throw new Error("Recording file is not available for audio chat.");
      reply = await chatWithAudioRecording({
        audioFile,
        messages,
        model,
        summary: loadedInsights?.summary,
      });
    }

    return NextResponse.json({
      reply,
      audioFileRefreshed,
      audioFile,
      audioFileExpiresAt: audioFile?.expiresAt ?? null,
    });
  } catch (error) {
    console.error("Audio insights chat failed", error);
    return NextResponse.json(
      { error: safeAiChatError(error) },
      { status: 500 },
    );
  }
}

function isGeminiFileReferenceError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /file|uri|not\s*found|expired|permission|400|403|404/i.test(
    error.message,
  );
}
