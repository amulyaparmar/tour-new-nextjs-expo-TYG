import { NextRequest, NextResponse } from "next/server";

import { propertySessionKeys, requireAdminContext } from "@/lib/admin-auth";
import {
  getAnalysisBySessionId,
  getConversationPhases,
  getSessionById,
  getTranscript,
  listFollowUpActions,
  listSessionsPaginated,
} from "@/lib/sessions";

const SAMPLE_PROPERTY_ID = "community:548";

// Curated, analyzed 40Fifty Lofts examples. Keep this list explicit so new
// sessions never become visible as samples merely because of their property.
const SAMPLE_SESSION_IDS = [
  "717f4772-ec00-4676-bcf4-1eaf924c3786", // Laura × Amulya — 8 exact moments
  "772c294c-130e-45b6-866a-5e374d7b9d29", // Laura × Amulya — long transcript
  "34a29aea-1810-4ec9-97b8-af3bd95fd8c8", // Vic Village — 392 transcript turns
  "2e47d28a-acf1-4590-a75a-8260c895e40a", // The George
  "7e9e24de-b723-4a52-a363-4ad2bee2e015", // Six11
] as const;

const SAMPLE_SESSION_SET = new Set<string>(SAMPLE_SESSION_IDS);

export async function GET(request: NextRequest) {
  try {
    const workspace = await requireAdminContext(request);
    const ownSessions = await listSessionsPaginated({
      limit: 1,
      propertyIds: propertySessionKeys(workspace.community),
      excludeScheduled: true,
    });

    if (ownSessions.total > 0) {
      return NextResponse.json(
        { error: "Samples are available only when the active property has no recorded sessions." },
        { status: 409 }
      );
    }

    const sampleId = request.nextUrl.searchParams.get("id")?.trim();
    if (sampleId) {
      if (!SAMPLE_SESSION_SET.has(sampleId)) {
        return NextResponse.json({ error: "Sample session not found." }, { status: 404 });
      }

      const [session, analysis, phases, transcript, actions] = await Promise.all([
        getSessionById(sampleId),
        getAnalysisBySessionId(sampleId),
        getConversationPhases(sampleId),
        getTranscript(sampleId),
        listFollowUpActions(sampleId),
      ]);

      if (!session || session.propertyId !== SAMPLE_PROPERTY_ID || !analysis) {
        return NextResponse.json({ error: "Sample session is unavailable." }, { status: 404 });
      }

      return NextResponse.json({
        sample: true,
        propertyName: "40Fifty Lofts",
        session,
        analysis,
        phases,
        transcript,
        actions,
      });
    }

    const source = await listSessionsPaginated({
      limit: 100,
      propertyId: SAMPLE_PROPERTY_ID,
      excludeScheduled: true,
      sort: "newest",
    });
    const byId = new Map(source.sessions.map((session) => [session.id, session]));
    const sessions = SAMPLE_SESSION_IDS.flatMap((id) => {
      const session = byId.get(id);
      return session ? [session] : [];
    });

    return NextResponse.json({
      sample: true,
      propertyName: "40Fifty Lofts",
      sessions,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load sample sessions." },
      { status: 500 }
    );
  }
}
