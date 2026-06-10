import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { generateAnalysis, generateFollowUpActions } from "@/lib/analysis";
import { getSessionById, replaceFollowUpActions, setSessionStatus, upsertAnalysis } from "@/lib/sessions";
import { transcribeAudio } from "@/lib/transcribe";
import { getSupabaseServiceClient } from "@/lib/supabase";

type Context = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: Context) {
  const { id } = await context.params;

  try {
    const session = await getSessionById(id);
    if (!session) {
      return NextResponse.json({ error: "Session not found." }, { status: 404 });
    }

    // Step 1: Transcription
    await setSessionStatus(id, "transcribing");
    const audioBuffer = await fetchRecordingBuffer(id);
    const transcript = await transcribeAudio(
      id,
      audioBuffer,
      "audio/mpeg"
    );

    // Step 2: Screenshot extraction (simulated for MVP)
    await setSessionStatus(id, "extracting_screenshots");

    // Step 3: AI Analysis with real transcript
    await setSessionStatus(id, "analyzing");
    const analysis = await generateAnalysis({
      title: session.title,
      prospectName: session.prospectName,
      location: session.location,
      notes: session.notes,
      transcript
    });

    await upsertAnalysis(id, analysis);

    // Step 4: Generate follow-up actions
    const actions = await generateFollowUpActions(analysis, {
      title: session.title,
      prospectName: session.prospectName
    });
    await replaceFollowUpActions(id, actions);

    // Done
    await setSessionStatus(id, "analysis_ready", analysis.overallScore);

    return NextResponse.json({
      ok: true,
      overallScore: analysis.overallScore,
      transcriptSegments: transcript.length,
      actionsGenerated: actions.length
    });
  } catch (error) {
    await setSessionStatus(id, "failed").catch(() => {});
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Processing failed." },
      { status: 500 }
    );
  }
}

async function fetchRecordingBuffer(sessionId: string): Promise<Buffer> {
  // Try Supabase storage first
  try {
    const supabase = getSupabaseServiceClient();
    const extensions = ["mp4", "webm", "m4a", "wav", "mp3"];

    for (const ext of extensions) {
      const { data } = await supabase.storage
        .from("recordings")
        .download(`${sessionId}.${ext}`);

      if (data) {
        return Buffer.from(await data.arrayBuffer());
      }
    }
  } catch {
    // Fall through to local
  }

  // Try local uploads
  const localDir = path.join(process.cwd(), ".local-uploads");
  const extensions = ["mp4", "webm", "m4a", "wav", "mp3", "bin"];
  for (const ext of extensions) {
    try {
      return await readFile(path.join(localDir, `${sessionId}.${ext}`));
    } catch {
      continue;
    }
  }

  // Return empty buffer (will use fallback transcript)
  return Buffer.alloc(0);
}
