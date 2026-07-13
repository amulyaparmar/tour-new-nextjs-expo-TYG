import Link from "next/link";
import { ContactCardPanel } from "../ContactCardPanel";
import { requireTourWorkspace } from "@/lib/tour-auth";
import { WorkspaceActions } from "./WorkspaceActions";
import { AliasSettings } from "./AliasSettings";

export default async function ProfilePage() {
  const workspace = await requireTourWorkspace();
  const displayName = workspace.user.fullName ?? workspace.user.email.split("@")[0] ?? "Tour user";
  const initials = displayName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();

  return (
    <>
      <div className="page-header">
        <h1>Profile</h1>
        <p>Manage your account and resources</p>
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <div className="card-body" style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{
            width: 48,
            height: 48,
            borderRadius: "var(--radius-full)",
            background: "var(--indigo-600)",
            color: "white",
            display: "grid",
            placeItems: "center",
            fontSize: 18,
            fontWeight: 700,
            flexShrink: 0
          }}>
            {initials}
          </span>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "var(--slate-900)" }}>{displayName}</div>
            <div style={{ fontSize: 13, color: "var(--slate-500)" }}>
              {workspace.user.email} · {workspace.teamMember.role}
            </div>
            <div style={{ fontSize: 12, color: "var(--indigo-600)", fontWeight: 700, marginTop: 3 }}>
              {workspace.community.name}
            </div>
          </div>
        </div>
      </div>

      <WorkspaceActions
        communities={workspace.communities}
        currentCommunityId={workspace.community.id}
      />

      <AliasSettings
        initialPropertyAlias={workspace.community.alias ?? ""}
        initialUserAlias={workspace.teamMember.alias ?? ""}
        propertyId={workspace.community.propertyTygId}
        memberFallback={workspace.teamMember.id ?? workspace.user.email.split("@")[0] ?? workspace.user.id}
      />

      <ContactCardPanel id="profile-contact-card-heading" />

      <div className="card">
        <Link href="/materials" className="session-row">
          <div className="session-row-info">
            <div className="session-row-title">📋 Materials &amp; Rubrics</div>
            <div className="session-row-meta">Manage rubrics, training docs, and resources</div>
          </div>
          <span style={{ color: "var(--slate-400)", fontSize: 18 }}>›</span>
        </Link>
        <Link href="/sessions" className="session-row">
          <div className="session-row-info">
            <div className="session-row-title">📊 All Sessions</div>
            <div className="session-row-meta">View complete session history</div>
          </div>
          <span style={{ color: "var(--slate-400)", fontSize: 18 }}>›</span>
        </Link>
        <Link href="/calendar" className="session-row">
          <div className="session-row-info">
            <div className="session-row-title">📅 Calendar</div>
            <div className="session-row-meta">Browse sessions by date</div>
          </div>
          <span style={{ color: "var(--slate-400)", fontSize: 18 }}>›</span>
        </Link>
      </div>
    </>
  );
}
