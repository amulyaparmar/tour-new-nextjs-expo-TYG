import Link from "next/link";
import { ContactCardPanel } from "../ContactCardPanel";
import { contactCard } from "../contact-card-data";

export default function ProfilePage() {
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
            {contactCard.initials}
          </span>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "var(--slate-900)" }}>{contactCard.name}</div>
            <div style={{ fontSize: 13, color: "var(--slate-500)" }}>{contactCard.title}</div>
          </div>
        </div>
      </div>

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
