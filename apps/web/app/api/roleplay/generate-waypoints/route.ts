// POST /api/roleplay/generate-waypoints
//   body: { scenario: { name, personaPrompt, description?, firstMessage?,
//           difficulty?, speaksFirst?, checkpoints?, rubric? } }
//   -> { success: true, waypoints: RoleplayWaypoint[], model }
//
// Creates/recreates a scenario's live-coaching waypoints with an LLM. The
// prompt + output validation live in lib/roleplay/waypointGeneration.ts.
// Two provider legs, one retry across both on bad output:
//   1. OpenAI (this repo's OPENAI_API_KEY / OPENAI_MODEL) — JSON mode.
//   2. Vapi Chat API with a transient Gemini assistant (VAPI_PRIVATE_KEY) —
//      the same billing every roleplay call uses.

import { NextResponse } from "next/server";
import { requireRoleplayWorkspace } from "@/lib/roleplay/apiAuth";
import { createVapiChat } from "@/lib/roleplay/vapiServer";
import {
  buildWaypointGenerationPrompt,
  parseGeneratedWaypoints,
  WAYPOINT_GENERATION_MODEL,
} from "@/lib/roleplay/waypointGeneration";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const json = (body: unknown, status = 200) => NextResponse.json(body, { status });

const GENERATION_SYSTEM_PROMPT =
  "You are a generation service. Follow the user's instructions exactly and return ONLY the requested JSON — no prose, no code fences.";

async function callOpenAi(prompt: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
  const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.7,
      // json_object mode requires an object — the parser accepts the
      // {"waypoints": [...]} wrapper shape.
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: GENERATION_SYSTEM_PROMPT },
        {
          role: "user",
          content: `${prompt}\n\nReturn the JSON as an object of the form {"waypoints": [ ...the 3-4 waypoint objects... ]}.`,
        },
      ],
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`OpenAI error ${res.status}:`, body.slice(0, 500));
    throw new Error(`OpenAI error ${res.status}`);
  }
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content ?? "";
  if (!String(text).trim()) throw new Error("OpenAI returned an empty response");
  return String(text);
}

async function callVapiChat(prompt: string): Promise<string> {
  const res = await createVapiChat({
    assistant: {
      model: {
        provider: "google",
        model: WAYPOINT_GENERATION_MODEL,
        temperature: 0.7,
        maxTokens: 8192,
        messages: [{ role: "system", content: GENERATION_SYSTEM_PROMPT }],
      },
    },
    input: prompt,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`Vapi chat error ${res.status}:`, body.slice(0, 500));
    throw new Error(`Vapi chat error ${res.status}`);
  }
  const data = await res.json();
  const text = (Array.isArray(data?.output) ? data.output : [])
    .map((message: { content?: string }) => message?.content ?? "")
    .join("");
  if (!text.trim()) throw new Error("Vapi chat returned an empty response");
  return text;
}

async function generateWaypointText(prompt: string): Promise<string> {
  let openAiError: Error | null = null;
  try {
    return await callOpenAi(prompt);
  } catch (error) {
    openAiError = error instanceof Error ? error : new Error(String(error));
  }
  try {
    return await callVapiChat(prompt);
  } catch (vapiError) {
    const vapiMessage =
      vapiError instanceof Error ? vapiError.message : String(vapiError);
    throw new Error(`OpenAI: ${openAiError.message}; Vapi fallback: ${vapiMessage}`);
  }
}

export async function POST(request: Request) {
  try {
    // Spends org credentials (OpenAI / Vapi) — real workspace required.
    const { workspace, response } = await requireRoleplayWorkspace(request);
    if (!workspace) return response;
    const body = await request.json();
    const scenario = body?.scenario ?? {};
    if (!String(scenario?.name ?? "").trim() || !String(scenario?.personaPrompt ?? "").trim()) {
      return json(
        {
          success: false,
          message: "scenario.name and scenario.personaPrompt are required to generate waypoints",
        },
        400
      );
    }

    const prompt = buildWaypointGenerationPrompt(scenario);
    let lastError: Error | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const text = await generateWaypointText(prompt);
        const waypoints = parseGeneratedWaypoints(text);
        return json({ success: true, waypoints });
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
      }
    }
    throw lastError ?? new Error("waypoint generation failed");
  } catch (error) {
    const message = error instanceof Error ? error.message : "waypoint generation failed";
    console.error("Error generating waypoints:", message);
    return json({ success: false, message }, 502);
  }
}
