import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { createMaterial } from "@/lib/materials";
import { storeRecording } from "@/lib/storage";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const name = String(formData.get("name") ?? "").trim();
    const description = String(formData.get("description") ?? "").trim();
    const typeParam = String(formData.get("type") ?? "other").trim();
    const type = (["rubric", "training", "recording", "other"].includes(typeParam)
      ? typeParam
      : "other") as "rubric" | "training" | "recording" | "other";

    if (!file || !(file instanceof Blob)) {
      return NextResponse.json({ error: "No file provided." }, { status: 400 });
    }

    const materialName = name || "Tour content";
    const fileUrl = await storeRecording(`material-${randomUUID()}`, file);
    const material = await createMaterial({
      name: materialName,
      type,
      description,
      fileUrl
    });

    return NextResponse.json({ material }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to upload material." },
      { status: 500 }
    );
  }
}
