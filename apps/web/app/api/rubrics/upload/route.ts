import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      error: "Direct uploads are no longer supported. Use /upload/presign and /upload/complete instead.",
    },
    { status: 410 }
  );
}
