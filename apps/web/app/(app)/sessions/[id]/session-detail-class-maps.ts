import styles from "./session-detail.module.css";

export const rubricPctByColor: Record<"green" | "amber" | "red", string> = {
  green: styles.rubricPctGreen,
  amber: styles.rubricPctAmber,
  red: styles.rubricPctRed,
};

export const playerMarkerByType: Record<string, string> = {
  key_moment: styles.playerMarkerKeyMoment,
  moment: styles.playerMarkerMoment,
  screenshot: styles.playerMarkerScreenshot,
};

export const playerSpeakerPct = [styles.playerSpeakerPct0, styles.playerSpeakerPct1] as const;
export const playerSpeakerFill = [styles.playerSpeakerFill0, styles.playerSpeakerFill1] as const;
export const playerSpeakerSegment = [styles.playerSpeakerSegment0, styles.playerSpeakerSegment1] as const;

export const scoreValByColor: Record<"green" | "amber" | "red", string> = {
  green: styles.scoreValGreen,
  amber: styles.scoreValAmber,
  red: styles.scoreValRed,
};
