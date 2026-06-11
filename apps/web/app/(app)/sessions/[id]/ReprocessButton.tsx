"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCw } from "lucide-react";

export function ReprocessButton({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleReprocess() {
    setLoading(true);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/process`, { method: "POST" });
      if (!res.ok) throw new Error("Processing failed");
      router.refresh();
    } catch {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      className="btn btn-primary btn-sm"
      onClick={handleReprocess}
      disabled={loading}
      style={{ whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 6 }}
    >
      <RotateCw size={13} className={loading ? "animate-spin" : ""} />
      {loading ? "Re-processing…" : "Re-process"}
    </button>
  );
}
