import {
  RoleplayScenario,
  RoleplayWaypoint,
  WaypointMomentType,
} from "./types";

export const WAYPOINT_COMPLETE_FUNCTION_NAME = "WaypointComplete";

const normalize = (value: unknown) =>
  String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const slugify = (value: unknown, fallback: string) =>
  normalize(value).replace(/\s+/g, "-").replace(/^-+|-+$/g, "") || fallback;

const classifyMoment = (value: string): WaypointMomentType => {
  const text = normalize(value);
  if (/value|benefit|feature|amenit|solution|study space|study lounge/.test(text)) return "value";
  if (/objection|concern|worr|anxious|hesitant|frustrat|restriction|deposit|fee|fairness|compatib|policy/.test(text)) {
    return "objection";
  }
  return "guidance";
};

const topicFrom = (scenario: RoleplayScenario) => {
  const text = normalize(`${scenario.name} ${scenario.description}`);
  if (/python|exotic pet|pet policy|pet friendly/.test(text)) return "pet";
  if (/roommate|noise|quiet|privacy|study/.test(text)) return "roommate";
  if (/price|budget|rent|afford|cost/.test(text)) return "budget";
  return "general";
};

const fallbackCopy = (
  type: WaypointMomentType,
  topic: ReturnType<typeof topicFrom>,
  title: string
) => {
  const normalizedTitle = normalize(title);
  if (/discover|question|clarify.*detail/.test(normalizedTitle)) {
    return topic === "pet"
      ? ["Can I ask what species you have, its approximate size, and which policy details matter most to you?"]
      : ["What has been the hardest part of your current setup, and what would you want to be different next time?"];
  }
  if (/roommate.*(?:fair|fit|match)|fairness/.test(normalizedTitle)) {
    return [
      "We can look at how roommate matching works and confirm whether a single-room option or agreement would give you more control.",
    ];
  }
  if (topic === "pet" && /policy|restriction|deposit|fee/.test(normalizedTitle)) {
    return [
      "Let me confirm the current policy, including any species limits, deposits, and restrictions, so I don't give you the wrong information.",
    ];
  }
  if (/urgency|decid|availability/.test(normalizedTitle)) {
    return [
      "Just so you can plan, I can confirm current availability and which options tend to move first—there's no pressure.",
    ];
  }
  if (/next step|tour|application|follow/.test(normalizedTitle)) {
    return [
      "Would you prefer to schedule a tour, start an application, or have me follow up after you've had time to think?",
    ];
  }
  if (type === "value" && topic === "roommate") {
    return [
      "Let me confirm which quieter study options are available and walk you through the ones that best fit how you study.",
    ];
  }
  if (type === "value") {
    return [
      "Based on what you've shared, let me confirm the options that best support what matters most to you.",
    ];
  }
  if (type === "objection" && topic === "pet") {
    return [
      "I understand why you want a clear answer. Let me confirm the current policy and any limits before I promise anything.",
    ];
  }
  if (type === "objection" && topic === "roommate") {
    return [
      "That sounds frustrating—having somewhere calm to focus and some privacy clearly matters to you.",
    ];
  }
  if (type === "objection") {
    return [
      "That's a fair concern. Let me make sure I understand it, then I'll walk you through the most accurate options.",
    ];
  }
  return [
    "What matters most to you here, and what would be most helpful for me to clarify next?",
  ];
};

const sanitizeWaypoint = (
  waypoint: Partial<RoleplayWaypoint>,
  index: number,
  scenario: RoleplayScenario
): RoleplayWaypoint | null => {
  const title = String(waypoint?.title ?? "").trim();
  if (!title) return null;
  const type: WaypointMomentType = ["objection", "guidance", "value"].includes(
    String(waypoint?.type)
  )
    ? (waypoint.type as WaypointMomentType)
    : classifyMoment(`${title} ${waypoint?.cue ?? ""} ${waypoint?.completionCriteria ?? ""}`);
  const suggestedLines = (Array.isArray(waypoint?.suggestedLines)
    ? waypoint.suggestedLines
    : []
  )
    .map((line) => String(line ?? "").trim())
    .filter(Boolean)
    .slice(0, 3);

  return {
    id: slugify(waypoint?.id || title, `waypoint-${index + 1}`),
    type,
    title,
    cue: String(waypoint?.cue ?? "").trim() || `Use this moment when ${title.toLowerCase()} becomes relevant.`,
    completionCriteria:
      String(waypoint?.completionCriteria ?? "").trim() ||
      `The trainee clearly and credibly addresses ${title.toLowerCase()} in their own words.`,
    suggestedLines: suggestedLines.length
      ? suggestedLines
      : fallbackCopy(type, topicFrom(scenario), title),
  };
};

const deriveWaypoints = (scenario: RoleplayScenario): RoleplayWaypoint[] => {
  const source = [
    ...(scenario.checkpoints ?? []).map((checkpoint) => ({
      id: checkpoint.id,
      title: checkpoint.name,
      source: `${checkpoint.name} ${checkpoint.description}`,
      cue: checkpoint.description,
      completionCriteria: checkpoint.description,
    })),
    ...(scenario.rubric ?? []).map((category) => ({
      id: `rubric-${category.key}`,
      title: category.label,
      source: `${category.label} ${category.description}`,
      cue: category.description,
      completionCriteria: category.description,
    })),
  ];

  // Prefer the kinds of moments that benefit from live coaching: objections,
  // customer guidance, and value creation. Deduplicate similarly named inputs.
  const ranked = source
    .map((item, index) => ({
      ...item,
      index,
      type: classifyMoment(item.source),
      priority: classifyMoment(item.source) === "objection" ? 0 : classifyMoment(item.source) === "value" ? 1 : 2,
    }))
    .sort((a, b) => a.priority - b.priority || a.index - b.index);
  const seen = new Set<string>();
  const unique = ranked.filter((item) => {
    const key = normalize(item.title).replace(/\b(?:questions?|acknowledg(?:e|ement)?)\b/g, "").trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const selected: typeof unique = [];
  for (const type of ["objection", "guidance", "value"] as WaypointMomentType[]) {
    const match = unique.find((item) => item.type === type && !selected.includes(item));
    if (match) selected.push(match);
  }
  for (const item of unique) {
    if (selected.length >= 4) break;
    if (!selected.includes(item)) selected.push(item);
  }

  return selected.slice(0, 4).map((item, index) =>
    sanitizeWaypoint(
      {
        id: item.id,
        type: item.type,
        title: item.title,
        cue: item.cue,
        completionCriteria: item.completionCriteria,
      },
      index,
      scenario
    )
  ).filter((waypoint): waypoint is RoleplayWaypoint => !!waypoint);
};

export const ensureScenarioWaypoints = (scenario: RoleplayScenario): RoleplayWaypoint[] => {
  const authored = (Array.isArray(scenario?.waypoints) ? scenario.waypoints : [])
    .slice(0, 4)
    .map((waypoint, index) => sanitizeWaypoint(waypoint, index, scenario))
    .filter((waypoint): waypoint is RoleplayWaypoint => !!waypoint);
  if (authored.length >= 2) return authored;

  const derived = deriveWaypoints(scenario);
  if (derived.length >= 2) return derived;

  const topic = topicFrom(scenario);
  return [
    sanitizeWaypoint(
      {
        id: "understand-the-concern",
        type: "objection",
        title: "Understand the concern",
        cue: "Use this when the prospect shares a worry, hesitation, or unresolved need.",
        completionCriteria: "The trainee acknowledges the concern and asks a relevant follow-up question.",
        suggestedLines: fallbackCopy("objection", topic, "Understand the concern"),
      },
      0,
      scenario
    ),
    sanitizeWaypoint(
      {
        id: "create-relevant-value",
        type: "value",
        title: "Create relevant value",
        cue: "Use this after the prospect's priority is clear.",
        completionCriteria: "The trainee connects a verified option or next action to the prospect's stated priority.",
        suggestedLines: fallbackCopy("value", topic, "Create relevant value"),
      },
      1,
      scenario
    ),
  ].filter((waypoint): waypoint is RoleplayWaypoint => !!waypoint);
};

// Client-side Vapi function tool. With no server URL and async:true, Vapi emits
// a tool-calls message to the Web SDK and does not pause the prospect for a
// response. RoleplaySession handles the message and updates the carousel.
export const WaypointComplete = (waypoints: RoleplayWaypoint[]) => ({
  type: "function",
  async: true,
  function: {
    name: WAYPOINT_COMPLETE_FUNCTION_NAME,
    description:
      "Silently mark one live coaching waypoint complete. Call this the moment the HUMAN trainee (the agent) meets the spirit of a waypoint's completion criteria — in the same turn as your normal spoken reply; a genuine attempt counts even if imperfectly worded. Never call it based on the AI prospect's own words, call it at most once per waypoint, and never mention the tool or waypoints to the trainee. If one trainee turn satisfies several waypoints, call it once per satisfied waypoint.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["waypointId"],
      properties: {
        waypointId: {
          type: "string",
          enum: waypoints.map((waypoint) => waypoint.id),
          description: "The exact ID of the newly completed waypoint.",
        },
      },
    },
  },
});

const parseArguments = (value: unknown): Record<string, unknown> => {
  if (value && typeof value === "object") return value as Record<string, unknown>;
  if (typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

// Supports both current Web SDK toolCallList entries and older/alternate Vapi
// shapes so a minor SDK message-shape change cannot break visible progress.
export const waypointIdsFromVapiMessage = (message: any): string[] => {
  const calls = [
    ...(Array.isArray(message?.toolCallList) ? message.toolCallList : []),
    ...(Array.isArray(message?.toolCalls) ? message.toolCalls : []),
    ...(Array.isArray(message?.toolWithToolCallList)
      ? message.toolWithToolCallList.map((entry: any) => ({
          ...(entry?.toolCall ?? entry),
          name: entry?.toolCall?.name ?? entry?.name,
        }))
      : []),
    ...(message?.type === "function-call" ? [message?.functionCall ?? message] : []),
  ];

  return calls.flatMap((call: any) => {
    const name =
      call?.function?.name ??
      call?.name ??
      call?.toolCall?.function?.name ??
      call?.toolCall?.name;
    if (name !== WAYPOINT_COMPLETE_FUNCTION_NAME) return [];
    const args = parseArguments(
      call?.function?.arguments ??
        call?.arguments ??
        call?.parameters ??
        call?.toolCall?.function?.arguments ??
        call?.toolCall?.arguments ??
        call?.toolCall?.parameters
    );
    return typeof args.waypointId === "string" ? [args.waypointId] : [];
  });
};
