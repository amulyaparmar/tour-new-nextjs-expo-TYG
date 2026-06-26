import { NextResponse } from "next/server";

let profile = {
  name: "Rachel Park",
  email: "rachel.park@themeridianmgmt.com",
  role: "Regional Manager",
  company: "Meridian Management Group",
};

export async function GET() {
  return NextResponse.json({ profile });
}

export async function PATCH(request: Request) {
  const body = (await request.json()) as Partial<typeof profile>;
  profile = {
    ...profile,
    ...Object.fromEntries(
      Object.entries(body).filter(([, value]) => typeof value === "string")
    ),
  };
  return NextResponse.json({ profile });
}
