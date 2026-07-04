"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Building2, Check, ChevronDown, IdCard, LogIn, Plus, Search, Video } from "lucide-react";

type CommunityOption = {
  id: string;
  name: string;
  alias: string | null;
};

type UserOption = {
  id: string;
  name: string;
  role: string;
  initials: string;
};

export function WorkspaceSwitcher({
  currentCommunity,
  communities,
  user,
}: {
  currentCommunity: CommunityOption;
  communities: CommunityOption[];
  user: { id: string; email: string; fullName: string | null };
}) {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const [openMenu, setOpenMenu] = useState<"property" | "profile" | null>(null);
  const [profileView, setProfileView] = useState<"users" | "properties">("users");
  const [selectedUser, setSelectedUser] = useState<UserOption | null>(null);
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [userSearch, setUserSearch] = useState("");

  const users = useMemo(() => buildUserOptions(user), [user]);
  const visibleUsers = useMemo(() => {
    const query = userSearch.trim().toLowerCase();
    if (!query) return users;
    return users.filter((item) =>
      `${item.name} ${item.role}`.toLowerCase().includes(query)
    );
  }, [userSearch, users]);

  useEffect(() => {
    const savedName = window.localStorage.getItem("tour:selectedUserName");
    const savedUser = savedName
      ? users.find((item) => item.name === savedName)
      : null;
    if (savedUser) setSelectedUser(savedUser);
  }, [users]);

  useEffect(() => {
    function closeOnOutsideClick(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpenMenu(null);
        setProfileView("users");
        setUserSearch("");
      }
    }
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, []);

  async function switchCommunity(communityId: string) {
    if (communityId === currentCommunity.id || switchingId) {
      setOpenMenu(null);
      setProfileView("users");
      return;
    }

    setSwitchingId(communityId);
    try {
      const response = await fetch("/api/admin/auth/community", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ communityId }),
      });
      if (!response.ok) throw new Error("Could not switch property.");
      setOpenMenu(null);
      setProfileView("users");
      router.refresh();
    } finally {
      setSwitchingId(null);
    }
  }

  function openProfileMenu() {
    setOpenMenu((open) => open === "profile" ? null : "profile");
    setProfileView("users");
    setUserSearch("");
  }

  function selectUser(item: UserOption) {
    setSelectedUser(item);
    setProfileView("properties");
    window.localStorage.setItem("tour:selectedUserName", item.name);
    window.dispatchEvent(new CustomEvent("tour:selected-user-change", {
      detail: { name: item.name },
    }));
  }

  async function goToLogin() {
    await fetch("/api/admin/auth/logout", { method: "POST" }).catch(() => {});
    setOpenMenu(null);
    setProfileView("users");
    router.push("/login");
  }

  return (
    <div className="top-bar-actions" ref={rootRef}>
      <div className="top-switcher">
        <button
          type="button"
          className="top-property-button"
          aria-haspopup="menu"
          aria-expanded={openMenu === "property"}
          onClick={() => setOpenMenu((open) => open === "property" ? null : "property")}
        >
          <Building2 size={14} aria-hidden="true" />
          <span>{currentCommunity.name}</span>
          <ChevronDown size={14} aria-hidden="true" />
        </button>

        {openMenu === "property" && (
          <div className="top-popover top-popover-property" role="menu">
            <div className="top-popover-heading">Switch property</div>
            <PropertyList
              communities={communities}
              currentCommunityId={currentCommunity.id}
              switchingId={switchingId}
              onSelect={switchCommunity}
            />
          </div>
        )}
      </div>

      <div className="top-switcher">
        <button
          type="button"
          className="top-launcher-button"
          aria-label="Open profile and workspace menu"
          aria-haspopup="menu"
          aria-expanded={openMenu === "profile"}
          onClick={openProfileMenu}
        >
          <NineDotGridIcon />
        </button>

        {openMenu === "profile" && (
          <div className="top-popover top-popover-profile" role="menu">
            <div className="top-popover-hero">
              <div className="top-popover-hero-title">
                <div className="top-popover-kicker">Workspace</div>
                <strong>{currentCommunity.name}</strong>
                <span>{selectedUser?.name ?? user.fullName ?? "LeaseMagnets"}</span>
              </div>
              <NineDotGridIcon />
            </div>

            {profileView === "users" ? (
              <>
                <div className="top-tool-grid" aria-label="Profile actions">
                  <TopTool href="/sessions" icon={<Video size={16} />} label="My Sessions" />
                  <TopTool href="/profile" icon={<IdCard size={16} />} label="My Card" />
                  <TopTool href="/new" icon={<Plus size={16} />} label="Add New Lead" />
                </div>

                <div className="top-user-search-row">
                  <div className="top-user-search">
                    <Search size={15} aria-hidden="true" />
                    <input
                      value={userSearch}
                      onChange={(event) => setUserSearch(event.target.value)}
                      placeholder="Search users"
                      aria-label="Search users"
                    />
                  </div>
                  <button
                    type="button"
                    className="top-login-icon-button"
                    onClick={goToLogin}
                    aria-label="Add new or login"
                    title="Add New / Login"
                  >
                    <LogIn size={15} aria-hidden="true" />
                  </button>
                </div>

                <div className="top-popover-heading">Switch user</div>
                <div className="top-user-grid">
                  {visibleUsers.map((item) => (
                    <button
                      type="button"
                      key={item.id}
                      className="top-user-card"
                      onClick={() => selectUser(item)}
                    >
                      <span className="top-user-avatar">{item.initials}</span>
                      <strong>{item.name}</strong>
                      <span>{item.role}</span>
                    </button>
                  ))}
                </div>
                {visibleUsers.length === 0 && (
                  <div className="top-empty-state">No users found</div>
                )}
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="top-back-button"
                  onClick={() => setProfileView("users")}
                >
                  <ChevronDown size={14} aria-hidden="true" />
                  Back to users
                </button>
                <div className="top-popover-heading">
                  Properties for {selectedUser?.name ?? "user"}
                </div>
                <PropertyList
                  communities={communities}
                  currentCommunityId={currentCommunity.id}
                  switchingId={switchingId}
                  onSelect={switchCommunity}
                />
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function PropertyList({
  communities,
  currentCommunityId,
  switchingId,
  onSelect,
}: {
  communities: CommunityOption[];
  currentCommunityId: string;
  switchingId: string | null;
  onSelect: (communityId: string) => void;
}) {
  return (
    <div className="top-property-list">
      {communities.map((community) => {
        const active = community.id === currentCommunityId;
        return (
          <button
            type="button"
            key={community.id}
            className={`top-property-option ${active ? "top-property-option-active" : ""}`}
            disabled={switchingId === community.id}
            onClick={() => onSelect(community.id)}
          >
            <span className="top-property-icon"><Building2 size={14} aria-hidden="true" /></span>
            <span>
              <strong>{community.name}</strong>
              {community.alias && <small>{community.alias}</small>}
            </span>
            {active && <Check size={15} aria-hidden="true" />}
          </button>
        );
      })}
    </div>
  );
}

function TopTool({
  href,
  icon,
  label,
}: {
  href: string;
  icon: ReactNode;
  label: string;
}) {
  return (
    <Link href={href} className="top-tool-card">
      <span>{icon}</span>
      <strong>{label}</strong>
    </Link>
  );
}

function NineDotGridIcon() {
  return (
    <span className="nine-dot-grid" aria-hidden="true">
      {Array.from({ length: 9 }).map((_, index) => (
        <span key={index} />
      ))}
    </span>
  );
}

function buildUserOptions(user: { id: string; email: string; fullName: string | null }): UserOption[] {
  const primaryName = user.fullName ?? user.email.split("@")[0] ?? "LeaseMagnets";
  const options: UserOption[] = [
    {
      id: user.id,
      name: primaryName,
      role: "Active user",
      initials: initialsFor(primaryName),
    },
    { id: "leasing-team", name: "Leasing Team", role: "Team inbox", initials: "LT" },
    { id: "tour-ai", name: "TourAI", role: "AI assistant", initials: "AI" },
    { id: "amulya-parmar", name: "Amulya Parmar", role: "Manager", initials: "AP" },
  ];

  const seen = new Set<string>();
  return options.filter((option) => {
    const key = option.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function initialsFor(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "LM";
}
