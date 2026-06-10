import "server-only";

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
  reason: "interval" | "ai_key_moment" | "rubric_evidence";
  summary?: string;
};

export function getTranscriptForSession(sessionId: string): TranscriptSegment[] {
  return [
    {
      id: `${sessionId}-t1`,
      sessionId,
      speaker: "Agent",
      startTime: 0,
      endTime: 18,
      text: "Thanks for coming in today. I want to make sure this tour matches what matters most to you."
    },
    {
      id: `${sessionId}-t2`,
      sessionId,
      speaker: "Prospect",
      startTime: 18,
      endTime: 36,
      text: "Parking and commute time are my biggest concerns."
    },
    {
      id: `${sessionId}-t3`,
      sessionId,
      speaker: "Agent",
      startTime: 36,
      endTime: 62,
      text: "Great, let's focus on the units closest to your route and parking access."
    },
    {
      id: `${sessionId}-t4`,
      sessionId,
      speaker: "Agent",
      startTime: 62,
      endTime: 94,
      text: "Based on your timeline, we can reserve this option and move into application steps today."
    }
  ];
}

export function getScreenshotsForSession(sessionId: string): SessionScreenshot[] {
  return [
    {
      id: `${sessionId}-s1`,
      sessionId,
      timestamp: 30,
      imageUrl: "/tour-ridealong/ridealong-cover.png",
      reason: "interval",
      summary: "Opening greeting and expectations set."
    },
    {
      id: `${sessionId}-s2`,
      sessionId,
      timestamp: 210,
      imageUrl: "/tour-ridealong/ridealong-cover.png",
      reason: "ai_key_moment",
      summary: "Prospect objection around pricing addressed."
    },
    {
      id: `${sessionId}-s3`,
      sessionId,
      timestamp: 520,
      imageUrl: "/tour-ridealong/ridealong-cover.png",
      reason: "rubric_evidence",
      summary: "Closing attempt and next steps discussion."
    }
  ];
}
