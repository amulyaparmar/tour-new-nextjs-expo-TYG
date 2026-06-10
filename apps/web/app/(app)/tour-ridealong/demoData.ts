export type SpeakerId = "speaker-0" | "speaker-1";

export type TranscriptKind = "gain" | "loss" | "tone" | "neutral";

export type TranscriptSegment = {
  id: string;
  speakerId: SpeakerId;
  start: number;
  end: number;
  text: string;
  kind?: TranscriptKind;
  insightId?: string;
};

export type RubricItem = {
  id: string;
  label: string;
  score: number;
  summary: string;
  evidenceSegmentIds: string[];
};

export type CoachingInsight = {
  id: string;
  title: string;
  type: "key_moment" | "improvement" | "tone" | "rewrite";
  segmentId: string;
  scoreImpact: "gained" | "lost" | "neutral";
  whatHappened: string;
  whyItMatters: string;
  suggestedWording?: string;
};

export type SpeakerTrack = {
  speakerId: SpeakerId;
  segments: Array<{
    id: string;
    start: number;
    end: number;
    segmentId: string;
  }>;
};

export type RidealongModeId = "record" | "review" | "roleplay" | "mystery-shop";

export type RidealongMode = {
  id: RidealongModeId;
  label: string;
  eyebrow: string;
  headline: string;
  summary: string;
  primaryMetric: string;
  metricLabel: string;
  actionLabel: string;
};

export type MockWorkflowStep = {
  id: string;
  label: string;
  status: "ready" | "active" | "complete";
  detail: string;
};

export type MockReviewMoment = {
  id: string;
  title: string;
  timestamp: number;
  impact: "gain" | "loss" | "tone";
  summary: string;
};

export type RolePlayScenario = {
  id: string;
  persona: string;
  objection: string;
  goal: string;
  difficulty: "Warm" | "Medium" | "Hard";
  coachPrompt: string;
};

export type MysteryShopRun = {
  id: string;
  property: string;
  shopperPersona: string;
  score: number;
  finding: string;
  followUp: string;
};

export const tourRidealongDemo = {
  recording: {
    title: "Convo with Matt Brainstorming AI TYG",
    subtitle: "Collaborative solution design review",
    conversationType: "In-person / ridealong product planning",
    dateLabel: "Demo recording",
    duration: 461.5,
    audioSrc: "/tour-ridealong/convo-with-matt-brainstorming-ai-tyg.m4a",
    overallScore: 8.4,
  },
  speakers: {
    "speaker-0": {
      name: "Speaker 0",
      role: "Product lead",
      color: "#8b7cf6",
      softColor: "#ddd7ff",
      talkTimePercent: 64,
    },
    "speaker-1": {
      name: "Speaker 1",
      role: "Reviewer / collaborator",
      color: "#e7d6a3",
      softColor: "#f4ebc7",
      talkTimePercent: 36,
    },
  } satisfies Record<SpeakerId, {
    name: string;
    role: string;
    color: string;
    softColor: string;
    talkTimePercent: number;
  }>,
  transcript: [
    {
      id: "seg-001",
      speakerId: "speaker-0",
      start: 0,
      end: 4,
      text: "Just so we have data to work with, let's actually record this, what we were about to say.",
      kind: "gain",
      insightId: "insight-data-first",
    },
    {
      id: "seg-002",
      speakerId: "speaker-0",
      start: 4,
      end: 8.8,
      text: "Well, what ideas and features do you think would be helpful here, Matthew?",
      kind: "gain",
      insightId: "insight-discovery",
    },
    {
      id: "seg-003",
      speakerId: "speaker-1",
      start: 8.8,
      end: 17.2,
      text: "Okay, so to confirm, this is a tool that's going to...",
    },
    {
      id: "seg-004",
      speakerId: "speaker-1",
      start: 26.08,
      end: 30.8,
      text: "Can you, like, scribe again from the top specifically? Just in, like, brief.",
      kind: "gain",
      insightId: "insight-clarify",
    },
    {
      id: "seg-005",
      speakerId: "speaker-1",
      start: 30.8,
      end: 49.28,
      text: "Because I see that it's extracting transcripts from voice memos, but are you just using it to play back the transcript in a voice? Or what exactly is the use case?",
      kind: "gain",
      insightId: "insight-clarify",
    },
    {
      id: "seg-006",
      speakerId: "speaker-0",
      start: 54.8,
      end: 60.08,
      text: "One, it's for virtual sales recordings of in-person conversations for later review.",
      kind: "gain",
      insightId: "insight-problem-frame",
    },
    {
      id: "seg-007",
      speakerId: "speaker-1",
      start: 60.08,
      end: 75.04,
      text: "Oh, okay. So this is the thing we talked about earlier? Okay, okay.",
      kind: "tone",
    },
    {
      id: "seg-008",
      speakerId: "speaker-0",
      start: 75.04,
      end: 93.2,
      text: "Two, it's allowing humans to review and comment on a sales experience. Maybe three, an AI rubric to evaluate the sales conversation, or just the conversation in general.",
      kind: "gain",
      insightId: "insight-scope",
    },
    {
      id: "seg-009",
      speakerId: "speaker-0",
      start: 93.2,
      end: 105.04,
      text: "The customer conversation in general. Where are opportunities for improvement?",
      kind: "gain",
      insightId: "insight-scope",
    },
    {
      id: "seg-010",
      speakerId: "speaker-0",
      start: 114.8,
      end: 140.24,
      text: "Maybe AI for commenting for the human to review.",
      kind: "gain",
      insightId: "insight-human-review",
    },
    {
      id: "seg-011",
      speakerId: "speaker-0",
      start: 141.36,
      end: 161.76,
      text: "And maybe five would be using AI to analyze previous conversations, almost like ChatGPT, but can run across hundreds of conversations to find insights in mass over conversations.",
      kind: "gain",
      insightId: "insight-mass-analysis",
    },
    {
      id: "seg-012",
      speakerId: "speaker-1",
      start: 163.68,
      end: 173.2,
      text: "I do like using the Deepgram for voice separation.",
      kind: "gain",
      insightId: "insight-deepgram",
    },
    {
      id: "seg-013",
      speakerId: "speaker-1",
      start: 173.2,
      end: 206.4,
      text: "One thing that would be really important, considering this is for feedback purposes, would be if it could highlight exactly where in the transcript points were potentially lost, or where points could be potentially gained.",
      kind: "gain",
      insightId: "insight-highlight-points",
    },
    {
      id: "seg-014",
      speakerId: "speaker-1",
      start: 206.4,
      end: 220.4,
      text: "If the wording or delivery of a specific line were incorrect, or it could have included additional details, the AI could highlight that line and provide an example extension or rewording.",
      kind: "gain",
      insightId: "insight-rewrite",
    },
    {
      id: "seg-015",
      speakerId: "speaker-1",
      start: 220.4,
      end: 233.44,
      text: "That would definitely be better than just having it on the rubric saying, you didn't do this right.",
      kind: "gain",
      insightId: "insight-rewrite",
    },
    {
      id: "seg-016",
      speakerId: "speaker-1",
      start: 233.44,
      end: 238.96,
      text: "Being able to see where exactly in the speech you did something incorrectly, or could be improved, would be great.",
      kind: "gain",
      insightId: "insight-rewrite",
    },
    {
      id: "seg-017",
      speakerId: "speaker-0",
      start: 238.96,
      end: 250.96,
      text: "It would also be great to somehow be able to evaluate tone.",
      kind: "gain",
      insightId: "insight-tone",
    },
    {
      id: "seg-018",
      speakerId: "speaker-1",
      start: 250.96,
      end: 262.56,
      text: "That would not be something LLMs can do based on pitch and intonation. You probably need another tool for that.",
      kind: "gain",
      insightId: "insight-tone-constraint",
    },
    {
      id: "seg-019",
      speakerId: "speaker-0",
      start: 262.56,
      end: 277.04,
      text: "Now there are multimodal models. They allow audio as input, can generate audio as output, and analyze tone.",
      kind: "gain",
      insightId: "insight-multimodal",
    },
    {
      id: "seg-020",
      speakerId: "speaker-0",
      start: 277.04,
      end: 295.52,
      text: "Gemini is one of those models, but I think OpenAI's newest models might be able to as well.",
      kind: "tone",
      insightId: "insight-multimodal",
    },
    {
      id: "seg-021",
      speakerId: "speaker-0",
      start: 300.4,
      end: 344.32,
      text: "This is primarily for in-person conversations, maybe tours, maybe other types of recorded conversations as well.",
      kind: "gain",
      insightId: "insight-use-case",
    },
    {
      id: "seg-022",
      speakerId: "speaker-0",
      start: 345.76,
      end: 352.48,
      text: "I might honestly do some form of planning task. What else do you think would be important?",
      kind: "gain",
      insightId: "insight-discovery",
    },
    {
      id: "seg-023",
      speakerId: "speaker-1",
      start: 352.48,
      end: 366.24,
      text: "I think what we have is pretty good so far.",
      kind: "tone",
    },
    {
      id: "seg-024",
      speakerId: "speaker-0",
      start: 366.24,
      end: 380.4,
      text: "I want to build this feature quickly. Minimize the extra new elements of data. Let's plan minimal database recordings.",
      kind: "gain",
      insightId: "insight-minimal-data",
    },
    {
      id: "seg-025",
      speakerId: "speaker-0",
      start: 380.4,
      end: 392.16,
      text: "I'm attaching the foundational M4A for analysis. You can create your own rubric for this conversation.",
      kind: "gain",
      insightId: "insight-demo-data",
    },
    {
      id: "seg-026",
      speakerId: "speaker-0",
      start: 393.44,
      end: 416.24,
      text: "This example requires a rubric less on sales, but more on collaborative sales and solutions. The rubric or AI should point out what Speaker 0 or 1 did special in the conversation.",
      kind: "gain",
      insightId: "insight-rubric",
    },
    {
      id: "seg-027",
      speakerId: "speaker-0",
      start: 417.92,
      end: 442.24,
      text: "Feel free to analyze tone, word choice, etc. This one task is actually a very powerful task.",
      kind: "gain",
      insightId: "insight-tone",
    },
    {
      id: "seg-028",
      speakerId: "speaker-0",
      start: 442.24,
      end: 461.5,
      text: "We can start with this brainstorming task, then I would take this one line because I think it's very powerful.",
      kind: "loss",
      insightId: "insight-next-step",
    },
  ] satisfies TranscriptSegment[],
  insights: [
    {
      id: "insight-data-first",
      title: "Created analysis-ready source material",
      type: "key_moment",
      segmentId: "seg-001",
      scoreImpact: "gained",
      whatHappened: "Speaker 0 explicitly chose to record the planning conversation so the product could be demonstrated against real audio.",
      whyItMatters: "That turns an abstract feature idea into reviewable evidence and mirrors the product's core job.",
    },
    {
      id: "insight-clarify",
      title: "Clarified the use case before designing",
      type: "key_moment",
      segmentId: "seg-005",
      scoreImpact: "gained",
      whatHappened: "Speaker 1 paused the flow to ask whether this was playback, transcript review, or another use case.",
      whyItMatters: "The question prevented premature implementation and surfaced that the product is a coaching/review layer, not only transcription.",
    },
    {
      id: "insight-highlight-points",
      title: "Defined the core coaching interaction",
      type: "key_moment",
      segmentId: "seg-013",
      scoreImpact: "gained",
      whatHappened: "Speaker 1 named the product's highest-value behavior: show exactly where points were lost or gained in the transcript.",
      whyItMatters: "This is the difference between a generic scorecard and a useful coaching product.",
    },
    {
      id: "insight-rewrite",
      title: "Moved beyond scoring into actionable coaching",
      type: "rewrite",
      segmentId: "seg-014",
      scoreImpact: "gained",
      whatHappened: "The conversation established that rubric deductions should include example rewrites or extensions.",
      whyItMatters: "Reviewers need to know what to say next time, not only what went wrong.",
      suggestedWording: "Instead of only saying 'tone analysis matters,' ask: 'At what exact line would a reviewer need a rewrite, and should the AI suggest a softer, clearer, or more consultative version?'",
    },
    {
      id: "insight-tone",
      title: "Tone analysis was scoped correctly",
      type: "tone",
      segmentId: "seg-017",
      scoreImpact: "neutral",
      whatHappened: "Speaker 0 raised tone as a target and Speaker 1 distinguished wording-based tone from pitch and intonation.",
      whyItMatters: "That split creates a practical v1/v2 roadmap: text-based tone first, multimodal acoustic tone later.",
    },
    {
      id: "insight-minimal-data",
      title: "Good product constraint: minimal data model",
      type: "key_moment",
      segmentId: "seg-024",
      scoreImpact: "gained",
      whatHappened: "Speaker 0 named speed and a minimal recording data layer as constraints.",
      whyItMatters: "This keeps the first build focused on proving the review experience before building storage and batch analysis systems.",
    },
    {
      id: "insight-next-step",
      title: "Next step could have been sharper",
      type: "improvement",
      segmentId: "seg-028",
      scoreImpact: "lost",
      whatHappened: "The conversation ended with enthusiasm but not a concrete owner, route, or implementation boundary.",
      whyItMatters: "Collaborative sales conversations should end with a specific next action so momentum survives the meeting.",
      suggestedWording: "Let's build one public `/tour-ridealong` page from this recording today, with hard-coded transcript and rubric data, then decide whether to wire Deepgram post-processing next.",
    },
  ] satisfies CoachingInsight[],
  rubric: [
    {
      id: "problem-framing",
      label: "Problem framing",
      score: 9.1,
      summary: "The core problem was framed clearly as review of real in-person sales or tour conversations.",
      evidenceSegmentIds: ["seg-006", "seg-008", "seg-009"],
    },
    {
      id: "discovery-clarity",
      label: "Discovery clarity",
      score: 8.6,
      summary: "Both speakers asked clarifying questions before committing to a solution direction.",
      evidenceSegmentIds: ["seg-002", "seg-005", "seg-022"],
    },
    {
      id: "co-creation",
      label: "Collaborative co-creation",
      score: 9.3,
      summary: "Speaker 1 improved the product by adding transcript-level point gain/loss and rewrite guidance.",
      evidenceSegmentIds: ["seg-013", "seg-014", "seg-015"],
    },
    {
      id: "actionable-specificity",
      label: "Actionable specificity",
      score: 8.1,
      summary: "The feature set became concrete, but the conversation could have locked the first UI route sooner.",
      evidenceSegmentIds: ["seg-013", "seg-024", "seg-028"],
    },
    {
      id: "tone-pacing",
      label: "Tone and pacing",
      score: 7.8,
      summary: "The tone was open and collaborative, with some repetition while the concept was being shaped.",
      evidenceSegmentIds: ["seg-017", "seg-018", "seg-021"],
    },
    {
      id: "next-step",
      label: "Next-step definition",
      score: 7.4,
      summary: "The direction was strong, but the close needed a crisper implementation commitment.",
      evidenceSegmentIds: ["seg-024", "seg-028"],
    },
  ] satisfies RubricItem[],
  speakerTracks: [
    {
      speakerId: "speaker-0",
      segments: [
        { id: "track-0-1", start: 0, end: 8.8, segmentId: "seg-001" },
        { id: "track-0-2", start: 54.8, end: 60.08, segmentId: "seg-006" },
        { id: "track-0-3", start: 75.04, end: 161.76, segmentId: "seg-008" },
        { id: "track-0-4", start: 238.96, end: 250.96, segmentId: "seg-017" },
        { id: "track-0-5", start: 260.4, end: 295.52, segmentId: "seg-019" },
        { id: "track-0-6", start: 300.4, end: 344.32, segmentId: "seg-021" },
        { id: "track-0-7", start: 345.76, end: 352.48, segmentId: "seg-022" },
        { id: "track-0-8", start: 366.24, end: 461.5, segmentId: "seg-024" },
      ],
    },
    {
      speakerId: "speaker-1",
      segments: [
        { id: "track-1-1", start: 8.8, end: 17.2, segmentId: "seg-003" },
        { id: "track-1-2", start: 26.08, end: 49.28, segmentId: "seg-005" },
        { id: "track-1-3", start: 60.08, end: 75.04, segmentId: "seg-007" },
        { id: "track-1-4", start: 163.68, end: 238.96, segmentId: "seg-013" },
        { id: "track-1-5", start: 248.2, end: 262.56, segmentId: "seg-018" },
        { id: "track-1-6", start: 352.48, end: 366.24, segmentId: "seg-023" },
      ],
    },
  ] satisfies SpeakerTrack[],
};

export const ridealongModes = [
  {
    id: "record",
    label: "Record",
    eyebrow: "Field capture",
    headline: "Hit record before the tour starts.",
    summary: "Capture real leasing conversations from a phone, laptop, or shared room, then turn the audio into reviewable coaching data.",
    primaryMetric: "Live",
    metricLabel: "ready to capture",
    actionLabel: "Start mock recording",
  },
  {
    id: "review",
    label: "AI Review",
    eyebrow: "Post-call coaching",
    headline: "Turn one recording into exact coaching moments.",
    summary: "Review transcript highlights, point gains, point losses, tone notes, suggested rewrites, and rubric evidence tied to timestamps.",
    primaryMetric: tourRidealongDemo.recording.overallScore.toFixed(1),
    metricLabel: "overall score",
    actionLabel: "Review selected call",
  },
  {
    id: "roleplay",
    label: "Role Play",
    eyebrow: "Practice mode",
    headline: "Rehearse difficult prospect conversations.",
    summary: "Spin up prospect personas, objections, leasing goals, and AI coaching prompts before the team has the real conversation.",
    primaryMetric: "3",
    metricLabel: "scenarios ready",
    actionLabel: "Launch role play",
  },
  {
    id: "mystery-shop",
    label: "Mystery Shop",
    eyebrow: "Quality assurance",
    headline: "Audit the experience customers actually receive.",
    summary: "Compare shopper calls and tours across properties, then surface follow-up gaps, fair housing risk, and missed closing moments.",
    primaryMetric: "91%",
    metricLabel: "QA coverage",
    actionLabel: "Run mock shop",
  },
] satisfies RidealongMode[];

export const recordWorkflowSteps = [
  {
    id: "consent",
    label: "Consent check",
    status: "complete",
    detail: "Prompt the team to confirm recording consent before capture begins.",
  },
  {
    id: "capture",
    label: "Audio capture",
    status: "active",
    detail: "Record from mobile, desktop, or a collaborative room with speaker separation queued.",
  },
  {
    id: "transcribe",
    label: "Transcribe",
    status: "ready",
    detail: "Convert the recording into timestamped transcript segments after the tour.",
  },
  {
    id: "score",
    label: "Score and coach",
    status: "ready",
    detail: "Run the selected rubric and create reviewer-ready coaching moments.",
  },
] satisfies MockWorkflowStep[];

export const reviewMoments = [
  {
    id: "moment-discovery",
    title: "Strong discovery question",
    timestamp: 4,
    impact: "gain",
    summary: "The speaker invited the collaborator into the design process instead of pitching a fixed idea.",
  },
  {
    id: "moment-rewrite",
    title: "Rewrite opportunity",
    timestamp: 206,
    impact: "gain",
    summary: "The review should show the exact line and suggest a better version, not only a rubric deduction.",
  },
  {
    id: "moment-close",
    title: "Close needed a sharper next step",
    timestamp: 442,
    impact: "loss",
    summary: "The call ended with momentum, but the owner, date, and build scope could be more explicit.",
  },
] satisfies MockReviewMoment[];

export const rolePlayScenarios = [
  {
    id: "budget-objection",
    persona: "Cost-conscious renter",
    objection: "The rent is higher than the place across the street.",
    goal: "Reframe value without discounting too early.",
    difficulty: "Medium",
    coachPrompt: "Ask what matters most, compare total value, then confirm the next touring step.",
  },
  {
    id: "roommate-delay",
    persona: "Student housing prospect",
    objection: "I need to ask my roommate before applying.",
    goal: "Keep momentum while respecting the decision group.",
    difficulty: "Warm",
    coachPrompt: "Offer to send a shareable recap and schedule a roommate-friendly follow-up.",
  },
  {
    id: "negative-review",
    persona: "Skeptical lead",
    objection: "I saw bad reviews about maintenance.",
    goal: "Address concern directly and create trust with specifics.",
    difficulty: "Hard",
    coachPrompt: "Acknowledge the concern, explain the current process, and invite a maintenance-specific tour question.",
  },
] satisfies RolePlayScenario[];

export const mysteryShopRuns = [
  {
    id: "shop-arden",
    property: "Arden Square",
    shopperPersona: "Two-bedroom renter moving in 30 days",
    score: 88,
    finding: "Great greeting and needs discovery, but no clear application close.",
    followUp: "Coach the final 90 seconds with a direct next-step ask.",
  },
  {
    id: "shop-cypress",
    property: "Cypress Commons",
    shopperPersona: "Student parent asking about safety",
    score: 93,
    finding: "Strong empathy, amenity framing, and timely follow-up promise.",
    followUp: "Turn this call into a benchmark example for the team.",
  },
  {
    id: "shop-lakeview",
    property: "Lakeview Lofts",
    shopperPersona: "Remote prospect comparing three properties",
    score: 76,
    finding: "Missed budget qualification and did not offer a virtual tour link.",
    followUp: "Assign role play on remote-tour conversion and objection handling.",
  },
] satisfies MysteryShopRun[];

export const tourRidealongSocialPosts = [
  {
    id: "hit-record",
    title: "Hit Record",
    imageSrc: "/tour-ridealong/posts/hit-record.png",
    caption: "Capture every leasing tour moment from the field.",
  },
  {
    id: "ai-review",
    title: "AI Review",
    imageSrc: "/tour-ridealong/posts/ai-review.png",
    caption: "Turn recorded calls into timestamped coaching and scorecards.",
  },
  {
    id: "role-play",
    title: "Role Play",
    imageSrc: "/tour-ridealong/posts/role-play.png",
    caption: "Practice objections and difficult prospect conversations before the real tour.",
  },
  {
    id: "mystery-shop",
    title: "Mystery Shop",
    imageSrc: "/tour-ridealong/posts/mystery-shop.png",
    caption: "Compare the customer experience across properties and teams.",
  },
] satisfies Array<{
  id: string;
  title: string;
  imageSrc: string;
  caption: string;
}>;

export function getRidealongMode(modeId: RidealongModeId) {
  return ridealongModes.find((mode) => mode.id === modeId) || ridealongModes[0]!;
}

export function buildMockRidealongPreview(modeId: RidealongModeId) {
  const mode = getRidealongMode(modeId);
  const topReviewMoment = reviewMoments.find((moment) => moment.impact === "loss") || reviewMoments[0]!;
  const topScenario = rolePlayScenarios.find((scenario) => scenario.difficulty === "Hard") || rolePlayScenarios[0]!;
  const lowestShop = mysteryShopRuns.reduce(
    (lowest, run) => run.score < lowest.score ? run : lowest,
    mysteryShopRuns[0]!
  );

  return {
    mode,
    recordWorkflowSteps,
    reviewMoments,
    rolePlayScenarios,
    mysteryShopRuns,
    recommendedNextAction: {
      record: "Capture the next real tour, then auto-create a review queue.",
      review: `Start with "${topReviewMoment.title}" at ${Math.floor(topReviewMoment.timestamp / 60)}:${String(topReviewMoment.timestamp % 60).padStart(2, "0")}.`,
      roleplay: `Practice "${topScenario.objection}" before the next leasing shift.`,
      "mystery-shop": `Review ${lowestShop.property}; it has the lowest mock score at ${lowestShop.score}.`,
    }[modeId],
  };
}
