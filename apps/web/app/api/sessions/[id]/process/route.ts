import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { generateAnalysis, generateFollowUpActions } from "@/lib/analysis";
import { createMaterial, findMaterialBySessionId } from "@/lib/materials";
import { extractScreenshots } from "@/lib/screenshots";
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

    // Step 2: AI Analysis with real transcript (run before screenshots so we know key moments)
    await setSessionStatus(id, "analyzing");
    const analysis = await generateAnalysis({
      title: session.title,
      prospectName: session.prospectName,
      location: session.location,
      notes: session.notes,
      transcript
    });

    await upsertAnalysis(id, analysis);

    // Step 3: Extract screenshots from video at key moment timestamps
    await setSessionStatus(id, "extracting_screenshots");
    const momentTimestamps = analysis.exactMoments.map((m) => ({
      seconds: parseTimestamp(m.timestamp),
      label: m.explanation
    })).filter((t) => t.seconds >= 0);
    await extractScreenshots(id, momentTimestamps);

    // Step 4: Generate follow-up actions
    const actions = await generateFollowUpActions(analysis, {
      title: session.title,
      prospectName: session.prospectName
    });
    await replaceFollowUpActions(id, actions);

    // Done
    await setSessionStatus(id, "analysis_ready", analysis.overallScore);

    // Auto-create a recording material so it shows in the Materials section
    const existing = await findMaterialBySessionId(id);
    if (!existing) {
      const transcriptPreview = transcript
        .slice(0, 10)
        .map((s) => `[${s.start.toFixed(1)}s] ${s.text}`)
        .join("\n");

      await createMaterial({
        name: session.title,
        type: "recording",
        description: `Recording from session "${session.title}"${session.prospectName ? ` with ${session.prospectName}` : ""}. Score: ${analysis.overallScore}/100.`,
        sessionId: id,
        parsedText: transcriptPreview || null
      });
    }

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

function parseTimestamp(ts: string): number {
  const parts = ts.split(":").map(Number);
  if (parts.length === 2 && parts.every((n) => !isNaN(n))) {
    return parts[0] * 60 + parts[1];
  }
  if (parts.length === 3 && parts.every((n) => !isNaN(n))) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  return -1;
}
