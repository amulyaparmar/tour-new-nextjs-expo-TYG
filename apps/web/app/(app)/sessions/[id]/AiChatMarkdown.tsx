"use client";

import type { Components } from "react-markdown";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import { useMemo, type ReactNode } from "react";

import styles from "./session-detail.module.css";
import { linkifyTimestampsInMarkdown, parseSeekHref } from "./session-ai-timestamps";

function seekFromLink(href: string | undefined, children: ReactNode) {
  const fromHref = parseSeekHref(href);
  if (fromHref != null) return fromHref;

  if (typeof children === "string") {
    return parseSeekHref(children.trim());
  }

  return null;
}

export function AiChatMarkdown({
  content,
  onSeek,
}: {
  content: string;
  onSeek?: (seconds: number) => void;
}) {
  const rendered = useMemo(() => linkifyTimestampsInMarkdown(content), [content]);

  const components = useMemo<Components>(
    () => ({
      a: ({ href, children }) => {
        const seconds = seekFromLink(href, children);

        if (seconds != null) {
          if (onSeek) {
            return (
              <button
                type="button"
                className={styles.aiChatTimestamp}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onSeek(seconds);
                }}
              >
                {children}
              </button>
            );
          }

          return <span className={styles.aiChatTimestamp}>{children}</span>;
        }

        const safeHref = href ? defaultUrlTransform(href) : "";
        if (!safeHref) {
          return <span>{children}</span>;
        }

        return (
          <a
            href={safeHref}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(event) => event.stopPropagation()}
          >
            {children}
          </a>
        );
      },
    }),
    [onSeek]
  );

  if (!content.trim()) return null;

  return (
    <div className={styles.aiChatMarkdown}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {rendered}
      </ReactMarkdown>
    </div>
  );
}
