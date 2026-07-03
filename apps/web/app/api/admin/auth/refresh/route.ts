import { NextResponse } from "next/server";

import {
  AdminAuthError,
  createSupabaseAnonClient,
  resolveAdminContextForUser,
} from "@/lib/admin-auth";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    refreshToken?: string;
    communityId?: string;
  };
  if (!body.refreshToken) {
    return NextResponse.json({ error: "refreshToken is required." }, { status: 400 });
  }

  try {
    const supabase = createSupabaseAnonClient();
    const { data, error } = await supabase.auth.refreshSession({
      refresh_token: body.refreshToken,
    });
    if (error || !data.user || !data.session) {
      return NextResponse.json(
        { error: error?.message ?? "Your session has expired." },
        { status: 401 }
      );
    }

    const workspace = await resolveAdminContextForUser(data.user, body.communityId);
    return NextResponse.json({
      workspace,
      session: {
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
        expiresAt: data.session.expires_at ?? Math.floor(Date.now() / 1000) + data.session.expires_in,
      },
    });
  } catch (caught) {
    const status = caught instanceof AdminAuthError ? caught.status : 500;
    return NextResponse.json(
      { error: caught instanceof Error ? caught.message : "Could not refresh the session." },
      { status }
    );
  }
}
