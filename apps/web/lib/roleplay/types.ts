// Shared types for the Roleplay Training feature (TYG).
// A "scenario" fully describes one practice roleplay: the AI plays the
// prospect/customer, the human trainee plays the sales/leasing agent.

export type RubricKey = "c1" | "c2" | "c3" | "c4" | "c5";

// One grading category, scored 0-20 by the post-call analysis.
// Keys are generic (c1..c5) so every scenario can define its own rubric;
// labels/descriptions live here and are re-attached when displaying scores.
export type RubricCategory = {
  key: RubricKey;
  label: string;        // e.g. "Discovery Questions"
  description: string;  // what "good" looks like, fed to the grader
};

// A hidden checkpoint the trainee should hit during the call.
// Graded post-hoc (pass/fail) by the analysis, never revealed in-call.
export type Checkpoint = {
  id: string;           // slug, e.g. "asks-for-next-step"
  name: string;         // short display name
  description: string;  // what counts as hitting it, fed to the grader
  required?: boolean;   // default true; a miss blocks passing
  rubricKey?: RubricKey; // optional link used to keep binary + quality grades coherent
};

export type RoleplayVoice = {
  // "vapi" = Vapi-native voice; scenarios using the base assistant's own
  // voice (Elliot) send NO voice override so the base tuning applies as-is.
  provider: "vapi" | "11labs";
  voiceId: string;
  label: string;        // display name, e.g. "Elliot"
};

export type RoleplayDifficulty = "easy" | "medium" | "hard";

// Who opens the call.
// - 'prospect': outbound-style — the AI speaks firstMessage immediately.
// - 'agent': inbound-style — the AI waits; the trainee answers with their
//   greeting ("Hello, this is X, how may I help you?"), then the AI opens
//   with the scenario's firstMessage content (delivered via prompt, since
//   Vapi's assistant-waits-for-user mode never speaks firstMessage).
export type RoleplaySpeaksFirst = "prospect" | "agent";

export type WaypointMomentType = "objection" | "guidance" | "value";

// Two to four live coaching moments authored for a scenario. These are not
// grading checkpoints: they drive the in-call Waypoint carousel, and the AI
// prospect silently calls WaypointComplete when the trainee clearly reaches
// the completion criteria.
export type RoleplayWaypoint = {
  id: string;
  type: WaypointMomentType;
  title: string;
  cue: string;
  completionCriteria: string;
  suggestedLines: string[];
};

export type RoleplayScenario = {
  id: string;                    // uuid
  name: string;
  description: string;           // shown on the scenario card
  personaPrompt: string;         // system prompt: who the AI prospect is + situation
  firstMessage: string;          // the AI's opening line (assistant speaks first)
  voice: RoleplayVoice;
  difficulty: RoleplayDifficulty;
  speaksFirst?: RoleplaySpeaksFirst; // default 'prospect' (backward compatible)
  spokenGrading?: boolean;           // default false; true = AI reads the grade aloud at call end (costs more)
  // Per-scenario overrides of the generic template sections. Any unset/blank
  // key falls back to the shared default (see promptTemplate.ts).
  templateOverrides?: {
    identityFraming?: string;
    voiceRealism?: string;
    style?: string;
    errorHandling?: string;
  };
  waypoints?: RoleplayWaypoint[];    // 2-4 objection, guidance, or value moments
  checkpoints: Checkpoint[];
  rubric: RubricCategory[];      // up to 5 categories, 0-20 points each
  passThreshold?: number;        // default 70
  knobs?: {
    silenceTimeoutSeconds?: number;
    maxDurationSeconds?: number;
    temperature?: number;
  };
  createdAt: string;             // ISO
  updatedAt: string;             // ISO
};

// One overall-feedback item located in call time. The grader emits `text` +
// a VERBATIM `evidenceQuote`; `timeSeconds` is resolved client-side by
// matching the quote against the timestamped transcript
// (utils/roleplay/feedbackTimestamps.ts) — the grader itself never sees
// timestamps, so it cannot emit times directly.
export type FeedbackMoment = {
  text: string;
  evidenceQuote?: string;
  timeSeconds?: number;
};

// Shape produced by the per-scenario analysisPlan structuredData schema.
// highlights/improvements accept plain strings too because rows graded before
// the 2026-08-02 timestamp schema (and any non-compliant grader output) still
// flow through the same consumers.
export type RoleplayStructuredData = {
  overallScore: number;                                   // 0-100
  categoryScores: Partial<Record<RubricKey, number>>;     // 0-20 each
  categoryFeedback?: Partial<
    Record<
      RubricKey,
      {
        reasons: string[];
        evidenceQuote?: string;
        betterResponse: string;
      }
    >
  >;
  checkpoints?: Record<string, boolean>;                  // keyed by Checkpoint.id
  checkpointEvidence?: Record<string, string>;            // verbatim quote at the hit moment ("" if missed)
  highlights?: Array<string | { text: string; evidenceQuote?: string }>;
  improvements?: Array<string | { text: string; evidenceQuote?: string }>;
  passed: boolean;
  scenarioId?: string;
};

// One transcript line in the repo's established transcript_json shape
// (see formatAllVapiData in app/api/vapi/webhook/route.tsx and the
// PlayerAndTranscript component's preformatTranscript prop).
export type TranscriptLine = {
  type: string;       // 'bot' | 'user'
  message: string;
  time: number;       // secondsFromStart
  endTime?: number;   // secondsFromStart
  duration?: number;  // voiced seconds
  timingSource?: "vapi" | "live";
};

// What /api/roleplay/call-analysis returns for a call.
export type RoleplayCallResult = {
  id: string;
  status: string;                 // queued | ringing | in-progress | forwarding | ended
  endedReason?: string;
  analysis?: {
    structuredData?: RoleplayStructuredData;
    summary?: string;
    successEvaluation?: string;
  };
  recordingUrl?: string;
  transcript?: string;
  transcriptJson: TranscriptLine[];
  createdAt?: string;
  startedAt?: string;
  endedAt?: string;
  durationSeconds?: number;
  cost?: number;
};

// Existing Supabase `calls` table evaluations shape (rendered by AiEval.tsx).
export type EvaluationItem = {
  keyword: string;
  score: number;
  comments: string[];
  label?: string;
  maxScore?: number;
  rubricKey?: RubricKey;
  feedback?: {
    reasons: string[];
    evidenceQuote?: string;
    betterResponse: string;
  };
  details?: any;
};
