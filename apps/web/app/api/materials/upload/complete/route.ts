import { NextResponse } from "next/server";

import { requireAdminContext } from "@/lib/admin-auth";
import { createMaterial } from "@/lib/materials";
import {
  getRecordingPlaybackPath,
  storageObjectExists,
} from "@/lib/storage";

export async function POST(request: Request) {
  try {
    const workspace = await requireAdminContext(request);
    const body = (await request.json()) as {
      objectKey?: string;
      storageId?: string;
      name?: string;
      description?: string;
      type?: string;
    };

    const objectKey = String(body.objectKey ?? "").trim();
    if (!objectKey || !objectKey.startsWith("material-")) {
      return NextResponse.json({ error: "Invalid upload object key." }, { status: 400 });
    }

    const exists = await storageObjectExists(objectKey);
    if (!exists) {
      return NextResponse.json({ error: "Uploaded file not found in storage." }, { status: 400 });
    }

    const typeParam = String(body.type ?? "other").trim();
    const type = (["rubric", "training", "recording", "other"].includes(typeParam)
      ? typeParam
      : "other") as "rubric" | "training" | "recording" | "other";
    const materialName = String(body.name ?? "").trim() || "Tour content";
    const description = String(body.description ?? "").trim();
    const storageId = objectKey.replace(/\.[^.]+$/, "");
    const fileUrl = getRecordingPlaybackPath(storageId);

    const material = await createMaterial({
      name: materialName,
      type,
      description,
      fileUrl,
      propertyId: workspace.community.id,
    });

    return NextResponse.json({ material }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to finalize upload." },
      { status: 500 }
    );
  }
}
