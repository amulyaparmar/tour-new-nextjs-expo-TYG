import { NextResponse } from "next/server";

import { deleteMaterial } from "@/lib/materials";

type Context = {
  params: Promise<{
    id: string;
  }>;
};

export async function DELETE(_request: Request, context: Context) {
  const { id } = await context.params;

  if (id.startsWith("tour-api-")) {
    return NextResponse.json(
      { error: "Tour.video feed materials cannot be deleted here." },
      { status: 400 }
    );
  }

  try {
    await deleteMaterial(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Delete failed." },
      { status: 500 }
    );
  }
}
