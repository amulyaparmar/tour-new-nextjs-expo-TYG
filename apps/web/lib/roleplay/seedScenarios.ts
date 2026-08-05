// Seed scenarios used to initialize data/roleplay-scenarios.json the first time
// the scenarios API runs. Kept separate from scenarioStore so the shapes are
// easy to review/edit. The first scenario mirrors the org's existing
// "Scenario Roleplay Brief Matt TYG" assistant (UM student / University Trails).

import { RoleplayScenario } from "./types";

const NOW = "2026-07-20T00:00:00.000Z";

export const SEED_SCENARIOS: RoleplayScenario[] = [
  {
    id: "seed-roommate-friction-university-trails",
    name: "Roommate Friction — University Trails",
    description:
      "A UM student living with noisy roommates wants a quieter place to study. Practice discovery, empathy, value-selling study spaces, roommate matching, ethical urgency, and closing for a next step.",
    personaPrompt: `You are a University of Michigan student calling University Trails apartments near UM North Campus in Ann Arbor. You currently live with roommates, but it's been rough — noise, no privacy, and it's hard to find a quiet place to study — and you're hoping for a calmer setup so you can focus on school. You're friendly but a little hesitant and unsure, a real college student weighing your options rather than a polished caller. Sound authentic to a student: warm, relatable, a bit tentative.

Let the call unfold in roughly this order, at a natural pace:
1. Open by saying you're a UM student looking at leasing options at University Trails.
2. Bring up that you live with roommates but it's been hard — noise, lack of privacy, trouble studying.
3. Answer the agent's questions in character; don't dump every concern at once — let them draw it out of you.
4. If the agent acknowledges the roommate friction or shows they get it, warm up a little.
5. If they bring up study lounges, quiet spaces, or study-focused amenities, show genuine interest.
6. If they offer ways to handle roommate fit (lifestyle matching, single rooms, agreements), ask about the options.
7. If they explain — honestly — why deciding soon helps (e.g. the best units or views lease out first), agree you'd like to decide before too long.
8. If they ask for a next step (a tour, an application, a follow-up), respond like a real prospect would.
9. Keep playing the prospect until the agent wraps up or closes the call.`,
    firstMessage:
      "Hi—I'm looking at University Trails. I'd probably be living with roommates, and I'm a little worried about noise and having a quiet place to study. Can you tell me what it's like there?",
    voice: { provider: "vapi", voiceId: "Elliot", label: "Elliot" },
    difficulty: "medium",
    passThreshold: 70,
    // Regenerated 2026-08-02 via /api/roleplay/generate-waypoints
    // (gemini-3.5-flash; prompt in utils/roleplay/waypointGeneration.ts).
    waypoints: [
      {
        id: "validate-the-study-noise-struggle",
        type: "guidance",
        title: "Validate the study noise struggle",
        cue: "The prospect says they are worried about noise, roommates, and finding a quiet place to study.",
        completionCriteria:
          "The trainee verbally acknowledges the difficulty of studying around noisy roommates or expresses empathy for their current living situation.",
        suggestedLines: [
          "I completely understand how hard it is to focus on school when your living space is noisy.",
          "That sounds really stressful. Having a quiet space to study is so important for classes.",
          "I hear you. Dealing with roommate noise when you're trying to study is incredibly frustrating.",
        ],
      },
      {
        id: "highlight-study-focused-amenities",
        type: "value",
        title: "Highlight study-focused amenities",
        cue: "The prospect mentions needing a quiet place to study or asks what the community environment is like.",
        completionCriteria:
          "The trainee describes the community's study lounges, quiet areas, or dedicated study spaces.",
        suggestedLines: [
          "We actually have dedicated study lounges and quiet spaces designed exactly for students who need to focus.",
          "To help with that, we offer quiet study areas right here on site so you don't have to leave the building to focus.",
          "Let me tell you about our study spaces, which are perfect for getting work done without roommate distractions.",
        ],
      },
      {
        id: "address-roommate-compatibility-anxieties",
        type: "objection",
        title: "Address roommate compatibility anxieties",
        cue: "The prospect expresses concern about getting paired with noisy or incompatible roommates again.",
        completionCriteria:
          "The trainee explains how the community handles roommate matching, individual leases, or compatibility profiles.",
        suggestedLines: [
          "We use a roommate matching process to pair you with people who share similar study habits and quiet hours.",
          "Can I ask what kind of schedule you keep? We try to match roommates based on lifestyle preferences.",
          "We offer individual bedroom leases and roommate matching to help ensure everyone is on the same page.",
        ],
      },
      {
        id: "explain-availability-and-suggest-tour",
        type: "guidance",
        title: "Explain availability and suggest tour",
        cue: "The prospect shows interest in the study spaces or roommate matching process.",
        // Hand-tightened after review: the generated criteria fused next-step
        // and urgency with "while", so a good close without the urgency line
        // could never check off. Single behavior; urgency stays in the lines.
        completionCriteria:
          "The trainee asks the prospect to commit to a specific next step, such as scheduling a tour, starting an application, or booking a follow-up.",
        suggestedLines: [
          "Our quietest units tend to go first, so I'd love to show you around. Would you be open to a tour this week?",
          "To get the best match and unit location, it helps to look early. Can we set up a quick visit to see the study spaces?",
          "Our floor plans fill up fast for the semester. Let's schedule a tour so you can see the layout in person.",
        ],
      },
    ],
    checkpoints: [
      {
        id: "discovery-questions",
        name: "Discovery questions",
        description:
          "The agent asks questions about the prospect's needs, current living situation, or desired amenities.",
        required: true,
        rubricKey: "c1",
      },
      {
        id: "empathy-acknowledge-concern",
        name: "Empathy / acknowledges concern",
        description:
          "The agent expresses empathy or acknowledges the roommate friction and study concerns.",
        required: true,
        rubricKey: "c2",
      },
      {
        id: "value-sell-study-spaces",
        name: "Value-sells study spaces",
        description:
          "The agent highlights study lounges, quiet amenities, or study-focused features as solutions.",
        required: true,
        rubricKey: "c3",
      },
      {
        id: "handles-roommate-fairness",
        name: "Handles roommate fairness",
        description:
          "The agent offers ideas for roommate compatibility (matching by lifestyle, single rooms, or agreements).",
        required: true,
        rubricKey: "c4",
      },
      {
        id: "introduces-urgency-ethically",
        name: "Introduces urgency ethically",
        description:
          "The agent honestly explains why deciding soon helps (e.g. best units/views lease out first) without pressure tactics.",
        required: true,
        rubricKey: "c5",
      },
      {
        id: "asks-for-next-step",
        name: "Asks for a next step",
        description:
          "The agent asks for a concrete next step: booking a tour, applying, or scheduling a follow-up.",
        required: true,
        rubricKey: "c5",
      },
    ],
    rubric: [
      {
        key: "c1",
        label: "Discovery Questions",
        description:
          "Quality and depth of questions about the prospect's needs, lifestyle, and current situation.",
      },
      {
        key: "c2",
        label: "Empathy / Acknowledgment",
        description:
          "How well the agent acknowledged frustrations and made the prospect feel heard.",
      },
      {
        key: "c3",
        label: "Value-Selling Study Spaces",
        description:
          "Effectiveness of positioning study lounges / quiet amenities as solutions to the prospect's pain.",
      },
      {
        key: "c4",
        label: "Handling Roommate Fairness",
        description:
          "Concreteness and credibility of roommate-matching / fairness solutions offered.",
      },
      {
        key: "c5",
        label: "Urgency & Next Steps",
        description:
          "Ethical urgency plus a clear ask for a tour, application, or follow-up.",
      },
    ],
    knobs: { silenceTimeoutSeconds: 30, maxDurationSeconds: 600, temperature: 0.6 },
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: "seed-exotic-pet-policy-university-trails",
    name: "Exotic Pet Policy — Curious Prospect",
    description:
      "A prospect with an exotic pet (a ball python) wants to know if it's allowed before they'll consider signing. Practice discovery, empathy, explaining the pet policy honestly, handling restrictions/deposits, ethical urgency, and closing.",
    personaPrompt: `You are calling University Trails apartments near UM North Campus in Ann Arbor. Your main concern is whether they allow exotic pets — you have a ball python, and a couple of other places already told you no, so you're a little anxious and guarded about asking. You really don't want to give up your pet, and you need to understand the rules (what species are allowed, any deposits, size or number limits) before you'll seriously consider signing. You're friendly but a bit nervous about the pet question. Sound authentic and relatable, not scripted.

Let the call unfold in roughly this order, at a natural pace:
1. Open by asking whether they allow exotic pets, or pets like yours.
2. Explain that you have a ball python and that you've had trouble finding pet-friendly places.
3. Answer the agent's questions in character; don't dump every detail at once — let them ask.
4. If the agent acknowledges your concern or reassures you kindly, warm up a little.
5. If they clearly explain the exotic-pet policy (what's allowed, deposits, any restrictions), show interest.
6. If they highlight pet-friendly features or nearby amenities (green space, a nearby vet, pet-washing station), respond positively.
7. If they're honest about any restrictions or deposits without being dismissive, appreciate the transparency.
8. If they explain — honestly — why deciding soon helps (e.g. limited pet-friendly units lease out first), agree you'd like to decide before too long.
9. If they ask for a next step (a tour, an application, a follow-up), respond like a real prospect would.
10. Keep playing the prospect until the agent wraps up or closes the call.`,
    firstMessage:
      "Hi, um, I'm looking at University Trails — before anything else, I kind of need to know: do you guys allow exotic pets? I've got a ball python, and honestly a couple places already told me no, so I'm a little nervous about it.",
    voice: { provider: "vapi", voiceId: "Elliot", label: "Elliot" },
    difficulty: "medium",
    speaksFirst: "prospect",
    spokenGrading: false,
    passThreshold: 70,
    // Regenerated 2026-08-02 via /api/roleplay/generate-waypoints
    // (gemini-3.5-flash; prompt in utils/roleplay/waypointGeneration.ts).
    waypoints: [
      {
        id: "validate-the-prospect-s-pet-anxiety",
        type: "objection",
        title: "Validate the prospect's pet anxiety",
        cue: "The prospect mentions being nervous because other places have already rejected their ball python.",
        completionCriteria:
          "The trainee verbally acknowledges the prospect's anxiety or previous negative experiences with other landlords regarding their pet.",
        suggestedLines: [
          "I completely understand why you'd be nervous after hearing that elsewhere, but don't worry, we can walk through this together.",
          "It can be really stressful trying to find a home for you and your pet, so let's see how we can make this work.",
        ],
      },
      {
        id: "gather-details-about-the-pet",
        type: "guidance",
        title: "Gather details about the pet",
        cue: "The prospect explains they have a ball python but hasn't shared details like its enclosure, size, or if they have other pets.",
        completionCriteria:
          "The trainee asks a question to clarify the specific details of the python's setup, size, or count.",
        suggestedLines: [
          "To make sure I give you the exact policy, how big is your python, and is it kept in a secure tank?",
          "Can I ask if you have just the one python, and what size enclosure it requires?",
        ],
      },
      {
        id: "explain-policy-and-verify-restrictions",
        type: "value",
        title: "Explain policy and verify restrictions",
        cue: "The prospect asks about the specific rules, deposits, or species limits for exotic pets.",
        completionCriteria:
          "The trainee offers to verify the community's specific exotic pet policies, deposits, or restrictions with management or the lease agreement.",
        suggestedLines: [
          "Let me double-check our exact policy on non-traditional pets and any associated deposits so I give you 100% accurate info.",
          "I want to make sure we get this right for your python, so let me confirm our specific tank-size limits and pet fees for you.",
        ],
      },
      {
        id: "secure-a-follow-up-or-tour",
        type: "guidance",
        title: "Secure a follow-up or tour",
        cue: "The prospect agrees that they want to make a decision soon before pet-friendly options fill up.",
        completionCriteria:
          "The trainee asks the prospect to schedule a specific next step, such as an in-person tour, a phone follow-up, or starting an application.",
        suggestedLines: [
          "Would you like to schedule a tour to come see the community and we can finalize the pet details in person?",
          "Can I schedule a quick follow-up call with you tomorrow once I have the official sign-off from our property manager?",
        ],
      },
    ],
    checkpoints: [
      {
        id: "discovery-questions",
        name: "Discovery questions",
        description:
          "The agent asks about the pet — species, size, number, and the prospect's needs — before answering.",
        required: true,
        rubricKey: "c1",
      },
      {
        id: "empathy-acknowledge-concern",
        name: "Empathy / acknowledges concern",
        description:
          "The agent acknowledges the prospect's worry about bringing their exotic pet and reassures them.",
        required: true,
        rubricKey: "c2",
      },
      {
        id: "explains-pet-policy",
        name: "Explains the pet policy",
        description:
          "The agent clearly states whether exotic pets are allowed and the relevant rules (species, limits).",
        required: true,
        rubricKey: "c3",
      },
      {
        id: "handles-restrictions-deposits",
        name: "Handles restrictions & deposits honestly",
        description:
          "The agent is transparent about any deposits, fees, or restrictions without being dismissive.",
        required: true,
        rubricKey: "c4",
      },
      {
        id: "introduces-urgency-ethically",
        name: "Introduces urgency ethically",
        description:
          "The agent honestly explains why deciding soon helps (e.g. limited pet-friendly units) without pressure tactics.",
        required: true,
        rubricKey: "c5",
      },
      {
        id: "asks-for-next-step",
        name: "Asks for a next step",
        description:
          "The agent asks for a concrete next step: booking a tour, applying, or scheduling a follow-up.",
        required: true,
        rubricKey: "c5",
      },
    ],
    rubric: [
      {
        key: "c1",
        label: "Discovery Questions",
        description:
          "Quality of questions about the specific pet (species, size, count) and the prospect's needs.",
      },
      {
        key: "c2",
        label: "Empathy / Acknowledgment",
        description:
          "How well the agent acknowledged the prospect's anxiety about their pet and made them feel heard.",
      },
      {
        key: "c3",
        label: "Pet Policy Clarity & Value",
        description:
          "Clarity and positivity in explaining the exotic-pet policy and any pet-friendly features/amenities.",
      },
      {
        key: "c4",
        label: "Handling Restrictions & Deposits",
        description:
          "Honesty and tact about deposits, fees, or restrictions without killing the deal or being dismissive.",
      },
      {
        key: "c5",
        label: "Urgency & Next Steps",
        description: "Ethical urgency plus a clear ask for a tour, application, or follow-up.",
      },
    ],
    knobs: { silenceTimeoutSeconds: 30, maxDurationSeconds: 600, temperature: 0.6 },
    createdAt: NOW,
    updatedAt: NOW,
  },
];
