/**
 * Seed the Apartment Phone Shop rubric into Supabase.
 * Run: node --env-file=../../.env apps/web/scripts/seed-phone-shop-rubric.mjs
 */

import { createClient } from "@supabase/supabase-js";

const COMPANY_ID = "d462848a-a662-4363-ab02-2e3e3092ae1d";
const PROPERTY_ID = "community:548";

const PHONE_SHOP_SEGMENTATION_PROMPT = [
  "You are an expert leasing coach reviewing apartment telephone shop calls.",
  "",
  "Segment this phone call into coach-facing sections based on natural transitions — greeting/opening, discovery/qualification, presentation/value building, pricing/objection handling, and closing/tour booking.",
  "",
  "How to segment:",
  "- Use specific titles (e.g. \"Opening & Community Intro\", \"Rapport & Qualification\", \"Value Before Rates\", \"Price Deflection\", \"Tour Close Attempt\")",
  "- 2–4 bullet highlights per section with coaching callouts (missed contact capture, rate given too early, weak close, etc.)",
  "- Use startTime/endTime in seconds from the transcript",
  "- Cover the full call chronologically",
  "",
  "In structureNotes, summarize the most critical coaching gaps (e.g. gave rates before value, failed to book tour, no urgency).",
].join("\n");

const definition = {
  notes:
    "Telephone leasing shop rubric (135 points). Score each item YES (full points) or NO (0) from call transcript evidence. " +
    "Evaluate call control (ARP), rapport, value-before-rates, price deflection (3+), tour booking priority, and direct close attempts (2+). " +
    "Pre-shop coaching focus: lead capture, rapport building, turning utility questions into value, and booking the tour.",
  sections: [
    {
      name: "Opening & Call Control",
      items: [
        {
          id: "P101",
          text: "Did the leasing professional ask for your contact information at the beginning of the call? (Name or Phone number, Email?)",
          points: 10,
        },
        {
          id: "P102",
          text: "Did the leasing professional use your name during the telephone presentation?",
          points: 5,
        },
        {
          id: "P103",
          text: "Did the leasing professional answer with the name of the community and introduce him/herself?",
          points: 5,
        },
        {
          id: "P104",
          text: "Did the leasing professional take control of the call using ARP and proceed to collecting contact information?",
          points: 5,
        },
        {
          id: "P105",
          text: "Did the leasing professional convey a warm and inviting attitude?",
          points: 5,
        },
      ],
    },
    {
      name: "Discovery & Qualification",
      items: [
        {
          id: "P201",
          text: "Did the leasing professional ask how you heard about the community?",
          points: 5,
        },
        {
          id: "P202",
          text: "Did the leasing professional determine the preferred floorplan?",
          points: 5,
        },
        {
          id: "P203",
          text: "Did the leasing professional determine preferred move-in date?",
          points: 5,
        },
        {
          id: "P204",
          text: "Did the leasing professional ask at least 3 intentional rapport building questions to get to identify your motivation for moving and desires in your new home?",
          points: 10,
        },
      ],
    },
    {
      name: "Presentation & Value",
      items: [
        {
          id: "P301",
          text: "Did the leasing professional describe apartment features and/or community amenities?",
          points: 10,
        },
        {
          id: "P302",
          text: "Did the leasing professional use information discovered during rapport building to add value to apartment features and/or community amenities?",
          points: 10,
        },
        {
          id: "P303",
          text: "Did the leasing professional create value in the property before quoting any rates or specials?",
          points: 10,
        },
        {
          id: "P304",
          text: "Did the leasing professional avoid giving the rates over the phone by price deflecting at least three times?",
          points: 10,
        },
      ],
    },
    {
      name: "Closing & Tour Booking",
      items: [
        {
          id: "P401",
          text: "Did the leasing professional suggest a tour time and date and encourage the lead to see the property?",
          points: 10,
        },
        {
          id: "P402",
          text: "Did the leasing professional prioritize booking a tour with you over the phone rather than making the call all about amenities, prices and specials?",
          points: 10,
        },
        {
          id: "P403",
          text: "Did the leasing professional create a sense of urgency?",
          points: 10,
        },
        {
          id: "P404",
          text: "Did the leasing professional attempt to direct close or ask for the sale at least twice?",
          points: 10,
        },
      ],
    },
  ],
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const { data: existing } = await supabase
  .from("rubrics")
  .select("id, name")
  .eq("name", "Apartment Phone Shop")
  .maybeSingle();

if (existing) {
  console.log("Rubric already exists:", existing.id, existing.name);
  process.exit(0);
}

const { data: rubric, error } = await supabase
  .from("rubrics")
  .insert({
    name: "Apartment Phone Shop",
    definition,
    session_type: "call",
    segmentation_prompt: PHONE_SHOP_SEGMENTATION_PROMPT,
    analysis_model: "claude-sonnet-4.5",
    is_default: false,
    company_id: COMPANY_ID,
  })
  .select("id, name, session_type")
  .single();

if (error) {
  console.error("Failed to create rubric:", error.message);
  process.exit(1);
}

const { error: assignErr } = await supabase.from("rubric_communities").upsert({
  rubric_id: rubric.id,
  property_id: PROPERTY_ID,
});

if (assignErr) {
  console.error("Rubric created but assignment failed:", assignErr.message);
  process.exit(1);
}

const totalPoints = definition.sections.reduce(
  (sum, section) => sum + section.items.reduce((s, item) => s + item.points, 0),
  0
);

console.log("Created rubric:", rubric.id);
console.log("Name:", rubric.name);
console.log("Session type:", rubric.session_type);
console.log("Total points:", totalPoints);
console.log("Assigned to:", PROPERTY_ID);
