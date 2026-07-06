import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { AdminAuthError, requireAdminContext } from "@/lib/admin-auth";
import {
  createPresignedUpload,
  resolveUploadExtension,
} from "@/lib/storage";

export async function POST(request: Request) {
  try {
    const workspace = await requireAdminContext(request);
    if (workspace.membership.role === "member") {
      throw new AdminAuthError("Manager access is required to extract rubrics.", 403);
    }

    const body = (await request.json()) as {
      fileName?: string;
      contentType?: string;
    };

    const fileName = String(body.fileName ?? "rubric-template.txt").trim() || "rubric-template.txt";
    const contentType = String(body.contentType ?? "application/octet-stream").trim()
      || "application/octet-stream";
    const ext = resolveUploadExtension(fileName, contentType);
    const storageId = `extract-${randomUUID()}`;
    const objectKey = `${storageId}.${ext}`;

    const presign = await createPresignedUpload(objectKey);
    return NextResponse.json({ ...presign, storageId });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to prepare upload." },
      { status: error instanceof AdminAuthError ? error.status : 500 }
    );
  }
}
