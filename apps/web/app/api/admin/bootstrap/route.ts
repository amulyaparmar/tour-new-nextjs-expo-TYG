import { NextResponse } from "next/server";

import { getAdminBootstrap } from "@/lib/admin";
import { AdminAuthError, requireAdminContext } from "@/lib/admin-auth";

export async function GET(request: Request) {
  try {
    const workspace = await requireAdminContext(request);
    const data = await getAdminBootstrap(workspace);
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load admin data." },
      { status: error instanceof AdminAuthError ? error.status : 500 }
    );
  }
}
