import { NextResponse } from "next/server";

import { generateAnalysis, generateFollowUpActions } from "@/lib/analysis";
import {
  getAnalysisBySessionId,
  getSessionById,
  replaceFollowUpActions,
  upsertAnalysis
} from "@/lib/sessions";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  const { id } = await context.params;
  try {
    const analysis = await getAnalysisBySessionId(id);
    return NextResponse.json({ analysis });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch analysis." },
      { status: 500 }
    );
  }
}

export async function POST(_request: Request, context: Context) {
  const { id } = await context.params;
  try {
    const session = await getSessionById(id);
    if (!session) {
      return NextResponse.json({ error: "Session not found." }, { status: 404 });
    }

    const analysis = await generateAnalysis({
      title: session.title,
      prospectName: session.prospectName,
      location: session.location,
      notes: session.notes
    });

    await upsertAnalysis(id, analysis);

    const actions = await generateFollowUpActions(analysis, {
      title: session.title,
      prospectName: session.prospectName
    });
    await replaceFollowUpActions(id, actions);

    return NextResponse.json({ analysis }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate analysis." },
      { status: 500 }
    );
  }
}
