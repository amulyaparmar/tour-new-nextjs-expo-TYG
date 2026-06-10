import "server-only";

import { getScreenshots, type Screenshot } from "./screenshots";

export type TranscriptSegment = {
  id: string;
  sessionId: string;
  speaker: string;
  startTime: number;
  endTime: number;
  text: string;
};

export type SessionScreenshot = {
  id: string;
  sessionId: string;
  timestamp: number;
  imageUrl: string;
  reason: "key_moment" | "interval";
  label: string;
};

export function getTranscriptForSession(_sessionId: string): TranscriptSegment[] {
  return [];
}

export async function getScreenshotsForSession(sessionId: string): Promise<SessionScreenshot[]> {
  const stored: Screenshot[] = await getScreenshots(sessionId);

  return stored.map((s) => ({
    id: s.id,
    sessionId: s.sessionId,
    timestamp: s.timestamp,
    imageUrl: `/api/local-uploads/${s.filename}`,
    reason: s.reason,
    label: s.label
  }));
}
