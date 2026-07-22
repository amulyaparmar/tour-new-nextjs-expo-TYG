"use client";

import { useState } from "react";
import { Building2, LogOut } from "lucide-react";

type Community = {
  id: string;
  name: string;
};

export function WorkspaceActions({
  communities,
  currentCommunityId,
}: {
  communities: Community[];
  currentCommunityId: string;
}) {
  const [switching, setSwitching] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function switchCommunity(communityId: string) {
    if (communityId === currentCommunityId) return;
    setSwitching(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/auth/community", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ communityId }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Could not switch community.");
      window.location.assign("/");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not switch community.");
      setSwitching(false);
    }
  }

  async function logout() {
    setSigningOut(true);
    await fetch("/api/admin/auth/logout", { method: "POST" }).catch(() => {});
    window.location.assign("/login");
  }

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div
        className="card-body"
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 18,
          flexWrap: "wrap",
        }}
      >
        <div style={{ flex: "1 1 320px", maxWidth: 560 }}>
          <label className="form-label" htmlFor="profile-community" style={{ display: "block", marginBottom: 7 }}>
            <Building2 size={14} style={{ display: "inline", marginRight: 6, verticalAlign: "-2px" }} />
            Active property
          </label>
          <select
            id="profile-community"
            className="form-select"
            value={currentCommunityId}
            disabled={switching}
            onChange={(event) => void switchCommunity(event.target.value)}
            style={{ width: "100%" }}
          >
            {communities.map((community) => (
              <option key={community.id} value={community.id}>{community.name}</option>
            ))}
          </select>
          {error && <p style={{ marginTop: 8, color: "var(--red-700)", fontSize: 12 }}>{error}</p>}
        </div>
        <button
          type="button"
          className="btn btn-outline"
          disabled={signingOut}
          onClick={() => void logout()}
          style={{ display: "inline-flex", alignItems: "center", gap: 7, flex: "0 0 auto" }}
        >
          <LogOut size={15} />
          {signingOut ? "Signing out..." : "Sign out"}
        </button>
      </div>
    </div>
  );
}
