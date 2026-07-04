import type { AnalysisResult } from "@tour/shared";

import { scoreValByColor } from "./session-detail-class-maps";
import styles from "./session-detail.module.css";

export function SessionScoreSummary({ analysis }: { analysis: AnalysisResult }) {
  const totalPts =
    analysis.totalPointsEarned ??
    Math.round((analysis.overallScore / 100) * (analysis.totalPointsPossible ?? 200));
  const totalMax = analysis.totalPointsPossible ?? 200;
  const overallColor = scoreColor(analysis.overallScore);

  return (
    <div className={styles.scoreSummary}>
      <div className={styles.scoreOverall}>
        <span className={`${styles.scoreOverallValue} ${scoreValByColor[overallColor]}`}>
          {analysis.overallScore}%
        </span>
        <span className={styles.scoreOverallPts}>
          {totalPts}/{totalMax} pts
        </span>
      </div>

      <ul className={styles.scoreSections}>
        {analysis.sectionScores.map((section) => {
          const color = scoreColor(section.score);
          const hasPts = section.pointsPossible > 0;
          const value = hasPts
            ? `${section.pointsEarned}/${section.pointsPossible}`
            : `${section.score}%`;

          return (
            <li key={section.section} className={styles.scoreSection}>
              <span className={styles.scoreSectionName}>{section.section}</span>
              <span className={`${styles.scoreSectionVal} ${scoreValByColor[color]}`}>{value}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function scoreColor(score: number): "green" | "amber" | "red" {
  return score >= 75 ? "green" : score >= 50 ? "amber" : "red";
}
