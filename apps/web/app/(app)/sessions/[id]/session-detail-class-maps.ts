import styles from "./session-detail.module.css";

export const rubricPctByColor: Record<"green" | "amber" | "red", string> = {
  green: styles.rubricPctGreen ?? "",
  amber: styles.rubricPctAmber ?? "",
  red: styles.rubricPctRed ?? "",
};

export const playerMarkerByType: Record<string, string> = {
  key_moment: styles.playerMarkerKeyMoment ?? "",
  moment: styles.playerMarkerMoment ?? "",
  screenshot: styles.playerMarkerScreenshot ?? "",
};

export const playerSpeakerPct = [styles.playerSpeakerPct0 ?? "", styles.playerSpeakerPct1 ?? ""] as const;
export const playerSpeakerFill = [styles.playerSpeakerFill0 ?? "", styles.playerSpeakerFill1 ?? ""] as const;
export const playerSpeakerSegment = [styles.playerSpeakerSegment0 ?? "", styles.playerSpeakerSegment1 ?? ""] as const;

export const phaseSegmentClass: Record<string, string> = {
  greeting: styles.playerPhaseGreeting ?? "",
  discovery: styles.playerPhaseDiscovery ?? "",
  tour: styles.playerPhaseTour ?? "",
  objections: styles.playerPhaseObjections ?? "",
  closing: styles.playerPhaseClosing ?? "",
  follow_up: styles.playerPhaseFollowUp ?? "",
};

export const segmentTrackClasses = [
  styles.playerSegment0,
  styles.playerSegment1,
  styles.playerSegment2,
  styles.playerSegment3,
  styles.playerSegment4,
  styles.playerSegment5,
  styles.playerSegment6,
  styles.playerSegment7,
  styles.playerSegment8,
  styles.playerSegment9,
  styles.playerSegment10,
  styles.playerSegment11,
] as const;

export const scoreValByColor: Record<"green" | "amber" | "red", string> = {
  green: styles.scoreValGreen ?? "",
  amber: styles.scoreValAmber ?? "",
  red: styles.scoreValRed ?? "",
};
