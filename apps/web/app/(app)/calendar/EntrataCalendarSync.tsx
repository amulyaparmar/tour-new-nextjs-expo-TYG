"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, RefreshCw } from "lucide-react";

type SyncStats = {
  eventsSynced?: number;
  scheduledTours?: number;
};

export function EntrataCalendarSync({
  status,
  lastSyncedAt,
  stats,
}: {
  status: string;
  lastSyncedAt: string | null;
  stats: SyncStats;
}) {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sync() {
    setSyncing(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/calendar/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Entrata sync failed.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Entrata sync failed.");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="entrata-sync">
      <div className="entrata-sync-status">
        <CheckCircle2 size={16} aria-hidden="true" />
        <span>
          <strong>{status === "connected" ? "Entrata connected" : "Entrata calendar"}</strong>
          <small>
            {lastSyncedAt
              ? `${stats.scheduledTours ?? stats.eventsSynced ?? 0} tours · synced ${new Date(lastSyncedAt).toLocaleString()}`
              : "Not synced yet"}
          </small>
        </span>
      </div>
      <button type="button" className="btn btn-outline btn-sm" onClick={() => void sync()} disabled={syncing}>
        <RefreshCw size={14} className={syncing ? "spin" : ""} />
        {syncing ? "Syncing" : "Sync Entrata"}
      </button>
      {error && <p className="entrata-sync-error">{error}</p>}
    </div>
  );
}
