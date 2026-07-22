"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Trash2 } from "lucide-react";
import { SESSION_STATUS_LABELS, type SessionSummary } from "@tour/shared";
import { SessionCardCopy } from "@/app/components/SessionCardCopy";

type SortOption = "newest" | "oldest" | "score_desc" | "score_asc";
type TeamAgent = {
  id: string;
  name: string;
  fullName: string;
};
type PropertyOption = {
  id: string;
  name: string;
};
type AgentScope = "team" | "agent";
type DisplaySession = SessionSummary & { isSample?: boolean };

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "score_desc", label: "Score \u2193" },
  { value: "score_asc", label: "Score \u2191" },
];

const PAGE_SIZE = 20;

export function SessionsPageClient({
  agents,
  currentAgentId,
  properties,
}: {
  agents: TeamAgent[];
  currentAgentId: string | null;
  properties: PropertyOption[];
}) {
  const router = useRouter();
  const [sessions, setSessions] = useState<DisplaySession[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [showingSamples, setShowingSamples] = useState(false);
  const [samplePropertyName, setSamplePropertyName] = useState<string | null>(null);

  const [scope, setScope] = useState<AgentScope>("team");
  const [selectedAgentId, setSelectedAgentId] = useState(currentAgentId ?? agents[0]?.id ?? "");
  const [sort, setSort] = useState<SortOption>("newest");
  const [youMenuOpen, setYouMenuOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [selectedMenuOpen, setSelectedMenuOpen] = useState(false);
  const [deletingSelected, setDeletingSelected] = useState(false);

  const youPickerRef = useRef<HTMLDivElement>(null);
  const selectedMenuRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const selectedAgent = useMemo(
    () => agents.find((agent) => agent.id === selectedAgentId) ?? null,
    [agents, selectedAgentId]
  );

  const propertyNames = useMemo(
    () => properties.reduce<Record<string, string>>((map, property) => {
      map[property.id] = property.name;
      return map;
    }, {}),
    [properties]
  );
  const showPropertyInRows = properties.length > 1;

  const prefetchSession = useCallback((sessionId: string, isSample?: boolean) => {
    router.prefetch(`/sessions/${sessionId}${isSample ? "?sample=1" : ""}`);
  }, [router]);

  const openYouMenu = () => {
    clearTimeout(closeTimerRef.current);
    setYouMenuOpen(true);
  };

  const closeYouMenu = () => {
    closeTimerRef.current = setTimeout(() => setYouMenuOpen(false), 120);
  };

  const selectAgent = (agentId: string) => {
    setSelectedAgentId(agentId);
    setScope("agent");
    setYouMenuOpen(false);
  };

  const fetchPage = useCallback(async (p: number, replace: boolean) => {
    if (replace) setLoading(true);
    else setLoadingMore(true);

    try {
      const params = new URLSearchParams();
      params.set("page", String(p));
      params.set("limit", String(PAGE_SIZE));
      params.set("sort", sort);
      if (scope === "agent" && selectedAgentId) {
        params.set("agentId", selectedAgentId);
      }

      const res = await fetch(`/api/sessions?${params}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json() as {
        sessions: SessionSummary[];
        total: number;
        hasMore: boolean;
      };

      let nextSessions: DisplaySession[] = data.sessions;
      let nextHasMore = data.hasMore;
      let nextShowingSamples = false;
      let nextSamplePropertyName: string | null = null;

      if (replace && p === 1 && scope === "team" && data.total === 0 && data.sessions.length === 0) {
        const sampleRes = await fetch("/api/sessions/samples");
        if (sampleRes.ok) {
          const sampleData = await sampleRes.json() as {
            propertyName?: string;
            sessions?: SessionSummary[];
          };
          if (sampleData.sessions?.length) {
            nextSessions = sampleData.sessions.map((session) => ({ ...session, isSample: true }));
            nextHasMore = false;
            nextShowingSamples = true;
            nextSamplePropertyName = sampleData.propertyName ?? null;
          }
        }
      }

      setSessions((prev) => replace ? nextSessions : [...prev, ...nextSessions]);
      setTotal(data.total);
      setHasMore(nextHasMore);
      setPage(p);
      setShowingSamples(nextShowingSamples);
      setSamplePropertyName(nextSamplePropertyName);
    } catch {
      // keep existing data on error
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [scope, selectedAgentId, sort]);

  useEffect(() => {
    fetchPage(1, true);
  }, [fetchPage]);

  useEffect(() => {
    if (!hasMore || loadingMore) return;
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasMore && !loadingMore) {
          fetchPage(page + 1, false);
        }
      },
      { rootMargin: "200px" }
    );
    obs.observe(sentinel);
    return () => obs.disconnect();
  }, [hasMore, loadingMore, page, fetchPage]);

  useEffect(() => () => clearTimeout(closeTimerRef.current), []);

  useEffect(() => {
    function closeSelectedMenu(event: MouseEvent) {
      if (!selectedMenuRef.current?.contains(event.target as Node)) {
        setSelectedMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", closeSelectedMenu);
    return () => document.removeEventListener("mousedown", closeSelectedMenu);
  }, []);

  useEffect(() => {
    setSelectedIds(new Set());
    setSelectedMenuOpen(false);
  }, [scope, selectedAgentId, sort]);

  const toggleSessionSelection = (sessionId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(sessionId)) next.delete(sessionId);
      else next.add(sessionId);
      return next;
    });
  };

  const deleteSelectedSessions = async () => {
    if (deletingSelected || selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    const confirmed = window.confirm(
      `Delete ${ids.length} selected session${ids.length === 1 ? "" : "s"} and their generated analysis?`
    );
    if (!confirmed) return;

    setDeletingSelected(true);
    try {
      const results = await Promise.all(ids.map(async (id) => {
        const response = await fetch(`/api/sessions/${encodeURIComponent(id)}`, { method: "DELETE" });
        return { id, ok: response.ok };
      }));
      const failed = results.filter((result) => !result.ok);
      setSelectedIds(new Set());
      setSelectedMenuOpen(false);
      await fetchPage(1, true);
      router.refresh();
      if (failed.length > 0) {
        window.alert(
          `${failed.length} session${failed.length === 1 ? "" : "s"} could not be deleted. Please try again.`
        );
      }
    } catch {
      window.alert("The selected sessions could not be deleted. Please try again.");
    } finally {
      setDeletingSelected(false);
    }
  };

  const youLabel = scope === "agent" && selectedAgent
    ? selectedAgent.name || selectedAgent.fullName
    : "You";

  return (
    <>
      <div className="page-header">
        <h1>Sessions</h1>
        <p>
          {loading
            ? "Loading..."
            : showingSamples
              ? `Sample tours${samplePropertyName ? ` from ${samplePropertyName}` : ""}`
              : `${total} session${total !== 1 ? "s" : ""}`}
        </p>
      </div>

      <div className="sl-toolbar sl-toolbar-row">
        <div className="sl-filters">
          {agents.length > 0 && (
            <div
              ref={youPickerRef}
              className={`sl-you-picker ${youMenuOpen ? "sl-you-picker-open" : ""}`}
              onMouseEnter={openYouMenu}
              onMouseLeave={closeYouMenu}
            >
              <button
                type="button"
                className={`sl-you-bubble ${scope === "agent" ? "sl-you-bubble-active" : ""}`}
                aria-haspopup="listbox"
                aria-expanded={youMenuOpen}
                onClick={() => setYouMenuOpen((open) => !open)}
              >
                {youLabel}
                <ChevronDown className={`sl-you-chevron ${youMenuOpen ? "sl-you-chevron-open" : ""}`} size={12} />
              </button>

              {youMenuOpen && (
                <div className="sl-you-menu" role="listbox" aria-label="Select team member">
                  <div className="sl-you-menu-list">
                    {agents.map((agent) => {
                      const isSelected = scope === "agent" && agent.id === selectedAgentId;
                      const isCurrentUser = agent.id === currentAgentId;
                      return (
                        <button
                          key={agent.id}
                          type="button"
                          role="option"
                          aria-selected={isSelected}
                          className={`sl-you-menu-item ${isSelected ? "sl-you-menu-item-active" : ""}`}
                          onMouseEnter={openYouMenu}
                          onClick={() => selectAgent(agent.id)}
                        >
                          <span className="sl-you-avatar" aria-hidden="true">
                            {initialsFor(agent.fullName || agent.name)}
                          </span>
                          <span className="sl-you-menu-name">
                            {agent.fullName || agent.name}
                            {isCurrentUser && <span className="sl-you-menu-meta"> · You</span>}
                          </span>
                          {isSelected && <Check className="sl-you-menu-check" size={14} aria-hidden="true" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          <button
            type="button"
            className={`sl-chip ${scope === "team" ? "sl-chip-active" : ""}`}
            onClick={() => setScope("team")}
          >
            Your team
          </button>
        </div>

        <div className="sl-filter-controls">
          {selectedIds.size > 0 && (
            <div className="sl-selected-menu-wrap" ref={selectedMenuRef}>
              <button
                type="button"
                className="sl-selected-button"
                aria-haspopup="menu"
                aria-expanded={selectedMenuOpen}
                onClick={() => setSelectedMenuOpen((open) => !open)}
              >
                <span>{selectedIds.size} selected</span>
                <ChevronDown size={12} aria-hidden="true" />
              </button>
              {selectedMenuOpen && (
                <div className="sl-selected-menu" role="menu">
                  <div className="sl-selected-menu-heading">
                    {selectedIds.size} session{selectedIds.size === 1 ? "" : "s"}
                  </div>
                  <button
                    type="button"
                    role="menuitem"
                    className="sl-selected-delete"
                    disabled={deletingSelected}
                    onClick={deleteSelectedSessions}
                  >
                    <Trash2 size={14} aria-hidden="true" />
                    {deletingSelected ? "Deleting…" : "Delete sessions"}
                  </button>
                </div>
              )}
            </div>
          )}
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortOption)}
            className="sl-sort-select"
            aria-label="Sort sessions"
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>
      </div>

      {showingSamples && (
        <div className="sl-sample-note">
          This property does not have recorded tours yet, so these read-only sample sessions are shown for reference.
        </div>
      )}

      <div className="card">
        {loading ? (
          <div className="sl-skeleton-list">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="sl-skeleton-row">
                <div className="sl-skeleton sl-skeleton-title" />
                <div className="sl-skeleton sl-skeleton-meta" />
              </div>
            ))}
          </div>
        ) : sessions.length === 0 ? (
          <div className="empty-state">
            {scope === "agent" ? "No sessions for this agent yet." : "No sessions yet. Create one to get started."}
          </div>
        ) : (
          <>
            {sessions.map((s) => {
              const isSelected = selectedIds.has(s.id);
              return (
                <div
                  key={s.id}
                  className={`session-row session-selectable-row ${isSelected ? "session-selectable-row-active" : ""}`}
                >
                  <Link
                    href={`/sessions/${s.id}${s.isSample ? "?sample=1" : ""}`}
                    className="session-row-link"
                    onFocus={() => prefetchSession(s.id, s.isSample)}
                    onPointerEnter={() => prefetchSession(s.id, s.isSample)}
                  >
                    <div className="session-row-info">
                      <SessionCardCopy
                        session={s}
                        propertyName={
                          showPropertyInRows && s.propertyId ? propertyNames[s.propertyId] : null
                        }
                      />
                    </div>
                    {s.isSample && <span className="badge badge-source-sample">Sample</span>}
                    {s.source === "qr" && <span className="badge badge-source-qr">QR</span>}
                    <span className={`badge badge-${s.status}`}>
                      {s.status === "in_progress" && <span className="live-dot live-dot-sm" aria-hidden="true" />}
                      {SESSION_STATUS_LABELS[s.status]}
                    </span>
                    {s.overallScore !== null && (
                      <span className="session-row-score">{s.overallScore}</span>
                    )}
                  </Link>
                  {!s.isSample && (
                    <button
                      type="button"
                      className="session-row-select"
                      aria-label={`${isSelected ? "Deselect" : "Select"} ${s.title || "session"}`}
                      aria-pressed={isSelected}
                      onClick={() => toggleSessionSelection(s.id)}
                    >
                      <Check size={14} strokeWidth={3} aria-hidden="true" />
                    </button>
                  )}
                </div>
              );
            })}

            {hasMore && (
              <div ref={sentinelRef} className="sl-load-more">
                {loadingMore && (
                  <div className="sl-spinner" />
                )}
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

function initialsFor(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[parts.length - 1]![0] ?? ""}`.toUpperCase();
}
