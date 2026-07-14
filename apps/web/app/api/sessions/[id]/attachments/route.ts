import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import type { SessionAttachment } from "@tour/shared";
import { AdminAuthError, propertySessionKeys, requireAdminContext } from "@/lib/admin-auth";
import { addSessionAttachment, getSessionById } from "@/lib/sessions";

type Context = { params: Promise<{ id: string }> };
const TYPES = new Set<SessionAttachment["type"]>(["video", "image", "document", "link", "other"]);

export async function POST(request: Request, context: Context) {
  const { id } = await context.params;
  try {
    const workspace = await requireAdminContext(request);
    const session = await getSessionById(id);
    const allowedKeys = new Set(workspace.communities.flatMap(propertySessionKeys));
    if (!session || !session.propertyId || !allowedKeys.has(session.propertyId)) {
      throw new AdminAuthError("This session is not available to you.", 403);
    }

    const body = await request.json() as Partial<SessionAttachment>;
    const name = body.name?.trim();
    if (!name) return NextResponse.json({ error: "Attachment name is required." }, { status: 400 });
    const type = body.type && TYPES.has(body.type) ? body.type : "other";
    const attachment: SessionAttachment = {
      id: body.id?.trim() || randomUUID(),
      name,
      type,
      url: body.url?.trim() || null,
      materialId: body.materialId?.trim() || null,
      description: body.description?.trim() || null,
      mimeType: body.mimeType?.trim() || null,
      createdAt: new Date().toISOString(),
      addedBy: workspace.user.email,
    };
    await addSessionAttachment(id, attachment);
    return NextResponse.json({ attachment }, { status: 201 });
  } catch (caught) {
    return NextResponse.json(
      { error: caught instanceof Error ? caught.message : "Could not attach this asset." },
      { status: caught instanceof AdminAuthError ? caught.status : 500 },
    );
  }
}
