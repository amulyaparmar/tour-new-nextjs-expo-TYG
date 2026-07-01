import { NextResponse } from "next/server";

import { getSupabaseServiceClient } from "@/lib/supabase";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  const { id } = await context.params;

  try {
    const [sessionId, leadIndexRaw] = decodeURIComponent(id).split(":");
    const leadIndex = Number.parseInt(leadIndexRaw ?? "0", 10) || 0;
    if (!sessionId) {
      return NextResponse.json({ error: "Invalid prospect id." }, { status: 400 });
    }

    const body = (await request.json()) as {
      status?: "pending" | "sent" | "converted" | "lost";
      note?: { text: string; timestamp?: string; author?: string };
      nextFollowUpAt?: string | null;
      lastContactAt?: string | null;
    };

    const supabase = getSupabaseServiceClient();
    const { data: existing } = await supabase
      .from("prospect_follow_ups")
      .select("notes")
      .eq("session_id", sessionId)
      .eq("lead_index", leadIndex)
      .maybeSingle<{ notes: Array<{ text: string; timestamp: string; author: string }> | null }>();

    const notes = [...(existing?.notes ?? [])];
    if (body.note?.text?.trim()) {
      notes.push({
        text: body.note.text.trim(),
        timestamp: body.note.timestamp ?? new Date().toISOString(),
        author: body.note.author ?? "Manager",
      });
    }

    const payload = {
      session_id: sessionId,
      lead_index: leadIndex,
      status: body.status ?? "pending",
      notes,
      last_contact_at: body.lastContactAt ?? new Date().toISOString(),
      next_follow_up_at: body.nextFollowUpAt ?? null,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("prospect_follow_ups")
      .upsert(payload as never, { onConflict: "session_id,lead_index" })
      .select("*")
      .single();

    if (error) throw new Error(error.message);
    return NextResponse.json({ followUp: data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update prospect." },
      { status: 500 }
    );
  }
}
