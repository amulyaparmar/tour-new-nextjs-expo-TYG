"use client";

import { Download, LoaderCircle } from "lucide-react";
import { useState } from "react";

import styles from "./session-detail.module.css";

type Props = {
  href: string;
  sessionTitle: string;
};

export function ExportSessionButton({ href, sessionTitle }: Props) {
  const [isExporting, setIsExporting] = useState(false);
  const [failed, setFailed] = useState(false);

  async function downloadReport() {
    if (isExporting) return;
    setIsExporting(true);
    setFailed(false);

    try {
      const response = await fetch(href, { cache: "no-store" });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(body?.error || "PDF export failed.");
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = responseFilename(response) || `${safeFilename(sessionTitle) || "session"}-evaluation.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
    } catch {
      setFailed(true);
    } finally {
      setIsExporting(false);
    }
  }

  const label = failed ? "Try export again" : isExporting ? "Preparing PDF..." : "Export";

  return (
    <button
      type="button"
      className={`btn btn-outline btn-sm ${styles.downloadBtn}`}
      onClick={downloadReport}
      disabled={isExporting}
      aria-label={`${label}: ${sessionTitle}`}
      title={failed ? "The PDF could not be generated. Try again." : undefined}
    >
      {isExporting
        ? <LoaderCircle size={14} className={styles.exportSpinner} aria-hidden="true" />
        : <Download size={14} aria-hidden="true" />}
      {label}
    </button>
  );
}

function responseFilename(response: Response) {
  const disposition = response.headers.get("content-disposition");
  const match = disposition?.match(/filename="?([^";]+)"?/i);
  return match?.[1] ?? null;
}

function safeFilename(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .toLowerCase();
}
