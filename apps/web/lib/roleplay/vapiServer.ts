// Server-only Vapi helpers shared by roleplay API routes. Do not import this
// module from client components. Unlike the usevoice.ai-TYG source repo (which
// commits keys as source literals), this repo's convention is env vars — set
// VAPI_PRIVATE_KEY in apps/web/.env.local (see .env.example).

import "server-only";

function vapiPrivateKey(): string {
  const key = process.env.VAPI_PRIVATE_KEY;
  if (!key) {
    throw new Error(
      "Missing VAPI_PRIVATE_KEY — the roleplay feature needs it for post-call analysis and recording playback."
    );
  }
  return key;
}

export const fetchVapiCallResponse = (callId: string) =>
  fetch(`https://api.vapi.ai/call/${encodeURIComponent(callId)}`, {
    headers: { Authorization: `Bearer ${vapiPrivateKey()}` },
    cache: "no-store",
  });

// Server-side Vapi Chat API (POST /chat) — a text-only LLM completion billed
// to the Vapi account, no call involved. Used as the waypoint-generation
// fallback when OpenAI is unavailable; this account is the same billing every
// roleplay call uses, so this leg works whenever calls do.
export const createVapiChat = (body: unknown) =>
  fetch("https://api.vapi.ai/chat", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${vapiPrivateKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
