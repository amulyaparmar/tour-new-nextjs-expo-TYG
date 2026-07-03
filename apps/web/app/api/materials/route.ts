import { NextResponse } from "next/server";
import { hasAdminSession, requireAdminContext } from "@/lib/admin-auth";
import { createMaterial, listVisibleMaterials } from "@/lib/materials";

export async function GET(request: Request) {
  try {
    const workspace = hasAdminSession(request) ? await requireAdminContext(request) : null;
    const materials = await listVisibleMaterials(
      workspace?.community.alias ?? undefined,
      workspace?.community.id
    );
    return NextResponse.json({ materials });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list materials." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const workspace = hasAdminSession(request) ? await requireAdminContext(request) : null;
    const body = (await request.json()) as {
      name?: string;
      type?: "rubric" | "training" | "other";
      description?: string;
    };

    if (!body.name || !body.type) {
      return NextResponse.json({ error: "name and type are required." }, { status: 400 });
    }

    const material = await createMaterial({
      name: body.name,
      type: body.type,
      description: body.description ?? "",
      propertyId: workspace?.community.id ?? null
    });

    return NextResponse.json({ material }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create material." },
      { status: 500 }
    );
  }
}
