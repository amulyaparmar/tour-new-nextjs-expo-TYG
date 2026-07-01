import { NextResponse } from "next/server";

import { getAdminBootstrap } from "@/lib/admin";

export async function GET() {
  try {
    const data = await getAdminBootstrap();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load admin data." },
      { status: 500 }
    );
  }
}
