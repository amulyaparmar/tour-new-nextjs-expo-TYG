"use client";

import { useMemo } from "react";

import styles from "./session-detail.module.css";
import { splitTextWithTimestamps } from "./session-ai-timestamps";

export function ClickableTimestampText({
  text,
  onSeek,
  className,
}: {
  text: string;
  onSeek?: (seconds: number) => void;
  className?: string;
}) {
  const parts = useMemo(() => splitTextWithTimestamps(text), [text]);

  return (
    <p className={className}>
      {parts.map((part, index) => {
        if (part.seconds == null || !onSeek) {
          return <span key={`${index}-${part.text}`}>{part.text}</span>;
        }

        return (
          <button
            key={`${index}-${part.text}`}
            type="button"
            className={styles.aiChatTimestamp}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onSeek(part.seconds!);
            }}
          >
            {part.text}
          </button>
        );
      })}
    </p>
  );
}
