// @ts-nocheck — ported from usevoice.ai-TYG (looser tsconfig); index-access
// strictness (noUncheckedIndexedAccess) not yet retrofitted.
// LLM waypoint generation: the prompt and output validation for
// POST /api/roleplay/generate-waypoints.
//
// This is the canonical "special prompt" for creating/recreating a scenario's
// live-coaching waypoints. It is deliberately explicit about the runtime
// contract (private carousel + the in-call AI silently judging completion from
// the trainee's words alone), because the quality of completionCriteria is
// what makes auto-check-off work: vague or unobservable criteria are the main
// reason waypoints never get checked during a call.
//
// Keep this file dependency-free (pure prompt/parse logic) so the editor,
// scripts, and the API route can all share it.

import { Checkpoint, RoleplayWaypoint, RubricCategory } from "./types";

// Quality matters more than latency here (rare, user-triggered call). Same
// model the live prospect runs on since the 2026-08-02 upgrade.
export const WAYPOINT_GENERATION_MODEL = "gemini-3.5-flash";

export type WaypointGenerationContext = {
  name: string;
  description?: string;
  personaPrompt: string;
  firstMessage?: string;
  difficulty?: string;
  speaksFirst?: string;
  checkpoints?: Checkpoint[];
  rubric?: RubricCategory[];
};

const clean = (value: unknown) => String(value ?? "").replace(/\s+/g, " ").trim();

// Validation-side cleaner: model output fields must BE strings — an object or
// array must not survive as the literal text "[object Object]".
const cleanString = (value: unknown): string =>
  typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";

export function buildWaypointGenerationPrompt(context: WaypointGenerationContext): string {
  const checkpointLines = (context.checkpoints ?? [])
    .filter((cp) => clean(cp?.name))
    .map((cp) => `  - ${clean(cp.name)}: ${clean(cp.description)}`)
    .join("\n");
  const rubricLines = (context.rubric ?? [])
    .filter((c) => clean(c?.label))
    .map((c) => `  - ${clean(c.label)}: ${clean(c.description)}`)
    .join("\n");
  const opens =
    (context.speaksFirst ?? "prospect") === "agent"
      ? "Inbound-style: the trainee answers the phone with their greeting, then the AI prospect opens."
      : "Outbound-style: the AI prospect speaks first with its opening line.";

  return `You are an expert frontline-sales coach designing LIVE COACHING WAYPOINTS for a voice-AI roleplay trainer (apartment-leasing and similar frontline teams).

How waypoints are used at runtime — design for this contract exactly:
- A human trainee (the "agent") has a live phone-style conversation with an AI playing the prospect described below.
- During the call the trainee sees a private coaching carousel. Each waypoint is one card: a key conversational moment, when it matters, and 2-3 lines they could try saying.
- The SAME AI that plays the prospect silently judges, turn by turn, whether the trainee's own words have met each waypoint's completionCriteria, and checks the card off live. It can only judge from the words in the transcript.
- Waypoints are coaching guidance only; they never change the trainee's score.

Produce 3-4 waypoints for the scenario below.

Field requirements:
- "type": one of "objection" | "guidance" | "value". Include at least one "objection" and one "value" moment when the scenario material supports them.
  - objection: the trainee must handle a concern, anxiety, or pushback the prospect raises.
  - guidance: the trainee must steer the call — discover needs, ask questions, clarify facts, or set next steps.
  - value: the trainee must connect an option or benefit to a need the prospect has stated.
- "title": at most 7 words, imperative, specific to THIS scenario (like "Lower the pet-policy anxiety" — never generic filler like "Handle the objection").
- "cue": one sentence describing the LIVE SIGNAL — what the prospect says or does that makes this the right moment. Written so the trainee recognizes the moment while it is happening.
- "completionCriteria": one sentence starting with "The trainee" describing a SINGLE objectively observable behavior, judgeable from the trainee's words alone by a model listening to the call. No compound and-chains — never fuse two behaviors with "and" or "while"; pick the single most important behavior (alternatives joined by "or" are fine). No internal states ("understands", "builds trust"), no vague qualifiers ("appropriately", "effectively"). This field is what the in-call judge executes — make it concrete and checkable.
- "suggestedLines": 2-3 lines the trainee could literally say. Natural spoken English, first person, each under 25 words. NEVER invent specific prices, availability, unit types, policies, amenities, or other facts not stated in the scenario — when a fact is unknown, use verifying or clarifying wording ("Let me confirm...", "Can I ask...").

Ordering and fit:
- Arrange waypoints in the natural arc of this call: early empathy/discovery moments first, value and next-step moments later.
- Waypoints are in-the-moment coaching, not grading. Align with the grading checkpoints and rubric below, but do not restate them verbatim — phrase everything for the trainee's eyes mid-call.

Scenario:
- Name: ${clean(context.name)}
- Description: ${clean(context.description) || "(none)"}
- Difficulty: ${clean(context.difficulty) || "medium"}
- Call opening: ${opens}
- Prospect persona (the AI prospect's own instructions):
"""
${String(context.personaPrompt ?? "").trim()}
"""
- Prospect's opening line: ${clean(context.firstMessage) || "(none)"}
- Post-call grading checkpoints (hidden from the trainee):
${checkpointLines || "  (none defined)"}
- Post-call rubric categories:
${rubricLines || "  (none defined)"}

Return ONLY a JSON array of 3-4 waypoint objects with exactly the keys: type, title, cue, completionCriteria, suggestedLines.`;
}

const TYPES = new Set(["objection", "guidance", "value"]);
const MAX = { title: 90, cue: 400, completionCriteria: 400, line: 160 };

const slugify = (value: string, fallback: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || fallback;

// Candidate JSON substrings, most-likely first: the raw text, every fenced
// block (ANY language tag — models mislabel JSON fences), then the outermost
// [...] span. Trying candidates beats one brittle regex: a mislabeled fence
// must not burn one of the route's two attempts.
const jsonCandidates = (raw: string): string[] => {
  const candidates = [raw];
  const fenceRe = /```[ \t]*[A-Za-z0-9_-]*[ \t]*\r?\n?([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  while ((match = fenceRe.exec(raw))) {
    const inner = match[1].trim();
    if (inner) candidates.push(inner);
  }
  const first = raw.indexOf("[");
  const last = raw.lastIndexOf("]");
  if (first >= 0 && last > first) candidates.push(raw.slice(first, last + 1));
  return candidates;
};

// Parses and validates the model's output into RoleplayWaypoint[]. Throws with
// a specific reason on anything unusable so the route can retry once.
export function parseGeneratedWaypoints(text: string): RoleplayWaypoint[] {
  const raw = String(text ?? "").trim();

  let list: any[] | null = null;
  for (const candidate of jsonCandidates(raw)) {
    try {
      const parsed = JSON.parse(candidate);
      const asList = Array.isArray(parsed)
        ? parsed
        : Array.isArray((parsed as any)?.waypoints)
          ? (parsed as any).waypoints
          : null;
      if (asList) {
        list = asList;
        break;
      }
    } catch {
      // Try the next candidate.
    }
  }
  if (!list) throw new Error("model output was not a JSON array of waypoints");

  const seenIds = new Set<string>();
  const waypoints: RoleplayWaypoint[] = [];
  for (let index = 0; index < list.length; index++) {
    const entry = list[index];
    const title = cleanString((entry as any)?.title);
    const cue = cleanString((entry as any)?.cue);
    const completionCriteria = cleanString((entry as any)?.completionCriteria);
    const rawLines = (entry as any)?.suggestedLines;
    const suggestedLines = (Array.isArray(rawLines)
      ? rawLines
      : typeof rawLines === "string"
        ? rawLines.split("\n")
        : []
    )
      .map((line: unknown) => cleanString(line))
      .filter((line: string) => line && line.length <= MAX.line)
      .slice(0, 3);

    // Drop (not truncate) malformed entries — a mid-sentence cut in coaching
    // copy is worse than one fewer waypoint.
    if (
      !title ||
      title.length > MAX.title ||
      !cue ||
      cue.length > MAX.cue ||
      !completionCriteria ||
      completionCriteria.length > MAX.completionCriteria ||
      suggestedLines.length === 0
    ) {
      continue;
    }

    const baseId = slugify(title, `waypoint-${index + 1}`);
    let id = baseId;
    let suffix = 2;
    while (seenIds.has(id)) id = `${baseId}-${suffix++}`;
    seenIds.add(id);

    const type = cleanString((entry as any)?.type).toLowerCase();
    waypoints.push({
      id,
      type: (TYPES.has(type) ? type : "guidance") as RoleplayWaypoint["type"],
      title,
      cue,
      completionCriteria,
      suggestedLines,
    });
    if (waypoints.length === 4) break;
  }

  if (waypoints.length < 2) {
    throw new Error(
      `model produced ${waypoints.length} usable waypoint(s); need at least 2`
    );
  }
  return waypoints;
}
