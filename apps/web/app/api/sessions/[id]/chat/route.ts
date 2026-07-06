import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  streamText,
  toUIMessageStream,
  type UIMessage,
} from "ai";

import { getBedrockModel } from "@/lib/bedrock-language-model";
import { getTranscriptForSession } from "@/lib/evidence";
import { buildSessionAiInstructions } from "@/lib/session-ai-context";
import { getAnalysisBySessionId } from "@/lib/sessions";

export const maxDuration = 60;

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  const { id: sessionId } = await context.params;

  try {
    const { messages }: { messages: UIMessage[] } = await request.json();
    const analysis = await getAnalysisBySessionId(sessionId);

    if (!analysis) {
      return Response.json({ error: "Analysis not available for this session." }, { status: 404 });
    }

    const transcript = await getTranscriptForSession(sessionId);
    const instructions = buildSessionAiInstructions(analysis, transcript);

    const result = streamText({
      model: getBedrockModel(),
      instructions,
      messages: await convertToModelMessages(messages),
      temperature: 0.4,
    });

    return createUIMessageStreamResponse({
      stream: toUIMessageStream({ stream: result.stream }),
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to generate response." },
      { status: 500 }
    );
  }
}
