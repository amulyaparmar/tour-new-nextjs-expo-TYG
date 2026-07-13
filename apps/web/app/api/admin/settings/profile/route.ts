import { NextResponse } from "next/server";

import { AdminAuthError, requireAdminContext } from "@/lib/admin-auth";
import { getSupabaseServiceClient } from "@/lib/supabase";

type PropertySettingsRow = {
  alias: string | null;
  metadata: unknown;
};

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

export async function GET(request: Request) {
  try {
    const workspace = await requireAdminContext(request);
    return NextResponse.json({
      profile: {
        name: workspace.user.fullName ?? workspace.user.email.split("@")[0],
        email: workspace.user.email,
        role: workspace.teamMember.role,
        company: workspace.organization.name,
        community: workspace.community.name,
        userAlias: workspace.teamMember.alias,
        propertyAlias: workspace.community.alias,
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
    const body = (await request.json()) as {
      name?: string;
      userAlias?: string | null;
      propertyAlias?: string | null;
    };
    const name = body.name?.trim();
    const userAlias = normalizeAlias(body.userAlias);
    const propertyAlias = normalizeAlias(body.propertyAlias);
    if (!name && userAlias === undefined && propertyAlias === undefined) {
      return NextResponse.json({ error: "At least one profile setting is required." }, { status: 400 });
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

      const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (userAlias !== undefined) update.metadata = metadata;
      if (propertyAlias !== undefined) update.alias = propertyAlias;
      const { error: updateError } = await supabase
        .from("propertiesTYG")
        .update(update as never)
        .eq("id", workspace.community.propertyTygId);
      if (updateError?.code === "23505") {
        return NextResponse.json({ error: "That property alias is already in use." }, { status: 409 });
      }
      if (updateError) throw new Error(updateError.message);
    }

    if (name) {
      const { error } = await supabase
        .from("user_profiles")
        .update({ full_name: name, updated_at: new Date().toISOString() } as never)
        .eq("user_id", workspace.user.id);
      if (error) throw new Error(error.message);
    }

    const refreshedWorkspace = await requireAdminContext(request);

    return NextResponse.json({
      workspace: refreshedWorkspace,
      profile: {
        name: name ?? refreshedWorkspace.user.fullName ?? refreshedWorkspace.user.email.split("@")[0],
        email: workspace.user.email,
        role: refreshedWorkspace.teamMember.role,
        company: refreshedWorkspace.organization.name,
        community: refreshedWorkspace.community.name,
        userAlias: refreshedWorkspace.teamMember.alias,
        propertyAlias: refreshedWorkspace.community.alias,
      },
    });
  } catch (caught) {
    return NextResponse.json(
      { error: caught instanceof Error ? caught.message : "Failed to update profile." },
      { status: caught instanceof AdminAuthError ? caught.status : 500 }
    );
  }
}
