import type { RubricDefinition } from "@tour/shared";

export { rubricItemCount, rubricTotalPoints, sectionPoints } from "@tour/shared";

/** Official RBG Apartment In-Person Tour rubric (200 points). */
export const DEFAULT_RBG_RUBRIC_DEFINITION: RubricDefinition = {
  notes:
    "Score each item YES (full points) or NO (0) based on transcript evidence. " +
    "Convert each section to 0-100: round(pointsEarned / sectionMax * 100). " +
    "overallScore = round(totalPointsEarned / totalPointsPossible * 100). " +
    "Give benefit of the doubt ONLY for Q160 and Q230 (visual items). Otherwise score 0 if not evidenced.",
  sections: [
    {
      name: "The Greeting",
      items: [
        { id: "Q110", text: "Did the Leasing Professional stand and greet promptly, or acknowledge the prospect if busy?", points: 10 },
        { id: "Q120", text: "Did the Leasing Professional introduce themselves?", points: 5 },
        { id: "Q130", text: "Did the Leasing Professional give undivided attention throughout the tour?", points: 5 },
        { id: "Q140", text: "Did the Leasing Professional complete a guest card or confirm information given over the phone?", points: 10 },
        {
          id: "Q150",
          text: "Was the following information asked: school classification, desired move-in date/term, how they heard about the property, 3 things they look for in an apartment, telephone number?",
          points: 10,
          note: "2 points each for the five items, 10 pts max"
        },
        { id: "Q160", text: "Did the Leasing Professional ask for a photo ID before the tour?", points: 5 },
        { id: "Q170", text: "Did the Leasing Professional do an overview of what the tour would consist of prior to starting?", points: 5 }
      ]
    },
    {
      name: "Property Tour & Demonstration",
      items: [
        { id: "Q205", text: "Did the Leasing Professional take control of the presentation?", points: 5 },
        { id: "Q210", text: "Did the Leasing Professional use the information gathered to personalize the presentation?", points: 10 },
        { id: "Q215", text: "Did the Leasing Professional use the prospect's name throughout the presentation?", points: 5 },
        { id: "Q220", text: "Was the Leasing Professional knowledgeable about the apartment community?", points: 10 },
        { id: "Q225", text: "Did the Leasing Professional sell the benefits and features of the apartment and community?", points: 10 },
        { id: "Q230", text: "Did the Leasing Professional show an apartment or model that was clean, made ready & comfortable in temperature?", points: 10 },
        { id: "Q235", text: "Did the Leasing Professional offer a snack or refreshment from a fully stocked fridge/freezer?", points: 5 },
        { id: "Q240", text: "Did the Leasing Professional highlight different features of the apartment and show how they are beneficial?", points: 5 },
        { id: "Q245", text: "Did the Leasing Professional tailor the presentation to the prospect's needs?", points: 5 },
        { id: "Q255", text: "Did the Leasing Professional overcome the objection stated during the demonstration?", points: 10 },
        { id: "Q260", text: "Did the Leasing Professional inquire which other communities were visited and offer a positive comparison?", points: 5 }
      ]
    },
    {
      name: "Closing Techniques",
      items: [
        { id: "Q305", text: "Did the Leasing Professional sit the prospect down at a computer or iPad and explain the application details?", points: 15 },
        { id: "Q310", text: "Did the Leasing Professional seem well versed in all rental rates?", points: 5 },
        { id: "Q315", text: "Did the Leasing Professional attempt to sell premium-price amenities while going over floor plans and rates?", points: 5 },
        { id: "Q320", text: "Did the Leasing Professional discuss the rental guarantor/qualification procedures?", points: 5 },
        { id: "Q325", text: "Did the Leasing Professional review the floor plan and rate sheet?", points: 10 },
        { id: "Q330", text: "Did the Leasing Professional convey a strong sense of urgency to rent today?", points: 5 },
        { id: "Q335", text: "Did the Leasing Professional ask if the prospect was ready to sign the lease today?", points: 15 },
        { id: "Q340", text: "Did the Leasing Professional effectively uncover and overcome objections for not leasing?", points: 5 }
      ]
    },
    {
      name: "Follow Up",
      items: [
        {
          id: "Q410",
          text: "Did the prospect receive a follow-up email, phone call, or text message within 24 hours of the visit?",
          points: 5,
          note: "If post-visit follow-up is not in the recording, score based on whether a follow-up plan was set during the visit."
        }
      ]
    }
  ],
  compliance: [
    { id: "Q510", text: "Did the Leasing Consultant steer the prospect to a specific area in an attempt to segregate?", points: 0, note: "Flag only" },
    { id: "Q520", text: "Did the prospect feel discriminated against in any way?", points: 0, note: "Flag only" }
  ]
};

export const DEFAULT_RBG_RUBRIC_NAME = "RBG Apartment In-Person Tour";
