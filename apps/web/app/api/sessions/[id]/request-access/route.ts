import { NextResponse } from "next/server";

import {
  AdminAuthError,
  buildSystemWorkspaceForProperty,
  findPropertyForSessionKey,
  isGlobalPropertyAdminEmail,
  requireAdminContext,
} from "@/lib/admin-auth";
import { recordPropertyAccessRequest } from "@/lib/property-team";
import { getSessionById } from "@/lib/sessions";
import { sendTransactionalEmail } from "@/lib/transactional-email";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  const { id: sessionId } = await context.params;
  try {
    const workspace = await requireAdminContext(request);
    if (isGlobalPropertyAdminEmail(workspace.user.email)) {
      return NextResponse.json(
        { error: "LeaseMagnets admins can switch directly without requesting access." },
        { status: 400 }
      );
    }

    const session = await getSessionById(sessionId);
    if (!session) return NextResponse.json({ error: "Session not found." }, { status: 404 });
    const property = await findPropertyForSessionKey(session.propertyId);
    if (!property) {
      return NextResponse.json({ error: "The session property could not be resolved." }, { status: 404 });
    }
    const targetWorkspace = await buildSystemWorkspaceForProperty(property.id);
    const recipients = Array.from(new Set(
      targetWorkspace.community.teamMembers
        .map((member) => member.email.trim().toLowerCase())
        .filter((email) => email && email !== workspace.user.email)
    ));
    if (recipients.length === 0) {
      return NextResponse.json(
        { error: "This property does not have an existing team member to approve access." },
        { status: 409 }
      );
    }

    const requesterName = workspace.user.fullName || workspace.teamMember.name || workspace.user.email;
    await recordPropertyAccessRequest({
      propertyId: property.id,
      sessionId,
      userId: workspace.user.id,
      email: workspace.user.email,
      name: requesterName,
    });

    const sessionUrl = new URL(`/sessions/${encodeURIComponent(sessionId)}`, request.url).toString();
    const subject = `${requesterName} requested access to ${property.name}`;
    const text = [
      `${requesterName} (${workspace.user.email}) requested access to a session for ${property.name}.`,
      "",
      `Session: ${session.title}`,
      `Review: ${sessionUrl}`,
      "",
      "Add this email to PropertiesTYG.metadata.property_team to grant access.",
    ].join("\n");
    const html = `
      <div style="font-family:Arial,sans-serif;color:#172033;line-height:1.55">
        <h2 style="margin:0 0 12px">Property access requested</h2>
        <p><strong>${escapeHtml(requesterName)}</strong> (${escapeHtml(workspace.user.email)}) requested access to a session for <strong>${escapeHtml(property.name)}</strong>.</p>
        <p><strong>Session:</strong> ${escapeHtml(session.title)}</p>
        <p><a href="${escapeHtml(sessionUrl)}" style="color:#326fc9">Review the session request</a></p>
        <p style="color:#64748b;font-size:13px">Add this email to PropertiesTYG.metadata.property_team to grant access.</p>
      </div>`;
    const delivery = await sendTransactionalEmail({
      to: recipients,
      replyTo: workspace.user.email,
      subject,
      html,
      text,
    });

    return NextResponse.json({
      ok: true,
      requested: true,
      recipientCount: recipients.length,
      emailConfigured: delivery.configured,
      emailsDelivered: delivery.delivered,
      emailsFailed: delivery.failed,
    });
  } catch (caught) {
    const status = caught instanceof AdminAuthError ? caught.status : 500;
    return NextResponse.json(
      { error: caught instanceof Error ? caught.message : "Could not request access." },
      { status }
    );
  }
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character] ?? character);
}
