export type SessionAiPrompt = {
  id: string;
  label: string;
  description: string;
  text: string;
};

export const SESSION_AI_DEFAULT_PROMPTS: SessionAiPrompt[] = [
  {
    id: "improve",
    label: "Improve",
    description: "Top coaching opportunities from this tour",
    text: "What can the rep do to improve on the next tour? Prioritize the 2–3 highest-impact changes based on rubric gaps and missed moments in this session.",
  },
  {
    id: "close",
    label: "Close better",
    description: "Closing and next-step effectiveness",
    text: "How could they close more effectively on this tour? Review how they handled next steps, urgency, and commitment — and suggest concrete language they could use.",
  },
  {
    id: "segment",
    label: "Segment",
    description: "How would you break this tour into sections",
    text: "If you were to segment this tour into sections, how would you segment it?",
  },
];

export const SESSION_AI_MENTION_PROMPTS: SessionAiPrompt[] = [
  ...SESSION_AI_DEFAULT_PROMPTS,
  {
    id: "objections",
    label: "Objections",
    description: "Prospect pushback and responses",
    text: "Summarize the prospect's main objections or concerns during this tour. How did the rep handle each one, and what would you recommend for similar objections next time?",
  },
  {
    id: "discovery",
    label: "Discovery",
    description: "Needs-finding quality",
    text: "Evaluate the rep's discovery questions in this session. What needs, timeline, and budget signals did they uncover — and what important questions were never asked?",
  },
  {
    id: "next-steps",
    label: "Next steps",
    description: "Follow-up plan clarity",
    text: "Did the rep establish clear next steps before ending the tour? Summarize what was committed to and draft a stronger follow-up plan with specific actions and timing.",
  },
];

export function filterMentionPrompts(query: string): SessionAiPrompt[] {
  const q = query.trim().toLowerCase();
  if (!q) return SESSION_AI_MENTION_PROMPTS;
  return SESSION_AI_MENTION_PROMPTS.filter(
    (prompt) =>
      prompt.label.toLowerCase().includes(q) ||
      prompt.description.toLowerCase().includes(q) ||
      prompt.id.toLowerCase().includes(q)
  );
}
