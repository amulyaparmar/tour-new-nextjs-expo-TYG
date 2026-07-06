import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { requireAdminContext } from "@/lib/admin-auth";
import {
  createPresignedUpload,
  resolveUploadExtension,
} from "@/lib/storage";

export async function POST(request: Request) {
  try {
    await requireAdminContext(request);

    const body = (await request.json()) as {
      fileName?: string;
      contentType?: string;
    };

    const fileName = String(body.fileName ?? "asset.bin").trim() || "asset.bin";
    const contentType = String(body.contentType ?? "application/octet-stream").trim()
      || "application/octet-stream";
    const ext = resolveUploadExtension(fileName, contentType);
    const storageId = `material-${randomUUID()}`;
    const objectKey = `${storageId}.${ext}`;

    const presign = await createPresignedUpload(objectKey);
    return NextResponse.json({ ...presign, storageId });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to prepare upload." },
      { status: 500 }
    );
  }
}
