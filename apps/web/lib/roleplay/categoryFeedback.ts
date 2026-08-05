// @ts-nocheck — ported from usevoice.ai-TYG (looser tsconfig); index-access
// strictness (noUncheckedIndexedAccess) not yet retrofitted.
import { RoleplayStructuredData, RubricKey } from "./types";

type RawCategoryFeedback = NonNullable<RoleplayStructuredData["categoryFeedback"]>[RubricKey];

export type ResolvedCategoryFeedback = {
  reasons: string[];
  evidenceQuote?: string;
  betterResponse: string;
  legacy: boolean;
  inferredFromSavedTip: boolean;
};

const STOP_WORDS = new Set([
  "about",
  "agent",
  "clear",
  "could",
  "current",
  "from",
  "have",
  "point",
  "specific",
  "their",
  "there",
  "these",
  "they",
  "this",
  "what",
  "when",
  "where",
  "which",
  "with",
  "would",
]);

const TOPIC_GROUPS = [
  {
    category: /empathy|acknowledg|rapport|feel heard/i,
    suggestion: /empathy|acknowledg|frustrat|tough time|feel heard|emotional state/i,
  },
  {
    category: /roommate|matching|fairness|compatib/i,
    suggestion: /roommate|matching|compatib|sleep schedule|lifestyle match/i,
  },
  {
    category: /discover|question|qualif|needs|current situation/i,
    suggestion: /discover|question|follow.{0,5}up|pain point|current living situation|uncover/i,
  },
  {
    category: /restriction|deposit|fee/i,
    suggestion: /restriction|deposit|fee|one.time|recurring/i,
  },
  {
    category: /pet policy|policy clarity|species|allowed/i,
    suggestion: /pet policy|species|allowed|pet.friendly|enclosure/i,
  },
  {
    category: /urgency|next step|clos|tour|follow.up/i,
    suggestion: /call to action|tour|schedule|appointment|confirm|next step/i,
  },
  {
    category: /value|benefit|feature|amenit|study|quiet|soundproof/i,
    suggestion: /value|benefit|feature|amenit|soundproof|frame.{0,12}positive/i,
  },
];

const tokens = (value: string) =>
  (value.toLowerCase().match(/[a-z0-9]+/g) ?? [])
    .filter((word) => word.length >= 4 && !STOP_WORDS.has(word))
    .map((word) => word.replace(/(ments?|ness|tion|ing|ed|es|s)$/i, ""));

function relevanceScore(categoryText: string, suggestion: string) {
  const categoryTokens = new Set(tokens(categoryText));
  const suggestionTokens = new Set(tokens(suggestion));
  let score = 0;
  for (const token of Array.from(categoryTokens)) {
    if (suggestionTokens.has(token)) score += 1;
  }
  return score;
}

function closestSavedTip(label: string, description: string, suggestions: string[]) {
  const categoryText = `${label} ${description}`;
  const topic = TOPIC_GROUPS.find((candidate) => candidate.category.test(categoryText));
  if (topic) {
    const semanticMatch = suggestions.find((suggestion) => topic.suggestion.test(suggestion));
    if (semanticMatch) return semanticMatch;
  }

  const ranked = suggestions
    .map((suggestion) => ({ suggestion, score: relevanceScore(categoryText, suggestion) }))
    .sort((a, b) => b.score - a.score);
  return ranked[0]?.score >= 3 ? ranked[0].suggestion : undefined;
}

function legacyExample(label: string, description: string) {
  const criterion = `${label} ${description}`.toLowerCase();
  if (/empathy|acknowledg|heard|frustrat/.test(criterion)) {
    return "I’m sorry you’ve been dealing with that—it sounds really frustrating. Could I ask one more question so I understand what would feel better in your next place?";
  }
  if (/discover|question|needs|lifestyle|situation/.test(criterion)) {
    return "What has been the hardest part of your current living situation, and what would an ideal setup look like for you?";
  }
  if (/roommate|matching|fairness|compatib/.test(criterion)) {
    return "Your noise and sleep preferences matter. Let me verify whether we offer roommate matching or private-room options and explain exactly what is available.";
  }
  if (/pet|policy|restriction|deposit|fee/.test(criterion)) {
    return "Let me confirm exactly what is allowed, any deposits or recurring costs, and any enclosure or documentation requirements so you have the full picture.";
  }
  if (/study|quiet|amenit|value|benefit|feature/.test(criterion)) {
    return "Since quiet study space matters to you, let me confirm which quiet-space options are available and walk you through the ones that best fit how you study.";
  }
  if (/urgency|next step|tour|follow|close|schedule/.test(criterion)) {
    return "What day and time works best for a tour? I’ll confirm availability and send you the details so the next step is clear.";
  }
  return "What I’m hearing is that this is important to you. Let me explain the most relevant option clearly, then we can agree on the best next step.";
}

export function resolveCategoryFeedback({
  label,
  description,
  score,
  feedback,
  suggestions = [],
}: {
  label: string;
  description: string;
  score: number;
  feedback?: RawCategoryFeedback | null;
  suggestions?: string[];
}): ResolvedCategoryFeedback {
  const validReasons = Array.isArray(feedback?.reasons)
    ? feedback.reasons.filter((reason) => typeof reason === "string" && reason.trim())
    : [];
  const validBetterResponse =
    typeof feedback?.betterResponse === "string" ? feedback.betterResponse.trim() : "";

  if (validReasons.length > 0 && validBetterResponse) {
    return {
      reasons: validReasons,
      evidenceQuote:
        typeof feedback?.evidenceQuote === "string" && feedback.evidenceQuote.trim()
          ? feedback.evidenceQuote.trim()
          : undefined,
      betterResponse: validBetterResponse,
      legacy: false,
      inferredFromSavedTip: false,
    };
  }

  const lost = Math.max(0, 20 - Math.round(Number(score) || 0));
  const matchedTip = closestSavedTip(label, description, suggestions);
  const fallbackReason =
    lost === 0
      ? "This category received full credit."
      : `This earlier attempt did not save category-level reasoning. Its ${lost}-point gap means the response did not fully satisfy this standard: ${description}`;

  return {
    reasons: matchedTip
      ? [fallbackReason, `Closest saved coaching tip: ${matchedTip}`]
      : [fallbackReason],
    betterResponse: legacyExample(label, description),
    legacy: true,
    inferredFromSavedTip: !!matchedTip,
  };
}
