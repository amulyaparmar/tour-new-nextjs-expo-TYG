import { NextResponse } from "next/server";

let notifications = {
  lowScore: true,
  newSession: true,
  weeklyDigest: true,
  followUpDue: true,
};

export async function GET() {
  return NextResponse.json({ notifications });
}

export async function PATCH(request: Request) {
  const body = (await request.json()) as Partial<typeof notifications>;
  notifications = {
    ...notifications,
    ...Object.fromEntries(
      Object.entries(body).filter(([, value]) => typeof value === "boolean")
    ),
  };
  return NextResponse.json({ notifications });
}
