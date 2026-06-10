"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function GenerateAnalysisButton({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/sessions/${sessionId}/analysis`, {
        method: "POST"
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(payload?.error ?? "Failed to generate analysis.");
      }

      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate analysis.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
      <button type="button" className="btn btn-outline" onClick={handleGenerate} disabled={loading}>
        {loading ? "Generating…" : "Generate Analysis"}
      </button>
      {error && <span className="error-text">{error}</span>}
    </div>
  );
}
