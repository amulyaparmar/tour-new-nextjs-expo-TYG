"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ActionStatusButtons({
  actionId,
  sessionId
}: {
  actionId: string;
  sessionId: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function setStatus(status: "open" | "completed" | "dismissed") {
    setPending(true);
    try {
      await fetch(`/api/sessions/${sessionId}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actionId, status })
      });
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="action-row-buttons">
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        onClick={() => setStatus("completed")}
        disabled={pending}
      >
        Complete
      </button>
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        onClick={() => setStatus("dismissed")}
        disabled={pending}
        style={{ color: "var(--slate-400)" }}
      >
        Dismiss
      </button>
    </div>
  );
}
