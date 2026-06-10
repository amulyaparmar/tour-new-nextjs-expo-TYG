import "server-only";

import { getScreenshots, type Screenshot } from "./screenshots";
import { getTranscript } from "./sessions";

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

export async function getTranscriptForSession(sessionId: string): Promise<TranscriptSegment[]> {
  return getTranscript(sessionId);
}

export async function getScreenshotsForSession(sessionId: string): Promise<SessionScreenshot[]> {
  const stored: Screenshot[] = await getScreenshots(sessionId);

  return stored.map((s) => ({
    id: s.id,
    sessionId: s.sessionId,
    timestamp: s.timestamp,
    imageUrl: s.imageUrl,
    reason: s.reason,
    label: s.label
  }));
}
