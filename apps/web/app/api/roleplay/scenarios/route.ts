// Roleplay scenario CRUD over the property-scoped Supabase store. All methods
// require a real workspace; scenarios belong to the CURRENT property.
// GET    /api/roleplay/scenarios          -> { success, scenarios }
// POST   /api/roleplay/scenarios          -> { success, scenario }   (body = RoleplayScenario; id/timestamps server-managed)
// DELETE /api/roleplay/scenarios?id=<id>  -> { success }

import { NextResponse } from "next/server";
import { requireRoleplayWorkspace } from "@/lib/roleplay/apiAuth";
import { scenarioStore } from "@/lib/roleplay/scenarioStore";
import { ensureScenarioWaypoints } from "@/lib/roleplay/waypoints";
import { SEED_SCENARIOS } from "@/lib/roleplay/seedScenarios";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

const json = (body: any, status = 200) =>
  new NextResponse(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const RUBRIC_KEYS = ["c1", "c2", "c3", "c4", "c5"];

const sanitizePassThreshold = (value: any) => {
  if (value === null || value === undefined || value === "") return 70;
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(100, Math.max(0, Math.round(number))) : 70;
};

const sanitizeRubric = (value: any) =>
  (Array.isArray(value) ? value : [])
    .filter((category) => category && typeof category.label === "string" && category.label.trim())
    .slice(0, RUBRIC_KEYS.length)
    .map((category, index) => ({
      key: RUBRIC_KEYS[index],
      label: category.label.trim(),
      description:
        typeof category.description === "string" ? category.description.trim() : "",
    }));

const sanitizeCheckpoints = (value: any, rubricKeys: Set<string>) => {
  const seenIds = new Set<string>();
  return (Array.isArray(value) ? value : [])
    .filter((checkpoint) => checkpoint && typeof checkpoint.name === "string" && checkpoint.name.trim())
    .map((checkpoint, index) => {
      const baseId =
        typeof checkpoint.id === "string" && checkpoint.id.trim()
          ? checkpoint.id.trim()
          : `checkpoint-${index + 1}`;
      let id = baseId;
      let suffix = 2;
      while (seenIds.has(id)) id = `${baseId}-${suffix++}`;
      seenIds.add(id);

      const rubricKey =
        typeof checkpoint.rubricKey === "string" && rubricKeys.has(checkpoint.rubricKey)
          ? checkpoint.rubricKey
          : undefined;
      return {
        id,
        name: checkpoint.name.trim(),
        description:
          typeof checkpoint.description === "string" ? checkpoint.description.trim() : "",
        required: checkpoint.required !== false,
        ...(rubricKey ? { rubricKey } : {}),
      };
    });
};

const sanitizeWaypoints = (value: any) => {
  const seenIds = new Set<string>();
  return (Array.isArray(value) ? value : [])
    .filter((waypoint) => waypoint && typeof waypoint.title === "string" && waypoint.title.trim())
    .slice(0, 4)
    .map((waypoint, index) => {
      const baseId = String(waypoint.id || waypoint.title || `waypoint-${index + 1}`)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || `waypoint-${index + 1}`;
      let id = baseId;
      let suffix = 2;
      while (seenIds.has(id)) id = `${baseId}-${suffix++}`;
      seenIds.add(id);
      const rawLines = Array.isArray(waypoint.suggestedLines)
        ? waypoint.suggestedLines
        : typeof waypoint.suggestedLines === "string"
          ? waypoint.suggestedLines.split("\n")
          : [];
      return {
        id,
        type: ["objection", "guidance", "value"].includes(waypoint.type)
          ? waypoint.type
          : "guidance",
        title: waypoint.title.trim(),
        cue: typeof waypoint.cue === "string" ? waypoint.cue.trim() : "",
        completionCriteria:
          typeof waypoint.completionCriteria === "string"
            ? waypoint.completionCriteria.trim()
            : "",
        suggestedLines: rawLines
          .map((line: unknown) => String(line ?? "").trim())
          .filter(Boolean)
          .slice(0, 3),
      };
    });
};

export async function GET(request: Request) {
  try {
    const { workspace, response } = await requireRoleplayWorkspace(request);
    if (!workspace) return response;
    const storedScenarios = await scenarioStore.list(workspace.community.propertyTygId);
    const scenarios = storedScenarios.map((scenario) => {
      const preset = SEED_SCENARIOS.find(
        (seed) => seed.id === scenario.id || seed.name === scenario.name
      );
      const source =
        Array.isArray(scenario.waypoints) && scenario.waypoints.length >= 2
          ? scenario
          : { ...scenario, waypoints: preset?.waypoints };
      return { ...scenario, waypoints: ensureScenarioWaypoints(source) };
    });
    return json({ success: true, scenarios });
  } catch (error: any) {
    console.error("Error listing scenarios:", error.message);
    return json({ success: false, message: error.message }, 500);
  }
}

export async function POST(request: Request) {
  try {
    const { workspace, response } = await requireRoleplayWorkspace(request);
    if (!workspace) return response;
    const body = await request.json();

    if (!body?.name || !body?.personaPrompt || !body?.firstMessage) {
      return json(
        { success: false, message: "name, personaPrompt and firstMessage are required" },
        400
      );
    }

    // Voice must be usable at call time — fall back to the base assistant's
    // own voice (Vapi-native Elliot) rather than persisting a scenario that
    // crashes call start.
    const voice =
      body?.voice && typeof body.voice.voiceId === "string" && body.voice.voiceId.length > 0
        ? {
            provider: body.voice.provider === "11labs" ? "11labs" : "vapi",
            voiceId: body.voice.voiceId,
            label: body.voice.label || "Custom",
          }
        : { provider: "vapi", voiceId: "Elliot", label: "Elliot" };

    // Only accept known template-override keys, non-empty strings.
    const TPL_KEYS = ["identityFraming", "voiceRealism", "style", "errorHandling"];
    const templateOverrides: Record<string, string> = {};
    if (body.templateOverrides && typeof body.templateOverrides === "object") {
      for (const k of TPL_KEYS) {
        const v = body.templateOverrides[k];
        if (typeof v === "string" && v.trim()) templateOverrides[k] = v;
      }
    }

    const rubric = sanitizeRubric(body.rubric);
    const checkpoints = sanitizeCheckpoints(
      body.checkpoints,
      new Set(rubric.map((category) => String(category.key)))
    );
    const submittedWaypoints = sanitizeWaypoints(body.waypoints);
    if (Array.isArray(body.waypoints) && body.waypoints.length > 0 && submittedWaypoints.length < 2) {
      return json(
        { success: false, message: "Add between 2 and 4 valid waypoints." },
        400
      );
    }
    const now = new Date().toISOString();
    const scenarioBase = {
      ...body,
      id: body.id || crypto.randomUUID(),
      voice,
      difficulty: ["easy", "medium", "hard"].includes(body.difficulty) ? body.difficulty : "medium",
      speaksFirst: ["prospect", "agent"].includes(body.speaksFirst) ? body.speaksFirst : "prospect",
      spokenGrading: !!body.spokenGrading,
      passThreshold: sanitizePassThreshold(body.passThreshold),
      templateOverrides,
      checkpoints,
      rubric,
      createdAt: body.createdAt || now,
      updatedAt: now,
    };
    const scenario = {
      ...scenarioBase,
      waypoints:
        submittedWaypoints.length >= 2
          ? submittedWaypoints
          : ensureScenarioWaypoints(scenarioBase),
    };

    const saved = await scenarioStore.upsert(workspace.community.propertyTygId, scenario);
    return json({ success: true, scenario: saved });
  } catch (error: any) {
    console.error("Error saving scenario:", error.message);
    return json({ success: false, message: error.message }, 500);
  }
}

export async function DELETE(request: Request) {
  try {
    const { workspace, response } = await requireRoleplayWorkspace(request);
    if (!workspace) return response;
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return json({ success: false, message: "id query param required" }, 400);

    const removed = await scenarioStore.remove(workspace.community.propertyTygId, id);
    if (!removed) return json({ success: false, message: "scenario not found" }, 404);
    return json({ success: true });
  } catch (error: any) {
    console.error("Error deleting scenario:", error.message);
    return json({ success: false, message: error.message }, 500);
  }
}
