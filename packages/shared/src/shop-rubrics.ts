export type ShopRubricType = "in_person_shop" | "phone_ai_shop";

export type ShopRubricItem = {
  id: string;
  label: string;
  maxScore: number;
  prompt: string;
  sourceSummary?: string;
  evidenceSegmentIds?: readonly string[];
};

export type ShopRubric = {
  id: string;
  type: ShopRubricType;
  title: string;
  source: string;
  totalPossible: number;
  preShopPrompts?: readonly string[];
  items: readonly ShopRubricItem[];
};

export const inPersonShopRubric = {
  id: "in-person-tour-shop",
  type: "in_person_shop",
  title: "In-person tour shop rubric",
  source: "apps/web/app/tour-ridealong/demoData.ts",
  totalPossible: 60,
  items: [
    {
      id: "problem-framing",
      label: "Problem framing",
      maxScore: 10,
      prompt: "Did the leasing conversation clearly frame the shopper/prospect problem, tour need, or buying context?",
      sourceSummary: "The core problem was framed clearly as review of real in-person sales or tour conversations.",
      evidenceSegmentIds: ["seg-006", "seg-008", "seg-009"]
    },
    {
      id: "discovery-clarity",
      label: "Discovery clarity",
      maxScore: 10,
      prompt: "Did the leasing professional ask clear discovery questions before recommending a solution, feature, unit, or next step?",
      sourceSummary: "Both speakers asked clarifying questions before committing to a solution direction.",
      evidenceSegmentIds: ["seg-002", "seg-005", "seg-022"]
    },
    {
      id: "co-creation",
      label: "Collaborative co-creation",
      maxScore: 10,
      prompt: "Did the conversation build with the prospect instead of only presenting information, including specific coaching, rewrites, or alternatives?",
      sourceSummary: "Speaker 1 improved the product by adding transcript-level point gain/loss and rewrite guidance.",
      evidenceSegmentIds: ["seg-013", "seg-014", "seg-015"]
    },
    {
      id: "actionable-specificity",
      label: "Actionable specificity",
      maxScore: 10,
      prompt: "Did the leasing professional make the next recommendation concrete enough to act on?",
      sourceSummary: "The feature set became concrete, but the conversation could have locked the first UI route sooner.",
      evidenceSegmentIds: ["seg-013", "seg-024", "seg-028"]
    },
    {
      id: "tone-pacing",
      label: "Tone and pacing",
      maxScore: 10,
      prompt: "Was the tone open, professional, and paced well enough for the prospect to follow and engage?",
      sourceSummary: "The tone was open and collaborative, with some repetition while the concept was being shaped.",
      evidenceSegmentIds: ["seg-017", "seg-018", "seg-021"]
    },
    {
      id: "next-step",
      label: "Next-step definition",
      maxScore: 10,
      prompt: "Did the conversation close with a specific owner, route, tour commitment, or follow-up action?",
      sourceSummary: "The direction was strong, but the close needed a crisper implementation commitment.",
      evidenceSegmentIds: ["seg-024", "seg-028"]
    }
  ]
} as const satisfies ShopRubric;

export const phoneAiShopRubric = {
  id: "phone-ai-leasing-shop",
  type: "phone_ai_shop",
  title: "Phone AI leasing shop rubric",
  source: "usevoice.ai-TYG/components/popups/AiRubricPopup.tsx and usevoice.ai-TYG/app/api/twilio/openaiTYG/route.tsx",
  totalPossible: 135,
  preShopPrompts: [
    "How are you going to turn this conversation into a lead?",
    "How are you going to build rapport?",
    "Turn questions about utilities into conversations about features, mandates, and locations.",
    "How are you going to provide value to capture the lead information?"
  ],
  items: [
    {
      id: "contact-info-at-start",
      label: "Contact information collected at beginning",
      maxScore: 10,
      prompt: "Did the leasing professional ask for contact information at the beginning of the call, including name, phone number, or email?"
    },
    {
      id: "used-shopper-name",
      label: "Used shopper name",
      maxScore: 5,
      prompt: "Did the leasing professional use the shopper's name during the telephone presentation?"
    },
    {
      id: "created-urgency",
      label: "Created urgency",
      maxScore: 10,
      prompt: "Did the leasing professional create a sense of urgency?"
    },
    {
      id: "source-attribution",
      label: "Asked source",
      maxScore: 5,
      prompt: "Did the leasing professional ask how the shopper heard about the community?"
    },
    {
      id: "warm-attitude",
      label: "Warm and inviting attitude",
      maxScore: 5,
      prompt: "Did the leasing professional convey a warm and inviting attitude?"
    },
    {
      id: "suggested-tour-time",
      label: "Suggested tour time",
      maxScore: 10,
      prompt: "Did the leasing professional suggest a tour time and date and encourage the lead to see the property?"
    },
    {
      id: "created-value-before-rates",
      label: "Created value before rates",
      maxScore: 10,
      prompt: "Did the leasing professional create value in the property before quoting any rates or specials?"
    },
    {
      id: "direct-close-twice",
      label: "Direct close attempts",
      maxScore: 10,
      prompt: "Did the leasing professional attempt to direct close or ask for the sale at least twice?"
    },
    {
      id: "price-deflection",
      label: "Price deflection",
      maxScore: 10,
      prompt: "Did the leasing professional avoid giving rates over the phone by price deflecting at least three times?"
    },
    {
      id: "arp-control",
      label: "ARP call control",
      maxScore: 5,
      prompt: "Did the leasing professional take control of the call using ARP and proceed to collecting contact information?"
    },
    {
      id: "community-and-intro",
      label: "Community name and intro",
      maxScore: 5,
      prompt: "Did the leasing professional answer with the name of the community and introduce themself?"
    },
    {
      id: "preferred-floorplan",
      label: "Preferred floorplan",
      maxScore: 5,
      prompt: "Did the leasing professional determine the preferred floorplan?"
    },
    {
      id: "preferred-move-in-date",
      label: "Preferred move-in date",
      maxScore: 5,
      prompt: "Did the leasing professional determine the preferred move-in date?"
    },
    {
      id: "tour-over-info-dump",
      label: "Prioritized booking a tour",
      maxScore: 10,
      prompt: "Did the leasing professional prioritize booking a tour over making the call all about amenities, prices, and specials?"
    },
    {
      id: "rapport-questions",
      label: "Rapport questions",
      maxScore: 10,
      prompt: "Did the leasing professional ask at least three intentional rapport-building questions to identify motivation for moving and desires in the new home?"
    },
    {
      id: "used-rapport-to-add-value",
      label: "Used rapport to add value",
      maxScore: 10,
      prompt: "Did the leasing professional use information discovered during rapport building to add value to apartment features or community amenities?"
    },
    {
      id: "described-features-amenities",
      label: "Described features and amenities",
      maxScore: 10,
      prompt: "Did the leasing professional describe apartment features or community amenities?"
    }
  ]
} as const satisfies ShopRubric;

export const shopRubrics = [inPersonShopRubric, phoneAiShopRubric] as const;
