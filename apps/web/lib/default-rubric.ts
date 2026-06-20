import type { RubricDefinition } from "@tour/shared";

/** Official RBG Apartment In-Person Tour rubric (200 points). */
export const DEFAULT_RBG_RUBRIC_DEFINITION: RubricDefinition = {
  scoringInstructions:
    "Score each question YES (full points) or NO (0) based on transcript evidence. " +
    "Convert each section to 0-100: round(pointsEarned / sectionMax * 100). " +
    "overallScore = round(totalPointsEarned / totalPointsPossible * 100). " +
    "Give benefit of the doubt ONLY for Q160 and Q230 (visual items). Otherwise score 0 if not evidenced.",
  sections: [
    {
      id: "greeting",
      name: "The Greeting",
      maxPoints: 50,
      questions: [
        { id: "Q110", question: "Did the Leasing Professional stand and greet promptly, or acknowledge the prospect if busy?", maxPoints: 10 },
        { id: "Q120", question: "Did the Leasing Professional introduce themselves?", maxPoints: 5 },
        { id: "Q130", question: "Did the Leasing Professional give undivided attention throughout the tour?", maxPoints: 5 },
        { id: "Q140", question: "Did the Leasing Professional complete a guest card or confirm information given over the phone?", maxPoints: 10 },
        {
          id: "Q150",
          question:
            "Was the following information asked: school classification, desired move-in date/term, how they heard about the property, 3 things they look for in an apartment, telephone number?",
          maxPoints: 10,
          guidance: "2 points each for the five items, 10 pts max"
        },
        { id: "Q160", question: "Did the Leasing Professional ask for a photo ID before the tour?", maxPoints: 5 },
        { id: "Q170", question: "Did the Leasing Professional do an overview of what the tour would consist of prior to starting?", maxPoints: 5 }
      ]
    },
    {
      id: "tour",
      name: "Property Tour & Demonstration",
      maxPoints: 80,
      questions: [
        { id: "Q205", question: "Did the Leasing Professional take control of the presentation?", maxPoints: 5 },
        { id: "Q210", question: "Did the Leasing Professional use the information gathered to personalize the presentation?", maxPoints: 10 },
        { id: "Q215", question: "Did the Leasing Professional use the prospect's name throughout the presentation?", maxPoints: 5 },
        { id: "Q220", question: "Was the Leasing Professional knowledgeable about the apartment community?", maxPoints: 10 },
        { id: "Q225", question: "Did the Leasing Professional sell the benefits and features of the apartment and community?", maxPoints: 10 },
        { id: "Q230", question: "Did the Leasing Professional show an apartment or model that was clean, made ready & comfortable in temperature?", maxPoints: 10 },
        { id: "Q235", question: "Did the Leasing Professional offer a snack or refreshment from a fully stocked fridge/freezer?", maxPoints: 5 },
        { id: "Q240", question: "Did the Leasing Professional highlight different features of the apartment and show how they are beneficial?", maxPoints: 5 },
        { id: "Q245", question: "Did the Leasing Professional tailor the presentation to the prospect's needs?", maxPoints: 5 },
        { id: "Q255", question: "Did the Leasing Professional overcome the objection stated during the demonstration?", maxPoints: 10 },
        { id: "Q260", question: "Did the Leasing Professional inquire which other communities were visited and offer a positive comparison?", maxPoints: 5 }
      ]
    },
    {
      id: "closing",
      name: "Closing Techniques",
      maxPoints: 65,
      questions: [
        { id: "Q305", question: "Did the Leasing Professional sit the prospect down at a computer or iPad and explain the application details?", maxPoints: 15 },
        { id: "Q310", question: "Did the Leasing Professional seem well versed in all rental rates?", maxPoints: 5 },
        { id: "Q315", question: "Did the Leasing Professional attempt to sell premium-price amenities while going over floor plans and rates?", maxPoints: 5 },
        { id: "Q320", question: "Did the Leasing Professional discuss the rental guarantor/qualification procedures?", maxPoints: 5 },
        { id: "Q325", question: "Did the Leasing Professional review the floor plan and rate sheet?", maxPoints: 10 },
        { id: "Q330", question: "Did the Leasing Professional convey a strong sense of urgency to rent today?", maxPoints: 5 },
        { id: "Q335", question: "Did the Leasing Professional ask if the prospect was ready to sign the lease today?", maxPoints: 15 },
        { id: "Q340", question: "Did the Leasing Professional effectively uncover and overcome objections for not leasing?", maxPoints: 5 }
      ]
    },
    {
      id: "follow-up",
      name: "Follow Up",
      maxPoints: 5,
      questions: [
        {
          id: "Q410",
          question: "Did the prospect receive a follow-up email, phone call, or text message within 24 hours of the visit?",
          maxPoints: 5,
          guidance: "If post-visit follow-up is not in the recording, score based on whether a follow-up plan was set during the visit."
        }
      ]
    }
  ],
  complianceQuestions: [
    { id: "Q510", question: "Did the Leasing Consultant steer the prospect to a specific area in an attempt to segregate?", maxPoints: 0, guidance: "Flag only — do not deduct points" },
    { id: "Q520", question: "Did the prospect feel discriminated against in any way?", maxPoints: 0, guidance: "Flag only — do not deduct points" }
  ]
};

export const DEFAULT_RBG_RUBRIC_NAME = "RBG Apartment In-Person Tour";
export const DEFAULT_RBG_RUBRIC_DESCRIPTION =
  "Official Reality Based Group evaluation rubric for apartment in-person leasing tours (200 points).";

export function computeRubricTotalPoints(definition: RubricDefinition): number {
  return definition.sections.reduce((sum, section) => sum + section.maxPoints, 0);
}

export function countRubricQuestions(definition: RubricDefinition): number {
  return definition.sections.reduce((sum, section) => sum + section.questions.length, 0);
}
