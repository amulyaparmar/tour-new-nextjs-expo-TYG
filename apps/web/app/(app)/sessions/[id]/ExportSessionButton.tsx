"use client";

import { ChevronDown, Download, FileAudio, FileText, LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import styles from "./session-detail.module.css";

type Props = {
  href: string;
  audioHref: string;
  sessionTitle: string;
};

export function ExportSessionButton({ href, audioHref, sessionTitle }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    function closeOnOutsideClick(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  async function downloadReport() {
    if (isExporting) return;
    setIsExporting(true);
    setErrorMessage(null);

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
      setOpen(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "The PDF could not be generated.");
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <div className={styles.exportMenuRoot} ref={rootRef}>
      <button
        type="button"
        className={`btn btn-outline btn-sm ${styles.downloadBtn}`}
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Export ${sessionTitle}`}
      >
        <Download size={14} aria-hidden="true" />
        Export
        <ChevronDown size={13} className={open ? styles.exportChevronOpen : styles.exportChevron} aria-hidden="true" />
      </button>

      {open && (
        <div className={styles.exportPopover} role="menu" aria-label="Export options">
          <div className={styles.exportPopoverHeading}>Export session</div>
          <a
            href={audioHref}
            role="menuitem"
            className={styles.exportOption}
            onClick={() => setOpen(false)}
          >
            <span className={styles.exportOptionIcon}><FileAudio size={17} aria-hidden="true" /></span>
            <span>
              <strong>Audio recording</strong>
              <small>Download the original recording</small>
            </span>
          </a>
          <button
            type="button"
            role="menuitem"
            className={styles.exportOption}
            onClick={() => void downloadReport()}
            disabled={isExporting}
          >
            <span className={styles.exportOptionIcon}>
              {isExporting
                ? <LoaderCircle size={17} className={styles.exportSpinner} aria-hidden="true" />
                : <FileText size={17} aria-hidden="true" />}
            </span>
            <span>
              <strong>{errorMessage ? "Try PDF again" : isExporting ? "Preparing PDF…" : "PDF report"}</strong>
              <small>Evaluation, scores, and feedback</small>
            </span>
          </button>
          {errorMessage && (
            <p className={styles.exportError} role="alert">{errorMessage}</p>
          )}
        </div>
      )}
    </div>
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
