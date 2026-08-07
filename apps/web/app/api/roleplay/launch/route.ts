// Native roleplay launch configuration.
//
// The browser and native clients use the same Vapi assistant and scenario
// overrides. Keeping override construction on the server prevents the mobile
// client from drifting from the web experience as the practice prompt, live
// waypoints, or grading plan evolves.

import { NextResponse } from "next/server";
import { requireRoleplayWorkspace } from "@/lib/roleplay/apiAuth";
import { buildRoleplayInitObj } from "@/lib/roleplay/buildAssistantOverrides";
import { scenarioStore } from "@/lib/roleplay/scenarioStore";
import { ensureScenarioWaypoints } from "@/lib/roleplay/waypoints";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  try {
    const { workspace, response } = await requireRoleplayWorkspace(request);
    if (!workspace) return response;

    const body = await request.json().catch(() => null) as { scenarioId?: unknown } | null;
    const scenarioId = typeof body?.scenarioId === "string" ? body.scenarioId.trim() : "";
    if (!scenarioId) return json({ success: false, message: "scenarioId is required." }, 400);

    const storedScenario = await scenarioStore.get(workspace.community.propertyTygId, scenarioId);
    if (!storedScenario) return json({ success: false, message: "Scenario not found." }, 404);

    const scenario = {
      ...storedScenario,
      waypoints: ensureScenarioWaypoints(storedScenario),
    };
    const traineeName = workspace.user.fullName ?? workspace.teamMember.name ?? workspace.user.email;
    const { assistantId, assistantOverrides } = buildRoleplayInitObj(scenario, { traineeName });

    return json({
      success: true,
      // Public client keys are intentionally safe to distribute. Returning it
      // here keeps native and web configured from the same source of truth.
      vapiPublicKey:
        process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY ?? "b8125470-e12b-443d-9300-c7e0fd79eeab",
      assistantId,
      assistantOverrides,
      scenario,
      traineeName,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not prepare this practice session.";
    console.error("Roleplay launch failed:", message);
    return json({ success: false, message }, 500);
  }
}
