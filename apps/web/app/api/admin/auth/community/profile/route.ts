import { NextResponse } from "next/server";

import { AdminAuthError, requireAdminContext } from "@/lib/admin-auth";
import { ensurePropertyTeamMember } from "@/lib/property-team";
import { getSupabaseServiceClient } from "@/lib/supabase";

const ALIAS_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/;

export async function POST(request: Request) {
  try {
    const workspace = await requireAdminContext(request);
    const body = await request.json().catch(() => ({})) as {
      name?: string;
      phone?: string;
      alias?: string;
      title?: string;
    };
    const name = body.name?.trim() ?? "";
    const phone = body.phone?.trim() ?? "";
    const alias = normalizeAlias(body.alias ?? "");
    const title = body.title?.trim() ?? "";

    if (name.length < 2) {
      return NextResponse.json({ error: "Confirm your full name to continue." }, { status: 400 });
    }
    if (!ALIAS_PATTERN.test(alias)) {
      return NextResponse.json(
        { error: "Use letters, numbers, and hyphens for your username." },
        { status: 400 }
      );
    }

    const result = await ensurePropertyTeamMember({
      propertyId: workspace.community.propertyTygId,
      userId: workspace.user.id,
      email: workspace.user.email,
      name,
      alias,
      phone: phone || null,
      role: workspace.teamMember.role,
      title: title || workspace.teamMember.title,
      cardAccent: workspace.user.cardAccent ?? workspace.teamMember.cardAccent,
      verified: true,
    });

    // Auth already owns the confirmed email. Mirror the latest property-card
    // profile into user_metadata so future property cards can be prefilled.
    const service = getSupabaseServiceClient();
    const { data: currentUser } = await service.auth.admin.getUserById(workspace.user.id);
    const currentMetadata = currentUser.user?.user_metadata ?? {};
    const { error: updateError } = await service.auth.admin.updateUserById(workspace.user.id, {
      user_metadata: {
        ...currentMetadata,
        full_name: name,
        name,
        phone: phone || null,
        alias,
        last_property_id: workspace.community.propertyTygId,
        property_card_updated_at: new Date().toISOString(),
      },
    });
    if (updateError) throw new Error(updateError.message);

    return NextResponse.json({
      ok: true,
      created: result.created,
      member: result.member,
      property: {
        id: workspace.community.propertyTygId,
        name: workspace.community.name,
      },
    });
  } catch (caught) {
    const status = caught instanceof AdminAuthError ? caught.status : 500;
    return NextResponse.json(
      { error: caught instanceof Error ? caught.message : "Could not save your property card." },
      { status }
    );
  }
}

function normalizeAlias(value: string) {
  return value
    .trim()
    .replace(/^@/, "")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}
