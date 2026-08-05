// Same-origin proxy for Vapi's short-lived presigned recording URLs. The
// browser uses the speaker-separated tracks to measure voiced time when Vapi's
// merged transcript messages contain zero durations, and the combined track
// for history playback. The `supabase_recording_url` persisted on the calls
// row is the RAW R2 object path (unsigned — never publicly fetchable), so
// playback must come through here. Presigned URLs are cached in-process until
// shortly before their expiry (`artifact.presignedUrlsExpiresAt`, ~40 min) so
// media Range requests — one per seek — don't each cost a Vapi API call.

import { NextResponse } from "next/server";
import { requireRoleplayWorkspace } from "@/lib/roleplay/apiAuth";
import { fetchVapiCallResponse } from "@/lib/roleplay/vapiServer";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const SPEAKERS = ["agent", "prospect", "combined"] as const;
type Speaker = (typeof SPEAKERS)[number];

const PRESIGN_SAFETY_MS = 30_000;
const PRESIGN_FALLBACK_TTL_MS = 4 * 60_000;
const PRESIGN_CACHE_MAX = 200;

const presignCache = new Map<string, { url: string; expiresAtMs: number }>();

const cacheKey = (callId: string, speaker: Speaker) => `${callId}:${speaker}`;

const cacheGet = (callId: string, speaker: Speaker) => {
  const entry = presignCache.get(cacheKey(callId, speaker));
  if (!entry || Date.now() > entry.expiresAtMs - PRESIGN_SAFETY_MS) return null;
  return entry.url;
};

// Fetches the call once and caches all three presigned track URLs.
// Returns a non-null status code on Vapi API failure.
const refreshPresignedUrls = async (callId: string): Promise<number | null> => {
  const callResponse = await fetchVapiCallResponse(callId);
  if (!callResponse.ok) return callResponse.status;

  const call = await callResponse.json();
  const artifact = call?.artifact ?? {};
  const parsedExpiry = new Date(artifact.presignedUrlsExpiresAt ?? NaN).getTime();
  const expiresAtMs = Number.isFinite(parsedExpiry)
    ? parsedExpiry
    : Date.now() + PRESIGN_FALLBACK_TTL_MS;

  if (presignCache.size > PRESIGN_CACHE_MAX) {
    for (const [key, entry] of presignCache) {
      if (Date.now() > entry.expiresAtMs) presignCache.delete(key);
    }
  }

  // In Vapi web calls, the human trainee is the "customer" track and the AI
  // prospect is the "assistant" track.
  const urls: Record<Speaker, string | undefined> = {
    agent: artifact.presignedCustomerUrl,
    prospect: artifact.presignedAssistantUrl,
    combined: artifact.presignedStereoUrl ?? artifact.presignedMonoUrl,
  };
  for (const speaker of SPEAKERS) {
    const url = urls[speaker];
    if (url) presignCache.set(cacheKey(callId, speaker), { url, expiresAtMs });
    else presignCache.delete(cacheKey(callId, speaker));
  }
  return null;
};

const json = (body: any, status = 200) =>
  NextResponse.json(body, { status });

export async function GET(request: Request) {
  try {
    const { workspace, response } = await requireRoleplayWorkspace(request);
    if (!workspace) return response;
    const { searchParams } = new URL(request.url);
    const callId = searchParams.get("callId");
    const speaker = searchParams.get("speaker") as Speaker | null;

    if (!callId) return json({ success: false, message: "callId query param required" }, 400);
    if (!speaker || !SPEAKERS.includes(speaker)) {
      return json({ success: false, message: "speaker must be agent, prospect, or combined" }, 400);
    }

    let trackUrl = cacheGet(callId, speaker);
    let refreshed = false;
    if (!trackUrl) {
      const failureStatus = await refreshPresignedUrls(callId);
      if (failureStatus !== null) {
        return json({ success: false, message: `Vapi API error ${failureStatus}` }, 502);
      }
      refreshed = true;
      trackUrl = cacheGet(callId, speaker);
    }

    if (!trackUrl) {
      return json({ success: false, message: `No ${speaker} audio track available` }, 404);
    }

    const range = request.headers.get("range");
    const fetchTrack = (url: string) =>
      fetch(url, {
        headers: range ? { Range: range } : undefined,
        cache: "no-store",
      });

    let trackResponse = await fetchTrack(trackUrl);

    // A cached presign can die before its advertised expiry — refresh once.
    if ((trackResponse.status === 401 || trackResponse.status === 403) && !refreshed) {
      const failureStatus = await refreshPresignedUrls(callId);
      if (failureStatus === null) {
        const freshUrl = cacheGet(callId, speaker);
        if (freshUrl) trackResponse = await fetchTrack(freshUrl);
      }
    }

    if (!trackResponse.ok && trackResponse.status !== 206) {
      return json({ success: false, message: `Audio track error ${trackResponse.status}` }, 502);
    }

    const headers = new Headers({
      "Content-Type": trackResponse.headers.get("content-type") || "audio/mpeg",
      "Cache-Control": "private, max-age=300",
    });
    for (const name of ["content-length", "content-range", "accept-ranges"]) {
      const value = trackResponse.headers.get(name);
      if (value) headers.set(name, value);
    }

    return new NextResponse(trackResponse.body, {
      status: trackResponse.status,
      headers,
    });
  } catch (error: any) {
    console.error("Roleplay audio track proxy failed:", error?.message);
    return json({ success: false, message: error?.message || "Audio track proxy failed" }, 500);
  }
}
