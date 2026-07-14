import { NextResponse } from "next/server";

import { AdminAuthError, requireAdminContext } from "@/lib/admin-auth";
import { getSupabaseServiceClient } from "@/lib/supabase";

const DEFAULTS = {
  lowScore: true,
  newSession: true,
  analysisReady: true,
  sessionReminders: true,
  comments: true,
  weeklyReport: true,
  prospectConvert: false,
  coachingMentions: true,
};

export async function GET(request: Request) {
  try {
    const workspace = await requireAdminContext(request);
    const supabase = getSupabaseServiceClient();
    const { data, error } = await supabase
      .from("user_profiles")
      .select("notification_preferences")
      .eq("user_id", workspace.user.id)
      .maybeSingle<{ notification_preferences: Record<string, boolean> | null }>();
    if (error) throw new Error(error.message);
    return NextResponse.json({
      notifications: { ...DEFAULTS, ...(data?.notification_preferences ?? {}) },
    });
  } catch (caught) {
    return NextResponse.json(
      { error: caught instanceof Error ? caught.message : "Failed to load notifications." },
      { status: caught instanceof AdminAuthError ? caught.status : 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const workspace = await requireAdminContext(request);
    const body = (await request.json()) as Record<string, unknown>;
    const notifications = {
      ...DEFAULTS,
      ...Object.fromEntries(
        Object.entries(body).filter(([, value]) => typeof value === "boolean")
      ),
    };
    const supabase = getSupabaseServiceClient();
    const { error } = await supabase
      .from("user_profiles")
      .update({
        notification_preferences: notifications,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("user_id", workspace.user.id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ notifications });
  } catch (caught) {
    return NextResponse.json(
      { error: caught instanceof Error ? caught.message : "Failed to update notifications." },
      { status: caught instanceof AdminAuthError ? caught.status : 500 }
    );
  }
}
