"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Building2, Check, ChevronDown, IdCard, LogIn, MapPin, Plus, Search, ShieldCheck, Sparkles, Video } from "lucide-react";

type CommunityOption = {
  id: string;
  name: string;
  alias: string | null;
};

type BusinessOption = {
  id: string;
  name: string;
  alias: string | null;
};

type PropertyOnboardingCandidate = {
  placeId: string;
  name: string;
  address: string | null;
  website: string | null;
  state: "new" | "indexed" | "enriched";
  alreadyAssigned: boolean;
  thumbnailUrl: string | null;
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
  const queryClient = useQueryClient();
  const rootRef = useRef<HTMLDivElement>(null);
  const [openMenu, setOpenMenu] = useState<"property" | "profile" | null>(null);
  const [profileView, setProfileView] = useState<"users" | "properties">("users");
  const [propertyView, setPropertyView] = useState<"assigned" | "add" | "confirm">("assigned");
  const [selectedUser, setSelectedUser] = useState<UserOption | null>(null);
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [userSearch, setUserSearch] = useState("");
  const [propertySearch, setPropertySearch] = useState("");
  const [addSearch, setAddSearch] = useState("");
  const [debouncedAddSearch, setDebouncedAddSearch] = useState("");
  const [selectedCandidate, setSelectedCandidate] = useState<PropertyOnboardingCandidate | null>(null);
  const [joiningPlaceId, setJoiningPlaceId] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);

  const users = useMemo(() => buildUserOptions(user), [user]);
  const linkedPropertiesQuery = useQuery({
    queryKey: ["admin-auth", "linked-properties", user.email],
    queryFn: fetchLinkedProperties,
    enabled: Boolean(user.email),
    placeholderData: communities,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
  const linkedProperties = linkedPropertiesQuery.data ?? communities;
  const visibleProperties = useMemo(() => {
    const query = propertySearch.trim().toLowerCase();
    if (!query) return linkedProperties;
    return linkedProperties.filter((community) =>
      `${community.name} ${community.alias ?? ""}`.toLowerCase().includes(query)
    );
  }, [linkedProperties, propertySearch]);
  const propertyLoading = linkedPropertiesQuery.isFetching && !linkedPropertiesQuery.dataUpdatedAt;
  const propertyError = linkedPropertiesQuery.error instanceof Error
    ? linkedPropertiesQuery.error.message
    : null;
  const propertySearchQuery = useQuery({
    queryKey: ["property-onboarding-search", debouncedAddSearch],
    queryFn: () => searchPropertiesForOnboarding(debouncedAddSearch),
    enabled: openMenu !== null && propertyView === "add" && debouncedAddSearch.length >= 2,
    staleTime: 60 * 1000,
    retry: 1,
  });
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
        setPropertyView("assigned");
        setUserSearch("");
        setPropertySearch("");
        setAddSearch("");
        setSelectedCandidate(null);
        setJoinError(null);
      }
    }
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, []);

  async function switchCommunity(communityId: string) {
    if (communityId === currentCommunity.id || switchingId) {
      setOpenMenu(null);
      setProfileView("users");
      setPropertyView("assigned");
      setPropertySearch("");
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
      setPropertyView("assigned");
      setPropertySearch("");
      router.refresh();
    } finally {
      setSwitchingId(null);
    }
  }

  function openProfileMenu() {
    setOpenMenu((open) => open === "profile" ? null : "profile");
    setProfileView("users");
    setPropertyView("assigned");
    setUserSearch("");
    setPropertySearch("");
    setAddSearch("");
    setSelectedCandidate(null);
    setJoinError(null);
  }

  function selectUser(item: UserOption) {
    setSelectedUser(item);
    setProfileView("properties");
    setPropertyView("assigned");
    window.localStorage.setItem("tour:selectedUserName", item.name);
    window.dispatchEvent(new CustomEvent("tour:selected-user-change", {
      detail: { name: item.name },
    }));
  }

  async function goToLogin() {
    await fetch("/api/admin/auth/logout", { method: "POST" }).catch(() => {});
    setOpenMenu(null);
    setProfileView("users");
    setPropertyView("assigned");
    setPropertySearch("");
    router.push("/login");
  }

  function beginAddProperty() {
    setPropertyView("add");
    setAddSearch(propertySearch.trim());
    setDebouncedAddSearch(propertySearch.trim());
    setSelectedCandidate(null);
    setJoinError(null);
  }

  function backToAssignedProperties() {
    setPropertyView("assigned");
    setSelectedCandidate(null);
    setJoinError(null);
  }

  async function joinProperty(candidate: PropertyOnboardingCandidate) {
    if (joiningPlaceId) return;
    setJoiningPlaceId(candidate.placeId);
    setJoinError(null);
    try {
      const response = await fetch("/api/admin/properties/onboard", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ placeId: candidate.placeId }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.workspace?.community?.id) {
        throw new Error(body.error ?? "Could not add this property.");
      }
      await queryClient.invalidateQueries({ queryKey: ["admin-auth", "linked-properties", user.email] });
      await switchCommunity(body.workspace.community.id);
    } catch (caught) {
      setJoinError(caught instanceof Error ? caught.message : "Could not add this property.");
    } finally {
      setJoiningPlaceId(null);
    }
  }

  useEffect(() => {
    if (propertyView !== "add") return;
    const value = addSearch.trim();
    const timer = window.setTimeout(() => setDebouncedAddSearch(value), value ? 320 : 0);
    return () => window.clearTimeout(timer);
  }, [addSearch, propertyView]);

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
            {propertyView === "assigned" ? (
              <>
                <div className="top-popover-heading">Switch property</div>
                <PropertyList
                  communities={visibleProperties}
                  currentCommunityId={currentCommunity.id}
                  switchingId={switchingId}
                  search={propertySearch}
                  loading={propertyLoading}
                  error={propertyError}
                  onSearch={setPropertySearch}
                  onSelect={switchCommunity}
                  onAddProperty={beginAddProperty}
                />
              </>
            ) : (
              <AddPropertyPanel
                search={addSearch}
                debouncedSearch={debouncedAddSearch}
                candidates={propertySearchQuery.data ?? []}
                loading={propertySearchQuery.isLoading}
                error={propertySearchQuery.error instanceof Error ? propertySearchQuery.error.message : null}
                selectedCandidate={selectedCandidate}
                joiningPlaceId={joiningPlaceId}
                joinError={joinError}
                onSearch={setAddSearch}
                onBack={backToAssignedProperties}
                onSelectCandidate={(candidate) => {
                  setSelectedCandidate(candidate);
                  setPropertyView("confirm");
                  setJoinError(null);
                }}
                onRetry={() => void propertySearchQuery.refetch()}
                onJoin={joinProperty}
              />
            )}
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
                  communities={visibleProperties}
                  currentCommunityId={currentCommunity.id}
                  switchingId={switchingId}
                  search={propertySearch}
                  loading={propertyLoading}
                  error={propertyError}
                  onSearch={setPropertySearch}
                  onSelect={switchCommunity}
                  onAddProperty={beginAddProperty}
                />
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

async function searchPropertiesForOnboarding(query: string): Promise<PropertyOnboardingCandidate[]> {
  const normalizedQuery = query.trim();
  if (normalizedQuery.length < 2) return [];
  const response = await fetch(`/api/admin/properties/onboard?q=${encodeURIComponent(normalizedQuery)}`, {
    cache: "no-store",
    credentials: "same-origin",
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !Array.isArray(body.properties)) {
    throw new Error(body.error ?? "Could not search properties.");
  }
  return body.properties;
}

async function fetchLinkedProperties(): Promise<CommunityOption[]> {
  const params = new URLSearchParams({
    limit: "1000",
  });
  const response = await fetch(`/api/admin/auth/businesses?${params.toString()}`, {
    cache: "no-store",
    credentials: "same-origin",
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !Array.isArray(body.businesses)) {
    throw new Error(body.error ?? "Could not load properties.");
  }
  return body.businesses.map((business: BusinessOption) => ({
    id: business.id,
    name: business.name,
    alias: business.alias,
  }));
}

function PropertyList({
  communities,
  currentCommunityId,
  switchingId,
  search,
  loading,
  error,
  onSearch,
  onSelect,
  onAddProperty,
}: {
  communities: CommunityOption[];
  currentCommunityId: string;
  switchingId: string | null;
  search: string;
  loading: boolean;
  error: string | null;
  onSearch: (value: string) => void;
  onSelect: (communityId: string) => void;
  onAddProperty: () => void;
}) {
  return (
    <>
      <label className="top-property-search">
        <Search size={14} aria-hidden="true" />
        <input
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          placeholder="Search properties"
          aria-label="Search properties"
        />
      </label>
      <div className="top-property-count">
        {loading ? "Searching properties…" : `${communities.length} matching properties`}
      </div>
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
        {communities.length === 0 && (
          <div className="top-empty-state">{error ?? "No matching properties"}</div>
        )}
      </div>
      <button type="button" className="top-add-property-button" onClick={onAddProperty}>
        <span className="top-add-property-icon"><Plus size={15} aria-hidden="true" /></span>
        <span>
          <strong>Find or add a property</strong>
          <small>Search Google and join its property team</small>
        </span>
      </button>
    </>
  );
}

function AddPropertyPanel({
  search,
  debouncedSearch,
  candidates,
  loading,
  error,
  selectedCandidate,
  joiningPlaceId,
  joinError,
  onSearch,
  onBack,
  onSelectCandidate,
  onRetry,
  onJoin,
}: {
  search: string;
  debouncedSearch: string;
  candidates: PropertyOnboardingCandidate[];
  loading: boolean;
  error: string | null;
  selectedCandidate: PropertyOnboardingCandidate | null;
  joiningPlaceId: string | null;
  joinError: string | null;
  onSearch: (value: string) => void;
  onBack: () => void;
  onSelectCandidate: (candidate: PropertyOnboardingCandidate) => void;
  onRetry: () => void;
  onJoin: (candidate: PropertyOnboardingCandidate) => void;
}) {
  return (
    <div className="top-add-property-panel">
      <button type="button" className="top-back-button" onClick={onBack} disabled={Boolean(joiningPlaceId)}>
        <ArrowLeft size={14} aria-hidden="true" />
        Back to properties
      </button>
      <div className="top-popover-heading">{selectedCandidate ? "Confirm property" : "Add a property"}</div>

      {selectedCandidate ? (
        <div className="top-confirm-property">
          <div className="top-confirm-property-icon">
            <Building2 size={20} aria-hidden="true" />
          </div>
          <strong>{selectedCandidate.name}</strong>
          <span>{selectedCandidate.address || "Google business listing"}</span>
          <PropertyStateBadge state={selectedCandidate.state} />
          {joinError && <div className="top-add-error">{joinError}</div>}
          <div className="top-confirm-steps">
            <span><ShieldCheck size={14} aria-hidden="true" /> Add your exact email to the property team</span>
            <span><Sparkles size={14} aria-hidden="true" /> {selectedCandidate.state === "enriched" ? "Use existing enrichment" : "Start Tour.report enrichment"}</span>
          </div>
          <button
            type="button"
            className="top-confirm-property-button"
            disabled={Boolean(joiningPlaceId)}
            onClick={() => onJoin(selectedCandidate)}
          >
            {joiningPlaceId ? "Preparing property..." : selectedCandidate.alreadyAssigned ? "Open this property" : "Add property and continue"}
          </button>
          <small className="top-confirm-footnote">New team entries begin unverified and can be reviewed on Tour.report.</small>
        </div>
      ) : (
        <>
          <label className="top-property-search">
            <Search size={14} aria-hidden="true" />
            <input
              value={search}
              onChange={(event) => onSearch(event.target.value)}
              placeholder="Property name or city"
              aria-label="Search properties to add"
              autoFocus
            />
          </label>
          {debouncedSearch.length < 2 ? (
            <div className="top-search-prompt">
              <MapPin size={20} aria-hidden="true" />
              <strong>Find any property</strong>
              <span>Search by name and city to check Tour property intelligence.</span>
            </div>
          ) : loading ? (
            <div className="top-empty-state">Checking Tour property intelligence...</div>
          ) : error ? (
            <div className="top-empty-state">
              <span>{error}</span>
              <button type="button" className="top-text-button" onClick={onRetry}>Try again</button>
            </div>
          ) : candidates.length === 0 ? (
            <div className="top-empty-state">No properties found. Try the full property name and city.</div>
          ) : (
            <div className="top-property-list">
              {candidates.map((candidate) => (
                <button
                  key={candidate.placeId}
                  type="button"
                  className="top-property-candidate"
                  onClick={() => onSelectCandidate(candidate)}
                >
                  <span className="top-property-icon"><MapPin size={14} aria-hidden="true" /></span>
                  <span>
                    <strong>{candidate.name}</strong>
                    <small>{candidate.address || "Google business listing"}</small>
                    <PropertyStateBadge state={candidate.state} />
                  </span>
                  {candidate.alreadyAssigned && <Check size={15} aria-hidden="true" />}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function PropertyStateBadge({ state }: { state: PropertyOnboardingCandidate["state"] }) {
  return (
    <span className={`top-property-state top-property-state-${state}`}>
      {state === "enriched" ? "Enriched" : state === "indexed" ? "Indexed" : "New property"}
    </span>
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
