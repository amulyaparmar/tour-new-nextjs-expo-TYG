import { NextResponse } from "next/server";

import { createSupabaseAnonClient } from "@/lib/admin-auth";
import { getSupabaseServiceClient } from "@/lib/supabase";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as {
    requestId?: string;
    email?: string;
  };
  const email = body.email?.trim().toLowerCase() ?? "";
  if (!body.requestId || !email) {
    return NextResponse.json({ error: "Registration and email are required." }, { status: 400 });
  }

  try {
    const service = getSupabaseServiceClient();
    const { data: signup, error: requestError } = await service
      .from("registration_requests")
      .select("id,expires_at")
      .eq("id", body.requestId)
      .eq("email", email)
      .eq("status", "pending")
      .maybeSingle<{ id: string; expires_at: string }>();
    if (requestError) throw new Error(requestError.message);
    if (!signup || new Date(signup.expires_at).getTime() <= Date.now()) {
      return NextResponse.json({ error: "This verification request has expired." }, { status: 410 });
    }

    const auth = createSupabaseAnonClient();
    const { error } = await auth.auth.resend({ type: "signup", email });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ sent: true });
  } catch (caught) {
    return NextResponse.json(
      { error: caught instanceof Error ? caught.message : "Could not resend verification." },
      { status: 500 }
    );
  }
}
