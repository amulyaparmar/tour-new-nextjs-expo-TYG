import "server-only";

import { getTranscript } from "./sessions";

export type TranscriptSegment = {
  id: string;
  sessionId: string;
  speaker: string;
  startTime: number;
  endTime: number;
  text: string;
};

export async function getTranscriptForSession(sessionId: string): Promise<TranscriptSegment[]> {
  return getTranscript(sessionId);
}
