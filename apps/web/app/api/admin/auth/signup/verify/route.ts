import { NextResponse } from "next/server";

import { createSupabaseAnonClient } from "@/lib/admin-auth";
import { completeRegistration, registrationSessionResponse } from "@/lib/registration";
import { getSupabaseServiceClient } from "@/lib/supabase";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as {
    requestId?: string;
    email?: string;
    token?: string;
  };
  const email = body.email?.trim().toLowerCase() ?? "";
  const token = body.token?.replace(/\s+/g, "") ?? "";
  if (!body.requestId || !email || token.length < 6) {
    return NextResponse.json({ error: "Registration, email, and OTP are required." }, { status: 400 });
  }

  try {
    const service = getSupabaseServiceClient();
    const { data: signup, error: requestError } = await service
      .from("registration_requests")
      .select("id,email,status,expires_at")
      .eq("id", body.requestId)
      .eq("email", email)
      .eq("status", "pending")
      .maybeSingle<{ id: string; email: string; status: string; expires_at: string }>();
    if (requestError) throw new Error(requestError.message);
    if (!signup || new Date(signup.expires_at).getTime() <= Date.now()) {
      return NextResponse.json({ error: "This verification request has expired." }, { status: 410 });
    }

    const auth = createSupabaseAnonClient();
    const { data, error } = await auth.auth.verifyOtp({
      email,
      token,
      type: "signup",
    });
    if (error || !data.user || !data.session) {
      return NextResponse.json(
        { error: error?.message ?? "The verification code is invalid." },
        { status: 400 }
      );
    }

    const workspace = await completeRegistration(signup.id, data.user);
    return registrationSessionResponse(workspace, data.session);
  } catch (caught) {
    return NextResponse.json(
      { error: caught instanceof Error ? caught.message : "Could not complete registration." },
      { status: 500 }
    );
  }
}
