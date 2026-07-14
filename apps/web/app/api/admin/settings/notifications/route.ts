import { NextResponse } from "next/server";

import { AdminAuthError, requireAdminContext } from "@/lib/admin-auth";
import { patchPropertyTeamMember } from "@/lib/property-team";

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
    return NextResponse.json({
      notifications: {
        ...DEFAULTS,
        ...(workspace.teamMember.notificationPreferences ?? {}),
      },
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
    await patchPropertyTeamMember({
      propertyId: workspace.community.propertyTygId,
      email: workspace.user.email,
      patch: {
        user_id: workspace.user.id,
        notification_preferences: notifications,
      },
    });
    return NextResponse.json({ notifications });
  } catch (caught) {
    return NextResponse.json(
      { error: caught instanceof Error ? caught.message : "Failed to update notifications." },
      { status: caught instanceof AdminAuthError ? caught.status : 500 }
    );
  }
}
