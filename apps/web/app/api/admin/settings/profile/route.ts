import { NextResponse } from "next/server";

import { AdminAuthError, requireAdminContext } from "@/lib/admin-auth";
import { getSupabaseServiceClient } from "@/lib/supabase";

export async function GET(request: Request) {
  try {
    const workspace = await requireAdminContext(request);
    return NextResponse.json({
      profile: {
        name: workspace.user.fullName ?? workspace.user.email.split("@")[0],
        email: workspace.user.email,
        role: workspace.membership.role,
        company: workspace.membership.companyName,
        community: workspace.community.name,
      },
    });
  } catch (caught) {
    return NextResponse.json(
      { error: caught instanceof Error ? caught.message : "Failed to load profile." },
      { status: caught instanceof AdminAuthError ? caught.status : 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const workspace = await requireAdminContext(request);
    const body = (await request.json()) as { name?: string };
    const name = body.name?.trim();
    if (!name) return NextResponse.json({ error: "name is required." }, { status: 400 });

    const supabase = getSupabaseServiceClient();
    const { error } = await supabase
      .from("user_profiles")
      .update({ full_name: name, updated_at: new Date().toISOString() } as never)
      .eq("user_id", workspace.user.id);
    if (error) throw new Error(error.message);

    return NextResponse.json({
      profile: {
        name,
        email: workspace.user.email,
        role: workspace.membership.role,
        company: workspace.membership.companyName,
        community: workspace.community.name,
      },
    });
  } catch (caught) {
    return NextResponse.json(
      { error: caught instanceof Error ? caught.message : "Failed to update profile." },
      { status: caught instanceof AdminAuthError ? caught.status : 500 }
    );
  }
}
