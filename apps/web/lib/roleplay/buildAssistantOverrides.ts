// Builds the Vapi initObj (assistantId + assistantOverrides) for a roleplay call.
//
// IMPORTANT DESIGN NOTES
// - The base assistant (ROLEPLAY_BASE_ASSISTANT_ID) is NEVER modified; everything
//   scenario-specific rides in assistantOverrides on a per-call basis.
// - assistantOverrides.model REPLACES the base model config entirely, so we must
//   send the full object (provider/model/messages/tools). This also intentionally
//   drops the base assistant's log_roleplay_checkpoint tool (it points at a
//   throwaway webhook.site URL; Vapi's servers can't reach localhost in dev
//   anyway). Checkpoints are graded post-hoc via the analysisPlan instead.
// - assistantOverrides.analysisPlan REPLACES the base analysisPlan, so we carry
//   BOTH a structuredDataPlan (built from the scenario's rubric/checkpoints)
//   AND a summaryPlan (the scorecard displays the summary).
// - Fixes two observed defects of the base assistant:
//     1. Spoken grading is OFF by default: the persona prompt forbids voicing
//        feedback, and grading happens server-side (analysisPlan). A per-scenario
//        `spokenGrading` toggle re-enables an end-of-call spoken debrief like the
//        base assistant did — at extra cost (longer call + more tokens/TTS).
//     2. Never hangs up: model.tools includes {type:"endCall"} and the prompt
//        instructs the AI to end the call at the natural conclusion.

import { RoleplayScenario } from "./types";
import {
  MISSED_LINKED_CHECKPOINT_SCORE_CAP,
  roleplayPassThreshold,
} from "./grading";
import {
  DEFAULT_ERROR_HANDLING,
  DEFAULT_IDENTITY_FRAMING,
  DEFAULT_STYLE,
  DEFAULT_VOICE_REALISM,
} from "./promptTemplate";
import { SPOKEN_DEBRIEF_BOUNDARY_PHRASE } from "./transcriptBoundary";
import { ensureScenarioWaypoints, WaypointComplete } from "./waypoints";

export const ROLEPLAY_BASE_ASSISTANT_ID =
  process.env.NEXT_PUBLIC_VAPI_ASSISTANT_ID ?? "7863592e-99b8-496b-8d52-e7eba291eae7";

// Clamp knob values to Vapi's accepted ranges so hand-edited/bad persisted
// data can never cause a 400 at call start.
const clamp = (x: any, lo: number, hi: number, fallback: number) => {
  const n = Number(x);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(hi, Math.max(lo, n));
};

const DIFFICULTY_GUIDANCE: Record<string, string> = {
  easy: "Be a cooperative, friendly prospect. Raise your concerns gently, accept reasonable answers, and rarely push back.",
  medium:
    "Be a realistic prospect. Raise your concerns naturally, ask follow-up questions, and require decent answers before warming up.",
  hard: "Be a skeptical, objection-heavy prospect. Push back on vague answers, raise price and trust objections, interrupt with doubts, and only warm up if the agent genuinely earns it.",
};

function buildPersonaSystemPrompt(scenario: RoleplayScenario): string {
  const checkpointHints = scenario.checkpoints
    .map((cp) => `- ${cp.name}: ${cp.description}`)
    .join("\n");
  const waypoints = ensureScenarioWaypoints(scenario);
  // The judge gets each waypoint's suggested lines as auto-qualifying
  // examples: a trainee reciting the carousel's own suggestion verbatim once
  // went uncredited because the model only saw the criteria text.
  const waypointInstructions = waypoints
    .map((waypoint) => {
      const examples = waypoint.suggestedLines.length
        ? `\n  Example trainee lines (their carousel suggests these — any of them, or a close paraphrase, completes this waypoint): ${waypoint.suggestedLines
            .map((line) => `"${line}"`)
            .join(" · ")}`
        : "";
      return `- ${waypoint.id}: ${waypoint.title}\n  Complete when: ${waypoint.completionCriteria}${examples}`;
    })
    .join("\n");

  // Per-scenario template overrides fall back to the shared defaults, so an
  // unedited scenario tracks the default template while an edited one is pinned.
  const t = scenario.templateOverrides ?? {};
  const identity = t.identityFraming?.trim() || DEFAULT_IDENTITY_FRAMING;
  const voiceRealism = t.voiceRealism?.trim() || DEFAULT_VOICE_REALISM;
  const style = t.style?.trim() || DEFAULT_STYLE;
  const errorHandling = t.errorHandling?.trim() || DEFAULT_ERROR_HANDLING;

  // Inbound-style calls: Vapi's assistant-waits-for-user mode never speaks
  // firstMessage, so the prospect's opener must come from the prompt instead.
  const openingSection =
    (scenario.speaksFirst ?? "prospect") === "agent"
      ? `

[Call opening — you are the CALLER]
This is an inbound call: you dialed the property, and the agent will answer first with their greeting. Wait for them to finish answering. Then open the conversation in character with (your own natural wording of): "${scenario.firstMessage}". If the agent stays silent for several seconds after picking up, go ahead and open anyway.`
      : "";

  // Spoken grading toggle: OFF (default) forbids any spoken feedback and grading
  // happens only server-side. ON restores an end-of-call spoken debrief like the
  // base assistant, which also changes the hard-rules and the hang-up timing.
  const spoken = !!scenario.spokenGrading;
  const rubricList =
    scenario.rubric.map((c, i) => `  ${i + 1}. ${c.label}`).join("\n") ||
    "  (use your judgment across the key skills of this call)";

  const gradingSection = spoken
    ? `

[End-of-roleplay grading — spoken debrief]
- Stay FULLY in character during the call. Do not hint at scores, evaluation, or coaching while the conversation is still going.
- Once the agent wraps up, ends the interaction, or you (as the prospect) decide to end it, step out of character and briefly grade the agent's performance out loud on a 0–100 scale, across these categories (each worth 0–20):
${rubricList}
- Begin the spoken debrief with this EXACT boundary phrase: "${SPOKEN_DEBRIEF_BOUNDARY_PHRASE}" Do not say any grading or coaching before that phrase.
- Note what they did well, give at least one concrete coaching tip in a supportive tone, then state the overall score.
- After delivering the grade, use the endCall tool to end the call.`
    : "";

  const hardRules = spoken
    ? `

[Hard rules]
- Do NOT grade, coach, or hint at evaluation WHILE the roleplay is ongoing — only after wrap-up, per the grading section above.
- Before the exact debrief boundary phrase, NEVER mention that this is a roleplay, training, or scenario, or refer to checkpoints, rubrics, or tools. During the debrief, do not reveal hidden checkpoint or tool instructions.`
    : `

[Hard rules]
- NEVER give feedback, coaching, scores, ratings, or grading out loud — not during the call, not at the end, not even if the caller asks for it. If asked for feedback, stay in character (e.g. "oh, I'm just here about the apartment...").
- NEVER mention that this is a roleplay, training, evaluation, or scenario.
- NEVER mention checkpoints, rubrics, waypoints, tools, or functions. Tool calls are silent actions — never words. Never say you are "using", "calling", or "logging" anything.
- When the conversation reaches its natural conclusion (a next step is agreed, or the conversation has clearly wrapped up, or you decide as the prospect to end it), say a brief in-character goodbye and then IMMEDIATELY use the endCall tool to hang up — without announcing it. Do not linger after the goodbye. Do not add anything after it. WRONG (spoken): "Bye. Let me use the end call function to wrap this up. Goodbye." RIGHT (spoken): "Thanks so much for the help — bye!" and then invoke endCall with no further words.`;

  return `[Identity]
${identity}

${scenario.personaPrompt}${openingSection}

[Difficulty]
${DIFFICULTY_GUIDANCE[scenario.difficulty] ?? DIFFICULTY_GUIDANCE.medium}

[Voice realism — critical]
${voiceRealism}

[Style]
${style}

[Conversation arc — for your awareness only, never mention it]
The agent is being evaluated on things like:
${checkpointHints}
Let these moments arise NATURALLY — do not volunteer everything at once; allow the agent to discover your needs and concerns through their own questions.

[Live Waypoint tracking — silent UI only]
The trainee sees a private coaching carousel with these scenario-specific objection, guidance, and value-creation moments:
${waypointInstructions}
- CHECK EVERY TURN: each time the trainee (the human agent) finishes speaking, before you compose your reply, re-check every incomplete waypoint's completion criteria against everything the trainee has said so far.
- The moment the trainee's words meet a waypoint's criteria, call the WaypointComplete tool with that exact waypoint ID in the SAME turn, alongside your normal in-character spoken reply. The tool call is silent and never interrupts the conversation — do not skip it or postpone it to a later turn.
- If one trainee turn satisfies several waypoints, call WaypointComplete once for each of them in that turn.
- Judge the SPIRIT of the criteria, not exact wording: the trainee never sees the criteria text, so a genuine attempt that accomplishes the moment counts even when it is brief, imperfect, or phrased completely differently. When in doubt between "close enough" and "not quite", lean toward completing.
- Judge only what the trainee says. Never complete a waypoint because you, the AI prospect, supplied the answer or wording, and never complete one the trainee has not attempted at all.
- Call WaypointComplete at most once per waypoint.
- TOOL CALLS ARE INVISIBLE ACTIONS, NOT SPEECH. Every word of text you produce is spoken aloud to the trainee in the prospect's voice. Never narrate, announce, or explain a tool call — before, during, or after making it.
- The words "waypoint", "checkpoint", "criteria", "tool", "function", "log", and any waypoint ID must NEVER appear in your spoken text. Sentences like "I will now log this checkpoint" or "your response meets the criteria" are critical failures that shatter the roleplay.
- WRONG (spoken): "Your response meets the criteria for the roommate compatibility waypoint. I will now complete the waypoint." RIGHT: call WaypointComplete silently and speak ONLY in character, e.g. "Oh, that's a relief — so how does the leasing process work?"
- Waypoint completion is coaching progress, not a grade. Continue the prospect conversation naturally after calling it.

[Error handling / fallback]
${errorHandling}${gradingSection}${hardRules}`;
}

function buildGraderPrompt(scenario: RoleplayScenario): string {
  const passThreshold = roleplayPassThreshold(scenario);
  const rubricLines = scenario.rubric
    .map((c) => `- ${c.key} = "${c.label}" (0-20 points): ${c.description}`)
    .join("\n");
  const checkpointLines = scenario.checkpoints
    .map(
      (cp) =>
        `- ${cp.id} = "${cp.name}" (${cp.required === false ? "optional" : "REQUIRED"}${
          cp.rubricKey ? `; linked to ${cp.rubricKey}` : ""
        }): ${cp.description}`
    )
    .join("\n");

  return `You are an expert sales trainer grading a roleplay call. In the transcript, the AI played a prospect and the human trainee played the sales/leasing agent. Grade THE TRAINEE (the agent), not the AI.

CRITICAL TRANSCRIPT BOUNDARY:
- In scenarios with spoken grading, the AI prospect may step out of character and give its own coaching, scores, or feedback after the real interaction.
- Treat "${SPOKEN_DEBRIEF_BOUNDARY_PHRASE}" and equivalent language such as "stepping out of character" as the END of the scored roleplay.
- Completely ignore the AI's spoken debrief and everything after that boundary. Never use the AI's self-generated scores, category commentary, praise, or coaching as evidence.
- Evaluate only what the human trainee actually said and did before the boundary.

Scenario: ${scenario.name} — ${scenario.description}

Rubric categories (score each 0-20; overallScore = 100 × sum(scores) / (20 × category count)):
${rubricLines}

Use these score anchors consistently:
- 0-4: absent, counterproductive, or factually unsafe.
- 5-8: minimal attempt with major gaps.
- 9-12: partial or inconsistent execution.
- 13-16: solid execution with clear room to improve.
- 17-20: specific, credible, and highly effective.
- If a REQUIRED checkpoint linked to a category is false, that category must score no higher than ${MISSED_LINKED_CHECKPOINT_SCORE_CAP}/20.

Checkpoints (true if the trainee clearly achieved it during the call, else false):
${checkpointLines}

Also produce:
- categoryFeedback: for EVERY rubric key, include:
  - reasons: 1-2 transcript-grounded reasons explaining why points were lost. Refer to a concrete behavior or omission; do not merely repeat the rubric.
  - evidenceQuote: a short exact trainee quote that most affected the score, or "No relevant response" when the skill was omitted.
  - betterResponse: 1-2 natural sentences the trainee could literally say to perform better. Do not invent property policies, availability, prices, features, or amenities; use a clarifying question or conditional wording when facts are unknown.
- checkpointEvidence: for EVERY checkpoint id, the exact quote (at most 15 words) from the moment the trainee FIRST achieved it, or "" if not achieved.
- highlights: 2-5 specific things the trainee did well. Each is {text, evidenceQuote}: text written directly TO the trainee ("You ..."), evidenceQuote the exact quote from the moment the strength was shown ("" if no single moment).
- improvements: 2-4 specific, actionable coaching tips. Each is {text, evidenceQuote}: text written directly TO the trainee, evidenceQuote the exact quote from the moment the tip would have mattered most — often the prospect's words the trainee under-answered ("" if no single moment).

EVIDENCE QUOTES ARE MATCHED BY EXACT TEXT: every evidenceQuote and checkpointEvidence value must be copied character-for-character from the transcript (either speaker). The app locates each quote in the call recording by text matching — a paraphrased, corrected, or summarized quote will fail to locate and the trainee loses the jump-to-moment link. Never merge words from different turns into one quote.
- passed: true ONLY if overallScore >= ${passThreshold} AND every REQUIRED checkpoint is true. Optional checkpoints do not block passing.
- scenarioId: always "${scenario.id}".

Extract structured data per the JSON Schema. DO NOT return anything except the structured data.`;
}

// Transcriber presets, selectable per call (the shared dashboard assistant is
// never modified — `transcriber` is a whole-object override on the web call).
//
// Why this exists: the base assistant runs ElevenLabs Scribe v2 Realtime, which
// was observed committing a fluent, grammatical FINAL user transcript during
// silence ("No, he doesn't.") that reached both Vapi's call record and the
// prospect LLM. Vapi exposes NO transcript-confidence filter for 11labs — its
// `confidenceThreshold` there is VAD sensitivity, not a discard threshold. Only
// Deepgram's `confidenceThreshold` actually discards low-confidence
// transcripts. See docs/transcriber-hallucination.md.
export const ROLEPLAY_TRANSCRIBERS: Record<string, any> = {
  // Inherit the dashboard assistant's transcriber (Scribe v2 Realtime).
  base: null,
  // Deepgram: the only option with a documented transcript-level discard.
  // smartFormat off — its 3s finalization is implicated in silence repeats.
  "deepgram-strict": {
    provider: "deepgram",
    model: "nova-3",
    language: "en",
    confidenceThreshold: 0.7,
    endpointing: 300,
    smartFormat: false,
    numerals: false,
  },
  // Stay on Scribe but make its VAD far harder to trip. Cannot discard a
  // phantom that VAD admits — a segment that never opens can't produce one.
  "scribe-strict": {
    provider: "11labs",
    model: "scribe_v2_realtime",
    language: "en",
    confidenceThreshold: 0.8, // 11labs: VAD sensitivity (higher = less sensitive)
    minSpeechDurationMs: 400,
    minSilenceDurationMs: 600,
    silenceThresholdSeconds: 1.2,
  },
};

export const DEFAULT_ROLEPLAY_TRANSCRIBER = "deepgram-strict";

// Turn-taking. Vapi's defaults are actively hostile to a training roleplay:
//   - stopSpeakingPlan.numWords defaults to 0, which routes interruption
//     through raw VAD (voiceSeconds 0.2) — a cough or keyboard tap stops the
//     prospect mid-sentence.
//   - interruptionPhrases defaults to bare single words ("no", "but", "not",
//     "wait", "actually") that interrupt IMMEDIATELY regardless of numWords —
//     so one stray/hallucinated one-word transcript truncates a whole turn.
// Both were observed live (a prospect reply cut to "Oh, sorry. I think there
// might be a mis- ... not a dog."). numWords >= 1 disables the raw-VAD path.
// NOTE: endpointing only controls WHEN the assistant speaks; it never filters
// what reaches the LLM (see docs/transcriber-hallucination.md).
export const ROLEPLAY_START_SPEAKING_PLAN = {
  // Aggressive floor: respond quickly once the trainee clearly finishes.
  waitSeconds: 0.5,
  smartEndpointingPlan: {
    provider: "livekit", // text-based semantic turn detection (English only)
    // Maps P(still speaking) -> 200-2500ms. This deliberately favors a fast
    // response over preserving long mid-thought pauses.
    waitFunction: "200 + 800 * sqrt(x) + 1500 * x^3",
  },
};

export const ROLEPLAY_STOP_SPEAKING_PLAN = {
  // Require real words, not audio energy, to interrupt the prospect.
  numWords: 4,
  backoffSeconds: 2.5,
  // Multi-word only: a one-word transcript can no longer bypass numWords.
  interruptionPhrases: ["hold on", "stop talking", "let me finish"],
  // Everything a trainee might say while listening — including the former
  // single-word interrupters — is explicitly a backchannel, not a barge-in.
  acknowledgementPhrases: [
    "i understand", "i see", "i got it", "i hear you", "im listening",
    "im with you", "right", "okay", "ok", "sure", "alright", "got it",
    "understood", "yeah", "yes", "uh-huh", "mm-hmm", "gotcha", "mhmm", "ah",
    "yeah okay", "yeah sure", "no", "but", "not", "wait", "actually", "nope",
    "nah", "hmm", "well", "so", "um", "uh",
  ],
};

export function buildRoleplayInitObj(
  scenario: RoleplayScenario,
  opts: { traineeName?: string; transcriberPreset?: string } = {}
): { assistantId: string; assistantOverrides: any } {
  // Spoken debrief is DISABLED for now (deferred 2026-08-01): its transcript
  // boundary is a fragile prose contract. Hardening plan + re-enable checklist:
  // docs/spoken-debrief-boundary.md. Stored spokenGrading flags are ignored.
  scenario = { ...scenario, spokenGrading: false };
  const waypoints = ensureScenarioWaypoints(scenario);
  const categoryScoreProps: Record<string, any> = {};
  for (const c of scenario.rubric) {
    categoryScoreProps[c.key] = {
      type: "number",
      minimum: 0,
      maximum: 20,
      description: `${c.label} (0-20): ${c.description}`,
    };
  }

  const checkpointProps: Record<string, any> = {};
  for (const cp of scenario.checkpoints) {
    checkpointProps[cp.id] = {
      type: "boolean",
      description: `${cp.name}: ${cp.description}`,
    };
  }

  // Verbatim quotes let the client locate each checkpoint moment in the
  // timestamped transcript/recording — the grader itself never sees times.
  const checkpointEvidenceProps: Record<string, any> = {};
  for (const cp of scenario.checkpoints) {
    checkpointEvidenceProps[cp.id] = {
      type: "string",
      description: `Exact quote (at most 15 words, copied VERBATIM character-for-character from the transcript) from the moment the trainee first achieved "${cp.name}". Empty string if this checkpoint was not achieved.`,
    };
  }

  const categoryFeedbackProps: Record<string, any> = {};
  for (const c of scenario.rubric) {
    categoryFeedbackProps[c.key] = {
      type: "object",
      additionalProperties: false,
      required: ["reasons", "evidenceQuote", "betterResponse"],
      properties: {
        reasons: {
          type: "array",
          items: { type: "string" },
          description: `One or two transcript-grounded reasons points were lost for ${c.label}.`,
        },
        evidenceQuote: {
          type: "string",
          description: "Short exact trainee quote, or 'No relevant response' if omitted.",
        },
        betterResponse: {
          type: "string",
          description: "Exact natural wording the trainee could use next time without inventing facts.",
        },
      },
    };
  }

  const agentSpeaksFirst = (scenario.speaksFirst ?? "prospect") === "agent";
  const transcriberPreset = opts.transcriberPreset ?? DEFAULT_ROLEPLAY_TRANSCRIBER;
  const transcriber = ROLEPLAY_TRANSCRIBERS[transcriberPreset] ?? null;

  return {
    assistantId: ROLEPLAY_BASE_ASSISTANT_ID,
    assistantOverrides: {
      // Omitted entirely for the "base" preset so the assistant's own
      // transcriber applies untouched.
      ...(transcriber ? { transcriber } : {}),
      // Krisp denoising. NOTE: `backgroundDenoisingEnabled` no longer exists in
      // Vapi's API; the plan below is the current field. Set explicitly because
      // the schema default and the docs disagree on smartDenoising.
      backgroundSpeechDenoisingPlan: { smartDenoisingPlan: { enabled: true } },
      // Whole-object replacements — nested deep-merge with the dashboard
      // assistant is undocumented, so these are sent complete.
      startSpeakingPlan: ROLEPLAY_START_SPEAKING_PLAN,
      stopSpeakingPlan: ROLEPLAY_STOP_SPEAKING_PLAN,
      // Inbound-style ('agent'): the AI waits for the trainee's greeting; its
      // opener is delivered via the prompt (firstMessage is not spoken in
      // assistant-waits-for-user mode, so we omit it to avoid confusion).
      // Outbound-style ('prospect'): the AI opens with firstMessage verbatim.
      ...(agentSpeaksFirst ? {} : { firstMessage: scenario.firstMessage }),
      firstMessageMode: agentSpeaksFirst
        ? "assistant-waits-for-user"
        : "assistant-speaks-first",
      // Voice: for Vapi-native voices (currently Elliot, the base assistant's
      // own voice) we send NO override — the base's exact tuning (v2, speed
      // 1.05) applies untouched. Only vetted 11labs voices get an override.
      ...(scenario.voice?.provider === "11labs"
        ? {
            voice: {
              provider: "11labs",
              voiceId: scenario.voice.voiceId,
              stability: 0.6,
              similarityBoost: 0.75,
              useSpeakerBoost: true,
              optimizeStreamingLatency: 4,
            },
          }
        : {}),
      model: {
        provider: "google",
        // Upgraded from gemini-3.1-flash-lite (2026-08-02): the prospect model
        // is ALSO the live waypoint judge, and the lite tier missed
        // WaypointComplete calls in real sessions. Costs some voice latency.
        model: "gemini-3.5-flash",
        temperature: clamp(scenario.knobs?.temperature, 0, 2, 0.6),
        // Short turns while roleplaying; a spoken debrief needs more room so the
        // grade doesn't get cut off mid-sentence.
        maxTokens: scenario.spokenGrading ? 600 : 250,
        messages: [
          { role: "system", content: buildPersonaSystemPrompt(scenario) },
        ],
        // Gives the AI the ability to hang up (fixes: "the model wouldn't hang up").
        tools: [{ type: "endCall" }, WaypointComplete(waypoints)],
      },
      // WaypointComplete is a one-way client-side function. Explicitly include
      // tool-calls so the Web SDK can update the carousel without a server.
      // assistant.speechStarted supplies a playback permit/fallback; transcript
      // supplies acoustic partials/finals so native-voice TTS chunks can be
      // reconciled into the complete prospect caption.
      clientMessages: [
        "assistant.speechStarted",
        "user-interrupted",
        "transcript",
        "hang",
        "tool-calls",
        "speech-update",
        "metadata",
        "conversation-update",
      ],
      analysisPlan: {
        // Carried over in spirit from the base assistant — overriding analysisPlan
        // replaces the whole object, so summaryPlan must be re-supplied here.
        summaryPlan: {
          enabled: true,
          messages: [
            {
              role: "system",
              content:
                `Summarize the roleplay call in 3 bullet points focusing on the prospect's concerns and how the trainee (the human agent) addressed them. If the AI prospect later says "${SPOKEN_DEBRIEF_BOUNDARY_PHRASE}", says it is stepping out of character, or begins spoken grading/coaching, treat that as the end of the interaction and completely ignore that debrief and everything after it.`,
            },
            {
              role: "user",
              content:
                "Here is the transcript:\n\n{{transcript}}\n\n. Here is the ended reason of the call:\n\n{{endedReason}}\n\n",
            },
          ],
        },
        structuredDataPlan: {
          enabled: true,
          timeoutSeconds: 30,
          messages: [
            { role: "system", content: buildGraderPrompt(scenario) + "\n\nJson Schema:\n{{schema}}\n\nOnly respond with the JSON." },
            {
              role: "user",
              content:
                "Here is the transcript:\n\n{{transcript}}\n\n. Here is the ended reason of the call:\n\n{{endedReason}}\n\n",
            },
          ],
          schema: {
            type: "object",
            additionalProperties: false,
            required: [
              "overallScore",
              "categoryScores",
              "categoryFeedback",
              ...(scenario.checkpoints.length ? ["checkpoints", "checkpointEvidence"] : []),
              "highlights",
              "improvements",
              "passed",
              "scenarioId",
            ],
            properties: {
              overallScore: {
                type: "number",
                minimum: 0,
                maximum: 100,
                description: "Sum of category scores scaled to 0-100",
              },
              categoryScores: {
                type: "object",
                additionalProperties: false,
                required: scenario.rubric.map((c) => c.key),
                properties: categoryScoreProps,
              },
              categoryFeedback: {
                type: "object",
                additionalProperties: false,
                required: scenario.rubric.map((c) => c.key),
                properties: categoryFeedbackProps,
              },
              checkpoints: {
                type: "object",
                additionalProperties: false,
                required: scenario.checkpoints.map((cp) => cp.id),
                properties: checkpointProps,
              },
              checkpointEvidence: {
                type: "object",
                additionalProperties: false,
                required: scenario.checkpoints.map((cp) => cp.id),
                properties: checkpointEvidenceProps,
              },
              highlights: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["text", "evidenceQuote"],
                  properties: {
                    text: {
                      type: "string",
                      description: "The strength, written directly TO the trainee ('You ...').",
                    },
                    evidenceQuote: {
                      type: "string",
                      description:
                        "Exact quote (at most 15 words, copied VERBATIM from the transcript) from the moment this strength was shown. Empty string if there is no single locating moment.",
                    },
                  },
                },
              },
              improvements: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["text", "evidenceQuote"],
                  properties: {
                    text: {
                      type: "string",
                      description: "The actionable coaching tip, written directly TO the trainee.",
                    },
                    evidenceQuote: {
                      type: "string",
                      description:
                        "Exact quote (at most 15 words, copied VERBATIM from the transcript) from the moment where this tip would have mattered most — often the prospect's words the trainee under-answered. Empty string if there is no single locating moment.",
                    },
                  },
                },
              },
              passed: { type: "boolean" },
              scenarioId: { type: "string", description: `Always "${scenario.id}"` },
            },
          },
        },
        // StructuredDataPlan is the single source of truth for pass/fail. The
        // generic success evaluator is unused and would see the full spoken
        // debrief, so keep it disabled to avoid a second contaminated result.
        successEvaluationPlan: { enabled: false },
      },
      silenceTimeoutSeconds: clamp(scenario.knobs?.silenceTimeoutSeconds, 10, 3600, 30),
      maxDurationSeconds: clamp(scenario.knobs?.maxDurationSeconds, 10, 43200, 600),
      metadata: {
        scenarioId: scenario.id,
        scenarioName: scenario.name,
        traineeName: opts.traineeName ?? "",
        passThreshold: roleplayPassThreshold(scenario),
        source: "roleplay-tyg",
      },
    },
  };
}
