// Server-side proxy for retrieving a Vapi call + its post-call analysis.
// GET /api/roleplay/call-analysis?callId=<vapi call id>
//   -> { success, ready, call: RoleplayCallResult }
// ready === true once the call has ended AND analysisPlan produced structuredData.
// The private Vapi key stays server-side (VAPI_PRIVATE_KEY env via vapiServer);
// a real workspace is required — Vapi call data is org-private.

import { NextResponse } from "next/server";
import { requireRoleplayWorkspace } from "@/lib/roleplay/apiAuth";
import { fetchVapiCallResponse } from "@/lib/roleplay/vapiServer";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const json = (body: any, status = 200) =>
  new NextResponse(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const numberIfPresent = (value: any) =>
  value === null || value === undefined || value === "" ? NaN : Number(value);

// Maps Vapi's artifact messages into the repo's transcript_json shape
// ({type:'bot'|'user', message, time}) used by PlayerAndTranscript — same
// mapping as formatAllVapiData in app/api/vapi/webhook/route.tsx, plus role
// normalization, system-row filtering, and voice timing for pace metrics.
function toTranscriptJson(messages: any[], callStartedAt?: string) {
  if (!Array.isArray(messages)) return [];
  const callStartedMs = callStartedAt ? new Date(callStartedAt).getTime() : NaN;
  // Some merged Vapi artifacts populate every message with time=0. Treat that
  // as unavailable rather than presenting four different turns at 0:00.
  const hasMeaningfulTiming = messages.some(
    (message) =>
      numberIfPresent(message?.secondsFromStart) > 0 ||
      numberIfPresent(message?.time) > 0 ||
      numberIfPresent(message?.duration) > 0
  );

  return messages
    .filter((m: any) => {
      const role = m?.role;
      return role === "user" || role === "assistant" || role === "bot" || role === "human";
    })
    .map((m: any) => {
      const text: string = m?.message ?? m?.content ?? "";
      const lastNewlineIndex = (text?.lastIndexOf("\n") ?? -1) + 1;
      const formatted =
        lastNewlineIndex > 0 ? text.substring(lastNewlineIndex).trim() : (text || "").trim();
      const role = m?.role === "user" || m?.role === "human" ? "user" : "bot";
      // Vapi occasionally reports small negative secondsFromStart for the
      // assistant's first message — clamp so the player never seeks negative.
      const messageStartAbsolute = numberIfPresent(m?.time);
      const messageEndAbsolute = numberIfPresent(m?.endTime);
      const absoluteTimeDivisor = messageStartAbsolute > 100_000_000_000 ? 1000 : 1;
      const reportedStart = numberIfPresent(m?.secondsFromStart);
      const hasReportedTiming =
        hasMeaningfulTiming &&
        (Number.isFinite(reportedStart) ||
          (Number.isFinite(messageStartAbsolute) && Number.isFinite(callStartedMs)));
      const absoluteRelativeStart =
        Number.isFinite(messageStartAbsolute) && Number.isFinite(callStartedMs)
          ? ((messageStartAbsolute * (absoluteTimeDivisor === 1 ? 1000 : 1)) - callStartedMs) /
            1000
          : NaN;
      const time = Math.max(
        0,
        Number.isFinite(reportedStart) && reportedStart > 0
          ? reportedStart
          : Number.isFinite(absoluteRelativeStart)
            ? absoluteRelativeStart
            : Number.isFinite(reportedStart)
              ? reportedStart
              : 0
      );

      const endFromAbsoluteTimestamps =
        Number.isFinite(messageStartAbsolute) &&
        Number.isFinite(messageEndAbsolute) &&
        messageEndAbsolute > messageStartAbsolute
          ? (messageEndAbsolute - messageStartAbsolute) / absoluteTimeDivisor
          : undefined;
      const reportedEndSeconds = numberIfPresent(m?.endSecondsFromStart);
      const endFromRelativeTimestamps =
        Number.isFinite(reportedEndSeconds) && reportedEndSeconds > time
          ? reportedEndSeconds - time
          : undefined;
      const reportedDuration = numberIfPresent(m?.duration);
      const duration =
        endFromAbsoluteTimestamps ??
        endFromRelativeTimestamps ??
        (Number.isFinite(reportedDuration) && reportedDuration > 0
          ? reportedDuration > 600
            ? reportedDuration / 1000
            : reportedDuration
          : undefined);

      return {
        type: role,
        message: formatted,
        time,
        ...(hasReportedTiming ? { timingSource: "vapi" } : {}),
        ...(duration && duration <= 600
          ? { duration, endTime: time + duration }
          : {}),
      };
    })
    .filter((m) => m.message.length > 0)
    .sort((a, b) => a.time - b.time);
}

export async function GET(request: Request) {
  try {
    const { workspace, response } = await requireRoleplayWorkspace(request);
    if (!workspace) return response;
    const { searchParams } = new URL(request.url);
    const callId = searchParams.get("callId");
    if (!callId) return json({ success: false, message: "callId query param required" }, 400);

    const res = await fetchVapiCallResponse(callId);

    if (!res.ok) {
      const text = await res.text();
      console.error("Vapi call fetch failed:", res.status, text.slice(0, 300));
      return json({ success: false, message: `Vapi API error ${res.status}` }, 502);
    }

    const call = await res.json();

    const structuredData = call?.analysis?.structuredData;
    const ready = call?.status === "ended" && !!structuredData;

    let durationSeconds: number | undefined = undefined;
    if (call?.startedAt && call?.endedAt) {
      durationSeconds = Math.round(
        (new Date(call.endedAt).getTime() - new Date(call.startedAt).getTime()) / 1000
      );
    }

    const result = {
      id: call?.id,
      status: call?.status,
      endedReason: call?.endedReason,
      analysis: call?.analysis
        ? {
            structuredData,
            summary: call.analysis.summary,
            successEvaluation: call.analysis.successEvaluation,
          }
        : undefined,
      recordingUrl: call?.artifact?.recordingUrl ?? call?.recordingUrl,
      transcript: call?.artifact?.transcript ?? call?.transcript,
      transcriptJson: toTranscriptJson(
        call?.artifact?.messages ?? call?.messages,
        call?.startedAt
      ),
      createdAt: call?.createdAt,
      startedAt: call?.startedAt,
      endedAt: call?.endedAt,
      durationSeconds,
      cost: call?.cost,
    };

    return json({ success: true, ready, call: result });
  } catch (error: any) {
    console.error("Error fetching call analysis:", error.message);
    return json({ success: false, message: error.message }, 500);
  }
}
