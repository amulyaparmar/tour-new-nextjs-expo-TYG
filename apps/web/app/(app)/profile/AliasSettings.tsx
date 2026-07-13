"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type AliasSettingsProps = {
  initialPropertyAlias: string;
  initialUserAlias: string;
  propertyId: string;
  memberFallback: string;
};

export function AliasSettings({
  initialPropertyAlias,
  initialUserAlias,
  propertyId,
  memberFallback,
}: AliasSettingsProps) {
  const router = useRouter();
  const [propertyAlias, setPropertyAlias] = useState(initialPropertyAlias);
  const [userAlias, setUserAlias] = useState(initialUserAlias);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const propertyKey = propertyAlias.trim() || propertyId;
  const memberKey = userAlias.trim() || memberFallback;
  const url = `/p/${encodeURIComponent(propertyKey)}/${encodeURIComponent(memberKey)}`;

  async function saveAliases() {
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/settings/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          propertyAlias: propertyAlias.trim() || null,
          userAlias: userAlias.trim() || null,
        }),
      });
      const body = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(body?.error ?? "Could not save aliases.");
      setMessage("Public check-in link saved.");
      router.refresh();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Could not save aliases.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div className="card-header">
        <div>
          <h2>Public check-in link</h2>
          <p style={{ margin: "4px 0 0", color: "var(--slate-500)", fontSize: 13 }}>
            Customize the property and team-member aliases used by your check-in page.
          </p>
        </div>
      </div>
      <div className="card-body">
        <div className="form-grid">
          <div className="form-group">
            <label className="form-label" htmlFor="property-alias">Property alias</label>
            <input
              id="property-alias"
              className="form-input"
              value={propertyAlias}
              placeholder="property-name"
              autoCapitalize="none"
              autoCorrect="off"
              onChange={(event) => setPropertyAlias(event.target.value)}
            />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="user-alias">Your alias</label>
            <input
              id="user-alias"
              className="form-input"
              value={userAlias}
              placeholder="your-name"
              autoCapitalize="none"
              autoCorrect="off"
              onChange={(event) => setUserAlias(event.target.value)}
            />
          </div>
        </div>
        <p style={{ margin: "12px 0", color: "var(--indigo-600)", fontWeight: 700, overflowWrap: "anywhere" }}>
          tour.you{url}
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <button type="button" className="btn btn-primary" disabled={saving} onClick={() => void saveAliases()}>
            {saving ? "Saving…" : "Save aliases"}
          </button>
          <a href={`${url}?check-in=true`} target="_blank" rel="noreferrer" className="btn btn-outline">
            Preview check-in page
          </a>
          {message ? <span role="status" style={{ color: "var(--slate-600)", fontSize: 13 }}>{message}</span> : null}
        </div>
      </div>
    </div>
  );
}
