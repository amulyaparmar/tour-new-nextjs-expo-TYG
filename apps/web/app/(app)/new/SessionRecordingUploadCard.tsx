"use client";

import { useEffect, useState } from "react";
import {
  ChevronDown,
  Download,
  FileAudio,
  MoreHorizontal,
  Settings2,
  Trash2,
} from "lucide-react";

import { withRecordingParticipants } from "@tour/shared";

import { RubricSelector } from "../RubricSelector";

export type SessionUploadStatus =
  | "queued"
  | "creating"
  | "uploading"
  | "processing"
  | "done"
  | "error";

export type SessionUploadDraft = {
  id: string;
  file: File;
  status: SessionUploadStatus;
  progress: number;
  sessionId: string | null;
  error: string | null;
  title: string;
  titleIsAuto: boolean;
  scheduledAt: string;
  agentName: string;
  prospectName: string;
  location: string;
  notes: string;
  rubricId: string | null;
  usesRubricOverride: boolean;
  expanded: boolean;
};

type Props = {
  item: SessionUploadDraft;
  disabled: boolean;
  sharedRubricId: string | null;
  onChange: (patch: Partial<SessionUploadDraft>) => void;
  onRemove: () => void;
  onRestoreAutomaticTitle: () => void;
};

export function SessionRecordingUploadCard({
  item,
  disabled,
  sharedRubricId,
  onChange,
  onRemove,
  onRestoreAutomaticTitle,
}: Props) {
  const [mediaUrl, setMediaUrl] = useState("");

  useEffect(() => {
    const url = URL.createObjectURL(item.file);
    setMediaUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [item.file]);

  const displayTitle = item.titleIsAuto
    ? withRecordingParticipants(item.title, item.agentName, item.prospectName)
    : item.title;
  const isVideo = item.file.type.startsWith("video/");

  return (
    <article className="recording-upload-card">
      <div className="recording-upload-card-header">
        <div className="recording-upload-icon" aria-hidden="true">
          <FileAudio size={18} />
        </div>
        <div className="recording-upload-heading">
          <div className="recording-upload-title-row">
            <strong>{displayTitle}</strong>
            {item.titleIsAuto && <span className="recording-upload-inferred">Inferred</span>}
            {item.status === "done" && <span className="badge badge-reviewed">Started</span>}
            {item.status === "error" && <span className="badge badge-failed">Failed</span>}
          </div>
          <span className="recording-upload-file" title={item.file.name}>
            Original: {item.file.name} · {formatFileSize(item.file.size)} · {statusLabel(item.status)}
          </span>
        </div>

        <details className="recording-upload-menu">
          <summary aria-label={`More options for ${displayTitle}`}>
            <MoreHorizontal size={18} />
          </summary>
          <div className="recording-upload-menu-popover">
            <button type="button" onClick={() => onChange({ expanded: true })} disabled={disabled}>
              <Settings2 size={15} /> Customize settings
            </button>
            <a href={mediaUrl} download={item.file.name}>
              <Download size={15} /> Download original
            </a>
            <button type="button" className="danger" onClick={onRemove} disabled={disabled}>
              <Trash2 size={15} /> Remove recording
            </button>
          </div>
        </details>
      </div>

      <div className={`recording-upload-media-row ${isVideo ? "is-video" : "is-audio"}`}>
        {isVideo ? (
          <video key={mediaUrl} className="recording-upload-player" controls playsInline preload="metadata" src={mediaUrl}>
            Your browser does not support video playback.
          </video>
        ) : (
          <audio key={mediaUrl} className="recording-upload-player" controls preload="metadata" src={mediaUrl}>
            Your browser does not support audio playback.
          </audio>
        )}
        <a className="recording-upload-download" href={mediaUrl} download={item.file.name} title="Download original recording" aria-label="Download original recording">
          <Download size={17} />
        </a>
      </div>

      {item.status === "uploading" && (
        <div className="bulk-upload-progress" role="progressbar" aria-label={`Uploading ${displayTitle}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={item.progress}>
          <span style={{ width: `${item.progress}%` }} />
        </div>
      )}
      {item.error && <div className="bulk-upload-error">{item.error}</div>}

      <details
        className="recording-upload-accordion"
        open={item.expanded}
        onToggle={(event) => onChange({ expanded: event.currentTarget.open })}
      >
        <summary>
          <span><Settings2 size={15} /> Session details</span>
          <span className="recording-upload-summary-meta">
            {item.usesRubricOverride ? "Custom rubric" : "Shared rubric"}
            <ChevronDown size={16} />
          </span>
        </summary>
        <div className="recording-upload-details">
          <div className="recording-upload-fields">
            <div className="form-group recording-upload-field-wide">
              <div className="recording-upload-label-row">
                <label className="form-label" htmlFor={`${item.id}-title`}>Session title</label>
                {!item.titleIsAuto && (
                  <button type="button" className="recording-upload-text-button" onClick={onRestoreAutomaticTitle} disabled={disabled}>
                    Use inferred title
                  </button>
                )}
              </div>
              <input
                id={`${item.id}-title`}
                className="form-input"
                value={displayTitle}
                disabled={disabled}
                onChange={(event) => onChange({ title: event.currentTarget.value, titleIsAuto: false })}
              />
              {item.titleIsAuto && (
                <small>Starts with the recording date and adds agent and prospect names when they are identified.</small>
              )}
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor={`${item.id}-date`}>Tour date and time</label>
              <input
                id={`${item.id}-date`}
                type="datetime-local"
                className="form-input"
                value={item.scheduledAt}
                disabled={disabled}
                onChange={(event) => onChange({ scheduledAt: event.currentTarget.value })}
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor={`${item.id}-agent`}>Leasing agent <span>optional</span></label>
              <input
                id={`${item.id}-agent`}
                className="form-input"
                value={item.agentName}
                placeholder="Infer from audio"
                disabled={disabled}
                onChange={(event) => onChange({ agentName: event.currentTarget.value })}
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor={`${item.id}-prospect`}>Prospect <span>optional</span></label>
              <input
                id={`${item.id}-prospect`}
                className="form-input"
                value={item.prospectName}
                placeholder="Infer from audio"
                disabled={disabled}
                onChange={(event) => onChange({ prospectName: event.currentTarget.value })}
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor={`${item.id}-location`}>Location <span>optional</span></label>
              <input
                id={`${item.id}-location`}
                className="form-input"
                value={item.location}
                placeholder="Tower A · Unit 1204"
                disabled={disabled}
                onChange={(event) => onChange({ location: event.currentTarget.value })}
              />
            </div>
            <div className="form-group recording-upload-field-wide">
              <label className="form-label" htmlFor={`${item.id}-notes`}>Notes <span>optional</span></label>
              <textarea
                id={`${item.id}-notes`}
                className="form-textarea"
                rows={2}
                value={item.notes}
                placeholder="Add context or focus areas for this recording…"
                disabled={disabled}
                onChange={(event) => onChange({ notes: event.currentTarget.value })}
              />
            </div>
          </div>

          <div className="recording-upload-rubric">
            <label className="form-check-row">
              <input
                type="checkbox"
                checked={item.usesRubricOverride}
                disabled={disabled}
                onChange={(event) => onChange({
                  usesRubricOverride: event.currentTarget.checked,
                  rubricId: event.currentTarget.checked ? (item.rubricId ?? sharedRubricId) : null,
                })}
              />
              <span>
                <strong>Use a different rubric for this recording</strong>
                <small>Otherwise this recording uses the rubric selected for all uploads.</small>
              </span>
            </label>
            {item.usesRubricOverride && (
              <RubricSelector
                name={`${item.id}-rubric`}
                value={item.rubricId ?? sharedRubricId}
                onChange={(rubricId) => onChange({ rubricId })}
                showManageLink={false}
                compact
              />
            )}
          </div>
        </div>
      </details>
    </article>
  );
}

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function statusLabel(status: SessionUploadStatus) {
  switch (status) {
    case "queued": return "Ready";
    case "creating": return "Creating session";
    case "uploading": return "Uploading";
    case "processing": return "Starting analysis";
    case "done": return "Analysis started";
    case "error": return "Needs attention";
  }
}
