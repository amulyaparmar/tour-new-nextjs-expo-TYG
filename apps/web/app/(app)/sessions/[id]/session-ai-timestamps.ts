import { parseTimestampToSeconds } from "./session-detail-utils";

const TIMESTAMP_PATTERN =
  /\[(\d{1,2}:\d{2}(?::\d{2})?)\]|\b(\d{1,2}:\d{2}(?::\d{2})?)\b/g;

const MARKDOWN_TIMESTAMP_LINK =
  /\[([^\]]*)\]\((\d{1,2}:\d{2}(?::\d{2})?)\)/g;

const CODE_SEGMENT_PATTERN = /(```[\s\S]*?```|`[^`\n]+`)/g;

export function isValidTimestamp(ts: string) {
  const parts = ts.split(":").map(Number);
  if (parts.some((n) => Number.isNaN(n))) return false;
  if (parts.length === 2 && parts[1]! >= 60) return false;
  if (parts.length === 3 && (parts[1]! >= 60 || parts[2]! >= 60)) return false;
  const seconds = parseTimestampToSeconds(ts);
  return seconds >= 0;
}

function seekHref(seconds: number) {
  return `#seek-${seconds}`;
}

function linkifySegment(segment: string) {
  let result = segment.replace(MARKDOWN_TIMESTAMP_LINK, (match, label, ts) => {
    if (!isValidTimestamp(ts)) return match;
    const seconds = parseTimestampToSeconds(ts);
    return `[${label}](${seekHref(seconds)})`;
  });

  result = result.replace(TIMESTAMP_PATTERN, (match, bracketed, plain) => {
    const ts = (bracketed || plain) as string;
    if (!isValidTimestamp(ts)) return match;
    const seconds = parseTimestampToSeconds(ts);
    return `[${ts}](${seekHref(seconds)})`;
  });

  return result;
}

/** Wrap mm:ss / [mm:ss] timestamps in seek links for custom rendering. Skips code blocks. */
export function linkifyTimestampsInMarkdown(content: string) {
  return content
    .split(CODE_SEGMENT_PATTERN)
    .map((segment, index) => (index % 2 === 1 ? segment : linkifySegment(segment)))
    .join("");
}

export function splitTextWithTimestamps(text: string): Array<{ text: string; seconds?: number }> {
  const parts: Array<{ text: string; seconds?: number }> = [];
  let lastIndex = 0;

  for (const match of text.matchAll(TIMESTAMP_PATTERN)) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      parts.push({ text: text.slice(lastIndex, index) });
    }

    const ts = (match[1] || match[2]) as string;
    if (isValidTimestamp(ts)) {
      parts.push({ text: match[0], seconds: parseTimestampToSeconds(ts) });
    } else {
      parts.push({ text: match[0] });
    }

    lastIndex = index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push({ text: text.slice(lastIndex) });
  }

  return parts.length > 0 ? parts : [{ text }];
}

export function parseSeekHref(href: string | undefined): number | null {
  if (!href) return null;

  if (href.startsWith("#seek-")) {
    const seconds = Number(href.slice("#seek-".length));
    return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
  }

  if (href.startsWith("timestamp:")) {
    const seconds = Number(href.slice("timestamp:".length));
    return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
  }

  if (isValidTimestamp(href)) {
    return parseTimestampToSeconds(href);
  }

  return null;
}
