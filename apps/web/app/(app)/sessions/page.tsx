"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { SESSION_STATUS_LABELS, type SessionStatus, type SessionSummary } from "@tour/shared";

type SortOption = "newest" | "oldest" | "score_desc" | "score_asc";
const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "score_desc", label: "Score \u2193" },
  { value: "score_asc", label: "Score \u2191" },
];

const STATUS_FILTERS: { value: SessionStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "scheduled", label: "Scheduled" },
  { value: "uploaded", label: "Uploaded" },
  { value: "analysis_ready", label: "Analyzed" },
  { value: "reviewed", label: "Reviewed" },
  { value: "failed", label: "Failed" },
];

const PAGE_SIZE = 20;

export default function SessionsPage() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<SessionStatus | "all">("all");
  const [sort, setSort] = useState<SortOption>("newest");

  const sentinelRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const fetchPage = useCallback(async (p: number, replace: boolean) => {
    if (replace) setLoading(true);
    else setLoadingMore(true);

    try {
      const params = new URLSearchParams();
      params.set("page", String(p));
      params.set("limit", String(PAGE_SIZE));
      params.set("sort", sort);
      if (status !== "all") params.set("status", status);
      if (search.trim()) params.set("search", search.trim());

      const res = await fetch(`/api/sessions?${params}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json() as {
        sessions: SessionSummary[];
        total: number;
        hasMore: boolean;
      };

      setSessions((prev) => replace ? data.sessions : [...prev, ...data.sessions]);
      setTotal(data.total);
      setHasMore(data.hasMore);
      setPage(p);
    } catch {
      // keep existing data on error
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [sort, status, search]);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchPage(1, true);
    }, search ? 300 : 0);
    return () => clearTimeout(debounceRef.current);
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

  return (
    <>
      <div className="page-header">
        <h1>Sessions</h1>
        <p>{loading ? "Loading..." : `${total} session${total !== 1 ? "s" : ""}`}</p>
      </div>

      <div className="sl-toolbar">
        <div className="sl-search">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder="Search sessions..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button type="button" onClick={() => setSearch("")} className="sl-search-clear" aria-label="Clear search">
              &times;
            </button>
          )}
        </div>

        <div className="sl-filters">
          <div className="sl-chip-group">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                className={`sl-chip ${status === f.value ? "sl-chip-active" : ""}`}
                onClick={() => setStatus(f.value)}
              >
                {f.label}
              </button>
            ))}
          </div>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortOption)}
            className="sl-sort-select"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

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
            {search || status !== "all" ? "No sessions match your filters." : "No sessions yet. Create one to get started."}
          </div>
        ) : (
          <>
            {sessions.map((s) => (
              <Link key={s.id} href={`/sessions/${s.id}`} className="session-row">
                <div className="session-row-info">
                  <div className="session-row-title">{s.title}</div>
                  <div className="session-row-meta">
                    {s.prospectName ?? "No prospect"}
                    {s.scheduledAt ? ` \u00b7 ${new Date(s.scheduledAt).toLocaleDateString()}` : ""}
                    {s.location ? ` \u00b7 ${s.location}` : ""}
                  </div>
                </div>
                <span className={`badge badge-${s.status}`}>
                  {SESSION_STATUS_LABELS[s.status]}
                </span>
                {s.overallScore !== null && (
                  <span className="session-row-score">{s.overallScore}</span>
                )}
              </Link>
            ))}

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
