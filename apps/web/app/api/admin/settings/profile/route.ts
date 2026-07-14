import { NextResponse } from "next/server";

import { AdminAuthError, requireAdminContext } from "@/lib/admin-auth";
import { getSupabaseServiceClient } from "@/lib/supabase";

type PropertySettingsRow = {
  alias: string | null;
  metadata: unknown;
};

const ACCENT_PATTERN = /^#([0-9a-fA-F]{6})$/;

function normalizeAlias(value: unknown) {
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const alias = value.trim().toLowerCase().replace(/^@/, "");
  if (!alias) return null;
  if (!/^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/.test(alias)) {
    throw new Error("Aliases can use lowercase letters, numbers, and hyphens, and cannot end with a hyphen.");
  }
  return alias;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function profilePayload(workspace: Awaited<ReturnType<typeof requireAdminContext>>, overrides?: {
  name?: string;
  title?: string | null;
  phone?: string | null;
  cardAccent?: string | null;
}) {
  return {
    name: overrides?.name ?? workspace.user.fullName ?? workspace.user.email.split("@")[0],
    email: workspace.user.email,
    role: workspace.teamMember.role,
    company: workspace.organization.name,
    community: workspace.community.name,
    title: overrides?.title !== undefined ? overrides.title : workspace.user.title,
    phone: overrides?.phone !== undefined ? overrides.phone : workspace.user.phone,
    cardAccent: overrides?.cardAccent !== undefined ? overrides.cardAccent : workspace.user.cardAccent,
    userAlias: workspace.teamMember.alias,
    propertyAlias: workspace.community.alias,
  };
}

export async function GET(request: Request) {
  try {
    const workspace = await requireAdminContext(request);
    return NextResponse.json({ profile: profilePayload(workspace) });
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
    const body = (await request.json()) as {
      name?: string;
      userAlias?: string | null;
      propertyAlias?: string | null;
      title?: string | null;
      phone?: string | null;
      cardAccent?: string | null;
    };

    const name = body.name?.trim();
    const userAlias = normalizeAlias(body.userAlias);
    const propertyAlias = normalizeAlias(body.propertyAlias);
    const title = body.title === undefined ? undefined : (body.title?.trim() || null);
    const phone = body.phone === undefined ? undefined : (body.phone?.trim() || null);
    const cardAccentRaw = body.cardAccent === undefined ? undefined : (body.cardAccent?.trim() || null);

    if (!name && userAlias === undefined && propertyAlias === undefined && title === undefined && phone === undefined && cardAccentRaw === undefined) {
      return NextResponse.json({ error: "At least one profile setting is required." }, { status: 400 });
    }

    if (cardAccentRaw && !ACCENT_PATTERN.test(cardAccentRaw)) {
      return NextResponse.json({ error: "cardAccent must be a hex color like #006CE5." }, { status: 400 });
    }

    const supabase = getSupabaseServiceClient();

    if (userAlias !== undefined || propertyAlias !== undefined) {
      const { data: property, error: propertyError } = await supabase
        .from("propertiesTYG")
        .select("alias,metadata")
        .eq("id", workspace.community.propertyTygId)
        .single<PropertySettingsRow>();
      if (propertyError || !property) throw new Error(propertyError?.message ?? "Property not found.");

      const metadata = isRecord(property.metadata) ? { ...property.metadata } : {};
      const team = Array.isArray(metadata.property_team)
        ? metadata.property_team.map((member) => isRecord(member) ? { ...member } : member)
        : [];
      const memberIndex = team.findIndex((member) =>
        isRecord(member) && String(member.email ?? "").trim().toLowerCase() === workspace.user.email
      );
      if (memberIndex < 0 || !isRecord(team[memberIndex])) {
        throw new AdminAuthError("Your property-team record could not be found.", 403);
      }

      if (userAlias !== undefined) {
        const duplicate = userAlias && team.some((member, index) =>
          index !== memberIndex && isRecord(member) && String(member.alias ?? "").trim().toLowerCase() === userAlias
        );
        if (duplicate) return NextResponse.json({ error: "That user alias is already used on this property." }, { status: 409 });
        const nextMember = { ...team[memberIndex] };
        if (userAlias) nextMember.alias = userAlias;
        else delete nextMember.alias;
        team[memberIndex] = nextMember;
        metadata.property_team = team;
      }

      const propertyUpdate: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (userAlias !== undefined) propertyUpdate.metadata = metadata;
      if (propertyAlias !== undefined) propertyUpdate.alias = propertyAlias;
      const { error: updateError } = await supabase
        .from("propertiesTYG")
        .update(propertyUpdate as never)
        .eq("id", workspace.community.propertyTygId);
      if (updateError?.code === "23505") {
        return NextResponse.json({ error: "That property alias is already in use." }, { status: 409 });
      }
      if (updateError) throw new Error(updateError.message);
    }

    const hasProfileUpdates = name || title !== undefined || phone !== undefined || cardAccentRaw !== undefined;
    if (hasProfileUpdates) {
      const profileUpdate: Record<string, string | null> = {
        updated_at: new Date().toISOString(),
      };
      if (name) profileUpdate.full_name = name;
      if (title !== undefined) profileUpdate.title = title;
      if (phone !== undefined) profileUpdate.phone = phone;
      if (cardAccentRaw !== undefined) profileUpdate.card_accent = cardAccentRaw;

      const { error } = await supabase
        .from("user_profiles")
        .update(profileUpdate as never)
        .eq("user_id", workspace.user.id);
      if (error) throw new Error(error.message);
    }

    const refreshedWorkspace = await requireAdminContext(request);

    return NextResponse.json({
      workspace: refreshedWorkspace,
      profile: profilePayload(refreshedWorkspace, {
        name: name || undefined,
        title: title !== undefined ? title : refreshedWorkspace.user.title,
        phone: phone !== undefined ? phone : refreshedWorkspace.user.phone,
        cardAccent: cardAccentRaw !== undefined ? cardAccentRaw : refreshedWorkspace.user.cardAccent,
      }),
    });
  } catch (caught) {
    return NextResponse.json(
      { error: caught instanceof Error ? caught.message : "Failed to update profile." },
      { status: caught instanceof AdminAuthError ? caught.status : 500 }
    );
  }
}
