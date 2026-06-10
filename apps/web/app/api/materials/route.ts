import { NextResponse } from "next/server";
import { createMaterial, listMaterials } from "@/lib/materials";

export async function GET() {
  try {
    const materials = await listMaterials();
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
      description: body.description ?? ""
    });

    return NextResponse.json({ material }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create material." },
      { status: 500 }
    );
  }
}
