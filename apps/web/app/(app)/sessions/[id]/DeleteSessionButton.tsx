"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

export function DeleteSessionButton({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (deleting) return;
    const ok = window.confirm("Delete this session and its generated analysis?");
    if (!ok) return;

    setDeleting(true);
    try {
      const res = await fetch(`/api/sessions/${sessionId}`, { method: "DELETE" });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Delete failed");
      }
      router.push("/sessions");
      router.refresh();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Delete failed");
      setDeleting(false);
    }
  }

  return (
    <button
      type="button"
      className="btn btn-outline btn-sm sd-delete-btn"
      onClick={handleDelete}
      disabled={deleting}
    >
      <Trash2 size={14} /> {deleting ? "Deleting..." : "Delete"}
    </button>
  );
}
