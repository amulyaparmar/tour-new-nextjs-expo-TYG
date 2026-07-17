import { NextResponse } from "next/server";

import {
  AdminAuthError,
  createSupabaseAnonClient,
  listAccessibleBusinessOptionsForEmail,
  readAdminAccessCookie,
} from "@/lib/admin-auth";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const query = params.get("q")?.trim() ?? "";
  const emailParam = params.get("email")?.trim().toLowerCase() ?? "";
  const limitParam = Number(params.get("limit"));
  const limit = Number.isFinite(limitParam) ? limitParam : 50;

  try {
    let email = emailParam;
    if (!email) {
      email = await emailFromRequest(request);
    }
    if (!email.includes("@")) {
      return NextResponse.json(
        { businesses: [], error: "Enter your work email to load your properties." },
        { status: 400 }
      );
    }

    const businesses = await listAccessibleBusinessOptionsForEmail({
      email,
      query,
      limit,
    });

    return NextResponse.json(
      {
        businesses,
        hasMore: businesses.length >= Math.max(1, Math.min(limit, 1000)),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (caught) {
    const status = caught instanceof AdminAuthError ? caught.status : 500;
    return NextResponse.json(
      { error: caught instanceof Error ? caught.message : "Could not load properties." },
      { status }
    );
  }
}

async function emailFromRequest(request: Request) {
  const token = readBearerToken(request) ?? readAdminAccessCookie(request);
  if (!token) throw new AdminAuthError("Sign in is required.");
  const supabase = createSupabaseAnonClient();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user?.email) throw new AdminAuthError("Your session has expired.");
  return data.user.email.trim().toLowerCase();
}

function readBearerToken(request: Request) {
  const header = request.headers.get("authorization");
  if (!header?.toLowerCase().startsWith("bearer ")) return null;
  return header.slice("bearer ".length).trim();
}
