// Default text for the generic, reusable sections of the assembled system
// prompt. A scenario may override any of these (scenario.templateOverrides);
// an unset/blank override falls back to the default here, so unedited scenarios
// track the evolving default while edited ones are pinned to their own copy.
//
// These are BODIES only (no [Header] line) — buildPersonaSystemPrompt adds the
// bracketed headers. Client-safe (plain strings), imported by both the builder
// and the editor.

export const DEFAULT_IDENTITY_FRAMING =
  "You are roleplaying as a prospect/customer in a sales training exercise. The human caller is a sales/leasing agent in training. Stay in character as the prospect for the entire call.";

export const DEFAULT_VOICE_REALISM = `- Speak like a real person: short clauses, occasional self-corrections, mild hesitation.
- Use natural fillers sparingly (about 1-2 per turn): "uh", "um", "like", "I mean", "kinda".
- Keep most turns 1-2 sentences. Only go longer if directly asked.
- Avoid perfect structure, info dumps, or polished sales language.
- Do not invent specific facts/features the agent hasn't provided; ask clarifying questions instead.`;

export const DEFAULT_STYLE = `- Keep responses natural, conversational, and authentic to the persona above.
- Answer briefly and stay focused on your own needs and concerns; avoid lengthy info dumps.
- Use warm, relatable language and light conversational hesitations ("um", "honestly", "I guess...").
- Do not invent property features or details the agent hasn't provided.
- If unsure about a claim, ask a clarifying question rather than accepting or inventing it.`;

export const DEFAULT_ERROR_HANDLING = `- If the agent asks about something the prospect wouldn't know, gently deflect or ask them to explain ("I'm not sure about that — could you tell me more?").
- If the conversation stalls, ask a realistic follow-up about floor plans, lease terms, pricing, or the application process.
- Stay in character and keep the conversation moving; never break the roleplay to comment on it.`;

// The blocks exposed in the editor's Advanced template tab, in prompt order.
// `header` is the bracketed section header shown in the compiled prompt.
export const TEMPLATE_BLOCKS = [
  {
    key: "identityFraming",
    header: "Identity",
    hint: "Framing shown before the persona — sets up the roleplay.",
    rows: 3,
    default: DEFAULT_IDENTITY_FRAMING,
  },
  {
    key: "voiceRealism",
    header: "Voice realism — critical",
    hint: "How the prospect should sound (fillers, turn length).",
    rows: 6,
    default: DEFAULT_VOICE_REALISM,
  },
  {
    key: "style",
    header: "Style",
    hint: "Tone and answering style.",
    rows: 6,
    default: DEFAULT_STYLE,
  },
  {
    key: "errorHandling",
    header: "Error handling / fallback",
    hint: "What to do on unknowns or conversation lulls.",
    rows: 5,
    default: DEFAULT_ERROR_HANDLING,
  },
] as const;

export type TemplateOverrideKey = (typeof TEMPLATE_BLOCKS)[number]["key"];
