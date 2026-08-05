// Prospect voices available in the scenario editor.
//
// Currently pinned to the base assistant's own voice — Vapi native "Elliot"
// (version 2, speed 1.05) — which is verified working on this account.
// Additional voices will be added here once they've been personally vetted.
//
// NOTE: when a scenario uses a provider:"vapi" voice, buildRoleplayInitObj
// omits the voice override entirely so the base assistant's exact tuning
// applies untouched. 11labs entries (once vetted/added) get an explicit
// voice override block instead.
export const ROLEPLAY_VOICES = [
  {
    provider: "vapi",
    voiceId: "Elliot",
    label: "Elliot",
    sublabel: "Vapi native · base assistant voice",
    src: null, // no avatar image; the picker renders a placeholder
  },
];
