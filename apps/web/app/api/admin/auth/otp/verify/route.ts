import { NextResponse } from "next/server";

import {
  AdminAuthError,
  createSupabaseAnonClient,
  resolveAdminContextForUser,
} from "@/lib/admin-auth";
import { getSupabaseServiceClient } from "@/lib/supabase";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as {
    email?: string;
    clientVerified?: boolean;
  };
  const email = body.email?.trim().toLowerCase() ?? "";

  if (!email || body.clientVerified !== true || request.headers.get("x-tour-client") !== "mobile") {
    return NextResponse.json(
      { error: "Email verification is required." },
      { status: 400 }
    );
  }

  try {
    const service = getSupabaseServiceClient();
    const { data: linkData, error: linkError } = await service.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    const tokenHash = linkData?.properties?.hashed_token;
    if (linkError || !tokenHash) {
      return NextResponse.json(
        { error: linkError?.message ?? "No Tour account is connected to this work email yet." },
        { status: 401 }
      );
    }

    const auth = createSupabaseAnonClient();
    const { data, error } = await auth.auth.verifyOtp({ token_hash: tokenHash, type: "magiclink" });
    if (error || !data.user || !data.session) {
      return NextResponse.json(
        { error: error?.message ?? "Could not create the app session." },
        { status: 400 }
      );
    }

    const workspace = await resolveAdminContextForUser(data.user);
    return NextResponse.json({
      workspace,
      session: {
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
        expiresAt:
          data.session.expires_at ??
          Math.floor(Date.now() / 1000) + data.session.expires_in,
      },
    });
  } catch (caught) {
    const status = caught instanceof AdminAuthError ? caught.status : 500;
    return NextResponse.json(
      { error: caught instanceof Error ? caught.message : "Could not verify the sign-in code." },
      { status }
    );
  }
}
