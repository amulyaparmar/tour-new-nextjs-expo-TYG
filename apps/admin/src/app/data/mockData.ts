// Shared mock data for the admin/manager platform

export const properties = [
  { id: "p1", name: "The Meridian" },
  { id: "p2", name: "Parkview Lofts" },
  { id: "p3", name: "Cedar Commons" },
  { id: "p4", name: "Riverton Heights" },
];

export const agents = [
  {
    id: "a1",
    name: "Sarah K.",
    full: "Sarah Kowalski",
    role: "Senior Leasing Agent",
    propertyId: "p1",
    toursThisMonth: 14,
    avgScore: 87,
    trend: "up" as const,
    weeklyScores: [78, 80, 83, 82, 85, 88, 87, 89],
    rubricBreakdown: [
      { axis: "Opening", score: 93 },
      { axis: "Discovery", score: 85 },
      { axis: "Showcase", score: 90 },
      { axis: "Objections", score: 82 },
      { axis: "Closing", score: 88 },
      { axis: "Follow-up", score: 80 },
    ],
    coachingCount: 9,
  },
  {
    id: "a2",
    name: "Marcus T.",
    full: "Marcus Torres",
    role: "Leasing Agent",
    propertyId: "p2",
    toursThisMonth: 11,
    avgScore: 76,
    trend: "up" as const,
    weeklyScores: [68, 70, 72, 75, 74, 76, 77, 76],
    rubricBreakdown: [
      { axis: "Opening", score: 80 },
      { axis: "Discovery", score: 72 },
      { axis: "Showcase", score: 78 },
      { axis: "Objections", score: 70 },
      { axis: "Closing", score: 75 },
      { axis: "Follow-up", score: 80 },
    ],
    coachingCount: 14,
  },
  {
    id: "a3",
    name: "James R.",
    full: "James Rivera",
    role: "Leasing Agent",
    propertyId: "p3",
    toursThisMonth: 9,
    avgScore: 68,
    trend: "down" as const,
    weeklyScores: [72, 70, 69, 71, 68, 66, 68, 68],
    rubricBreakdown: [
      { axis: "Opening", score: 75 },
      { axis: "Discovery", score: 60 },
      { axis: "Showcase", score: 70 },
      { axis: "Objections", score: 58 },
      { axis: "Closing", score: 65 },
      { axis: "Follow-up", score: 60 },
    ],
    coachingCount: 22,
  },
  {
    id: "a4",
    name: "Priya S.",
    full: "Priya Sharma",
    role: "Senior Leasing Agent",
    propertyId: "p4",
    toursThisMonth: 12,
    avgScore: 83,
    trend: "up" as const,
    weeklyScores: [76, 78, 80, 79, 82, 83, 84, 83],
    rubricBreakdown: [
      { axis: "Opening", score: 88 },
      { axis: "Discovery", score: 82 },
      { axis: "Showcase", score: 84 },
      { axis: "Objections", score: 78 },
      { axis: "Closing", score: 82 },
      { axis: "Follow-up", score: 85 },
    ],
    coachingCount: 6,
  },
];

export const teamRadar = [
  { axis: "Opening", score: 84 },
  { axis: "Discovery", score: 75 },
  { axis: "Showcase", score: 80 },
  { axis: "Objections", score: 72 },
  { axis: "Closing", score: 77 },
  { axis: "Follow-up", score: 76 },
];

export const rubrics = [
  {
    id: "r1",
    name: "Standard Leasing Rubric",
    version: "v2",
    status: "active" as const,
    propertyIds: ["p1", "p2", "p3", "p4"],
    sessionCount: 47,
    lastUpdated: "Jun 1, 2026",
    categories: [
      {
        name: "Opening & Rapport",
        weight: 15,
        description: "Warmth of greeting, use of prospect's name, establishing comfort.",
        criteria: [
          "Greets prospect by name within first 30 seconds",
          "Makes genuine personal connection before discussing property",
          "Sets clear agenda for the tour",
        ],
      },
      {
        name: "Needs Discovery",
        weight: 20,
        description: "Depth of questions around timeline, lifestyle, and priorities.",
        criteria: [
          "Asks about move-in timeline",
          "Identifies must-have vs nice-to-have features",
          "Explores lifestyle context (WFH, pets, roommates, etc.)",
          "Listens actively and reflects back",
        ],
      },
      {
        name: "Property Showcase",
        weight: 25,
        description: "Quality of unit and amenity presentation tied to prospect needs.",
        criteria: [
          "Highlights at least 3 amenities with specific benefits",
          "Connects features to stated prospect needs",
          "Uses sensory language and storytelling",
          "Avoids reading off a feature list",
        ],
      },
      {
        name: "Objection Handling",
        weight: 20,
        description: "Skillful acknowledgment and resolution of price, size, or timeline objections.",
        criteria: [
          "Validates objection before responding",
          "Offers an alternative or reframe",
          "Does not drop price without offering value first",
          "Keeps the conversation moving forward",
        ],
      },
      {
        name: "Closing",
        weight: 10,
        description: "Directness in asking for commitment or next steps.",
        criteria: [
          "Explicitly asks about interest level",
          "Proposes a clear next step",
          "Confirms decision timeline",
        ],
      },
      {
        name: "Follow-up Setup",
        weight: 10,
        description: "Locking in a specific follow-up date and action before leaving.",
        criteria: [
          "Captures contact info and preferred communication method",
          "Sets a specific follow-up date (not 'I'll reach out soon')",
          "Summarizes what will be sent / shared",
        ],
      },
    ],
  },
  {
    id: "r2",
    name: "Luxury Tier Rubric",
    version: "v1",
    status: "draft" as const,
    propertyIds: ["p4"],
    sessionCount: 0,
    lastUpdated: "Jun 18, 2026",
    categories: [
      {
        name: "White-Glove Welcome",
        weight: 20,
        description: "Elevated greeting befitting a luxury property.",
        criteria: [
          "Offers refreshment or personalized welcome item",
          "Addresses prospect formally unless directed otherwise",
        ],
      },
      {
        name: "Lifestyle Alignment",
        weight: 30,
        description: "Deeply connecting the property to an aspirational lifestyle.",
        criteria: [
          "Asks about aspirations, not just needs",
          "Paints a picture of daily life in the property",
        ],
      },
      {
        name: "Exclusive Showcase",
        weight: 30,
        description: "Presentation of premium finishes and exclusivity cues.",
        criteria: [
          "Names materials and brands (Sub-Zero, Miele, etc.)",
          "Highlights scarcity of available units",
        ],
      },
      {
        name: "Concierge Close",
        weight: 20,
        description: "High-touch close with white-glove next steps.",
        criteria: [
          "Offers to personally coordinate next steps",
          "Provides a printed or digital summary package",
        ],
      },
    ],
  },
];

export const sessions = [
  {
    id: 1, prospect: "Jordan Mitchell", unit: "2B – 850 sqft", propertyId: "p1",
    property: "The Meridian", date: "Jun 12, 2026", duration: "24:18",
    score: 91, status: "scored" as const, agentId: "a1", agent: "Sarah K.",
    tags: ["strong close", "needs follow-up"], rubricId: "r1",
  },
  {
    id: 2, prospect: "Priya Nair", unit: "1A – 620 sqft", propertyId: "p2",
    property: "Parkview Lofts", date: "Jun 12, 2026", duration: "18:04",
    score: 74, status: "scored" as const, agentId: "a2", agent: "Marcus T.",
    tags: ["price objection"], rubricId: "r1",
  },
  {
    id: 3, prospect: "Derek Chen", unit: "3C – 1,100 sqft", propertyId: "p1",
    property: "The Meridian", date: "Jun 11, 2026", duration: "31:45",
    score: 88, status: "scored" as const, agentId: "a1", agent: "Sarah K.",
    tags: ["excellent rapport"], rubricId: "r1",
  },
  {
    id: 4, prospect: "Aaliyah Washington", unit: "Studio – 480 sqft", propertyId: "p3",
    property: "Cedar Commons", date: "Jun 11, 2026", duration: "12:30",
    score: 62, status: "scored" as const, agentId: "a3", agent: "James R.",
    tags: ["low engagement"], rubricId: "r1",
  },
  {
    id: 5, prospect: "Tom Okafor", unit: "2B – 900 sqft", propertyId: "p2",
    property: "Parkview Lofts", date: "Jun 10, 2026", duration: "27:12",
    score: null, status: "processing" as const, agentId: "a2", agent: "Marcus T.",
    tags: [], rubricId: "r1",
  },
  {
    id: 6, prospect: "Lena Fischer", unit: "1B – 720 sqft", propertyId: "p3",
    property: "Cedar Commons", date: "Jun 9, 2026", duration: "21:05",
    score: 79, status: "scored" as const, agentId: "a3", agent: "James R.",
    tags: ["amenities tour"], rubricId: "r1",
  },
  {
    id: 7, prospect: "Marcus Webb", unit: "2A – 800 sqft", propertyId: "p4",
    property: "Riverton Heights", date: "Jun 9, 2026", duration: "28:50",
    score: 85, status: "scored" as const, agentId: "a4", agent: "Priya S.",
    tags: ["strong discovery"], rubricId: "r1",
  },
  {
    id: 8, prospect: "Keiko Tanaka", unit: "1B – 680 sqft", propertyId: "p4",
    property: "Riverton Heights", date: "Jun 8, 2026", duration: "19:22",
    score: 78, status: "scored" as const, agentId: "a4", agent: "Priya S.",
    tags: [], rubricId: "r1",
  },
  {
    id: 9, prospect: "Elijah Brooks", unit: "3B – 1,050 sqft", propertyId: "p1",
    property: "The Meridian", date: "Jun 7, 2026", duration: "33:10",
    score: 55, status: "scored" as const, agentId: "a3", agent: "James R.",
    tags: ["missed close"], rubricId: "r1",
  },
  {
    id: 10, prospect: "Sofia Reyes", unit: "Studio – 500 sqft", propertyId: "p2",
    property: "Parkview Lofts", date: "Jun 6, 2026", duration: "15:48",
    score: 92, status: "scored" as const, agentId: "a1", agent: "Sarah K.",
    tags: ["top score"], rubricId: "r1",
  },
];

export const prospects = [
  {
    id: "pr1", name: "Jordan Mitchell", email: "jordan.mitchell@gmail.com", phone: "312-555-0182",
    propertyId: "p1", property: "The Meridian", unit: "2B – 850 sqft",
    agentId: "a1", agent: "Sarah K.", tourSessionId: 1, tourDate: "Jun 12, 2026",
    score: 91, followUpStatus: "sent" as const,
    lastContact: "Jun 13, 2026", nextFollowUp: "Jun 20, 2026",
    notes: [
      { text: "Called to confirm tour summary was received. Very engaged.", timestamp: "Jun 13, 2026 10:14 AM", author: "Sarah K." },
      { text: "Expressed interest in the 2B corner unit. Partner working remotely — co-working lounge was a selling point.", timestamp: "Jun 12, 2026 3:00 PM", author: "Sarah K." },
    ],
    followUpActions: [
      "Send side-by-side comparison of 2B and 1B+ floor plans with photos.",
      "Share the move-in special details for both units in writing.",
      "Schedule a follow-up call — April/May move-in window means moderate urgency.",
      "Add Jordan to WFH lifestyle newsletter.",
    ],
  },
  {
    id: "pr2", name: "Priya Nair", email: "priya.nair@outlook.com", phone: "773-555-0247",
    propertyId: "p2", property: "Parkview Lofts", unit: "1A – 620 sqft",
    agentId: "a2", agent: "Marcus T.", tourSessionId: 2, tourDate: "Jun 12, 2026",
    score: 74, followUpStatus: "pending" as const,
    lastContact: "Jun 12, 2026", nextFollowUp: "Jun 14, 2026",
    notes: [],
    followUpActions: [
      "Send pricing sheet with current specials.",
      "Address price concern — highlight effective monthly rate with move-in special.",
      "Follow up within 24 hours while interest is warm.",
    ],
  },
  {
    id: "pr3", name: "Derek Chen", email: "derek.chen@proton.me", phone: "847-555-0391",
    propertyId: "p1", property: "The Meridian", unit: "3C – 1,100 sqft",
    agentId: "a1", agent: "Sarah K.", tourSessionId: 3, tourDate: "Jun 11, 2026",
    score: 88, followUpStatus: "converted" as const,
    lastContact: "Jun 14, 2026", nextFollowUp: null,
    notes: [
      { text: "Application submitted. Move-in confirmed for July 1.", timestamp: "Jun 14, 2026 2:30 PM", author: "Sarah K." },
    ],
    followUpActions: [
      "Send lease signing instructions.",
      "Coordinate move-in walkthrough.",
    ],
  },
  {
    id: "pr4", name: "Aaliyah Washington", email: "aaliyah.w@gmail.com", phone: "630-555-0158",
    propertyId: "p3", property: "Cedar Commons", unit: "Studio – 480 sqft",
    agentId: "a3", agent: "James R.", tourSessionId: 4, tourDate: "Jun 11, 2026",
    score: 62, followUpStatus: "lost" as const,
    lastContact: "Jun 12, 2026", nextFollowUp: null,
    notes: [
      { text: "Prospect found a unit elsewhere. Marked as lost.", timestamp: "Jun 15, 2026 9:00 AM", author: "Manager – Rachel P." },
    ],
    followUpActions: [
      "Send thank-you note and invite to re-engage if plans change.",
    ],
  },
  {
    id: "pr5", name: "Tom Okafor", email: "t.okafor@me.com", phone: "312-555-0449",
    propertyId: "p2", property: "Parkview Lofts", unit: "2B – 900 sqft",
    agentId: "a2", agent: "Marcus T.", tourSessionId: 5, tourDate: "Jun 10, 2026",
    score: null, followUpStatus: "pending" as const,
    lastContact: "Jun 10, 2026", nextFollowUp: "Jun 14, 2026",
    notes: [],
    followUpActions: [],
  },
  {
    id: "pr6", name: "Lena Fischer", email: "lena.fischer@gmail.com", phone: "708-555-0274",
    propertyId: "p3", property: "Cedar Commons", unit: "1B – 720 sqft",
    agentId: "a3", agent: "James R.", tourSessionId: 6, tourDate: "Jun 9, 2026",
    score: 79, followUpStatus: "sent" as const,
    lastContact: "Jun 11, 2026", nextFollowUp: "Jun 18, 2026",
    notes: [
      { text: "Sent amenity brochure and pricing comparison.", timestamp: "Jun 11, 2026 11:20 AM", author: "James R." },
    ],
    followUpActions: [
      "Share community event calendar.",
      "Invite for a second tour of the 2B unit.",
    ],
  },
  {
    id: "pr7", name: "Marcus Webb", email: "m.webb@icloud.com", phone: "847-555-0612",
    propertyId: "p4", property: "Riverton Heights", unit: "2A – 800 sqft",
    agentId: "a4", agent: "Priya S.", tourSessionId: 7, tourDate: "Jun 9, 2026",
    score: 85, followUpStatus: "sent" as const,
    lastContact: "Jun 10, 2026", nextFollowUp: "Jun 16, 2026",
    notes: [],
    followUpActions: [
      "Send virtual tour link for 2B unit.",
      "Confirm pet policy details — prospect has a dog.",
    ],
  },
  {
    id: "pr8", name: "Elijah Brooks", email: "elijah.b@gmail.com", phone: "773-555-0823",
    propertyId: "p1", property: "The Meridian", unit: "3B – 1,050 sqft",
    agentId: "a3", agent: "James R.", tourSessionId: 9, tourDate: "Jun 7, 2026",
    score: 55, followUpStatus: "pending" as const,
    lastContact: "Jun 7, 2026", nextFollowUp: "Jun 14, 2026",
    notes: [
      { text: "Tour felt rushed. Recommend Sarah handles follow-up call.", timestamp: "Jun 8, 2026 9:00 AM", author: "Manager – Rachel P." },
    ],
    followUpActions: [
      "Reassign follow-up to senior agent.",
      "Send building overview video and floor plan.",
    ],
  },
];

export const trendData = [
  { week: "May W1", avg: 71, "Sarah K.": 78, "Marcus T.": 68, "James R.": 72, "Priya S.": 76 },
  { week: "May W2", avg: 74, "Sarah K.": 80, "Marcus T.": 70, "James R.": 70, "Priya S.": 78 },
  { week: "May W3", avg: 76, "Sarah K.": 83, "Marcus T.": 72, "James R.": 69, "Priya S.": 80 },
  { week: "May W4", avg: 73, "Sarah K.": 82, "Marcus T.": 75, "James R.": 71, "Priya S.": 79 },
  { week: "Jun W1", avg: 80, "Sarah K.": 85, "Marcus T.": 74, "James R.": 68, "Priya S.": 82 },
  { week: "Jun W2", avg: 79, "Sarah K.": 88, "Marcus T.": 76, "James R.": 66, "Priya S.": 83 },
];

export const scoreDistribution = [
  { band: "0–59", count: 2 },
  { band: "60–69", count: 1 },
  { band: "70–79", count: 3 },
  { band: "80–89", count: 3 },
  { band: "90–100", count: 2 },
];

export const funnelData = [
  { stage: "Tours", value: 46 },
  { stage: "Applications", value: 28 },
  { stage: "Leases", value: 17 },
];
