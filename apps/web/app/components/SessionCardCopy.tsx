"use client";

import {
  formatSessionCardDescription,
  formatSessionCardMeta,
  formatSessionCardTitle,
  type SessionCardFields,
} from "@tour/shared";

type SessionCardCopyProps = {
  session: SessionCardFields;
  propertyName?: string | null;
  /** Hide the analysis description line (compact rows). */
  compact?: boolean;
};

/** Same layout as before: title + meta, with optional analysis description under meta. */
export function SessionCardCopy({
  session,
  propertyName,
  compact = false,
}: SessionCardCopyProps) {
  const title = formatSessionCardTitle(session);
  const meta = formatSessionCardMeta(session, { propertyName });
  const description = formatSessionCardDescription(session);

  return (
    <>
      <div className="session-row-title">{title}</div>
      <div className="session-row-meta">{meta}</div>
      {!compact && description ? (
        <div className="session-row-desc">{description}</div>
      ) : null}
    </>
  );
}
