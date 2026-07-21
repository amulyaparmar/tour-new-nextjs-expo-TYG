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
import {
  isSampleSourceProperty,
  SAMPLE_SESSION_IDS,
  SAMPLE_SESSION_SET,
  SAMPLE_SOURCE_PROPERTY_IDS,
  SAMPLE_SOURCE_PROPERTY_NAME,
} from "@/lib/sample-sessions";

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

      if (!session || !isSampleSourceProperty(session.propertyId) || !analysis) {
        return NextResponse.json({ error: "Sample session is unavailable." }, { status: 404 });
      }

      return NextResponse.json({
        sample: true,
        propertyName: SAMPLE_SOURCE_PROPERTY_NAME,
        session,
        analysis,
        phases,
        transcript,
        actions,
      });
    }

    const source = await listSessionsPaginated({
      limit: 100,
      propertyIds: [...SAMPLE_SOURCE_PROPERTY_IDS],
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
      propertyName: SAMPLE_SOURCE_PROPERTY_NAME,
      sessions,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load sample sessions." },
      { status: 500 }
    );
  }
}
