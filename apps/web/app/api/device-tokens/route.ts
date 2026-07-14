import { NextResponse } from "next/server";

import { AdminAuthError, requireAdminContext } from "@/lib/admin-auth";
import { getSupabaseServiceClient } from "@/lib/supabase";

export async function POST(request: Request) {
  try {
    const workspace = await requireAdminContext(request);
    const body = (await request.json()) as { token?: string; platform?: string };
    const token = String(body.token ?? "").trim();
    const platform = String(body.platform ?? "").trim();
    if (!token || !["ios", "android", "web"].includes(platform)) {
      return NextResponse.json({ error: "token and platform are required." }, { status: 400 });
    }

    const supabase = getSupabaseServiceClient();
    const { error } = await supabase.from("device_push_tokens").upsert(
      {
        user_id: workspace.user.id,
        token,
        platform,
        updated_at: new Date().toISOString(),
      } as never,
      { onConflict: "token" },
    );
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (caught) {
    return NextResponse.json(
      { error: caught instanceof Error ? caught.message : "Failed to register device token." },
      { status: caught instanceof AdminAuthError ? caught.status : 500 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const workspace = await requireAdminContext(request);
    const body = (await request.json().catch(() => ({}))) as { token?: string };
    const token = String(body.token ?? "").trim();
    const supabase = getSupabaseServiceClient();
    let query = supabase.from("device_push_tokens").delete().eq("user_id", workspace.user.id);
    if (token) query = query.eq("token", token);
    const { error } = await query;
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (caught) {
    return NextResponse.json(
      { error: caught instanceof Error ? caught.message : "Failed to remove device token." },
      { status: caught instanceof AdminAuthError ? caught.status : 500 },
    );
  }
}
