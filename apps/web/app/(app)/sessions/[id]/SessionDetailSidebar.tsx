"use client";

import type { AnalysisResult } from "@tour/shared";
import { CheckCircle2, MessageSquare } from "lucide-react";
import { useState } from "react";

import { SidebarCommentsPanel } from "./SidebarCommentsPanel";
import { SessionAiChat } from "./SessionAiChat";
import { ReprocessButton } from "./ReprocessButton";
import { rubricPctByColor } from "./session-detail-class-maps";
import styles from "./session-detail.module.css";
import { isDiscussionComment, scoreColor, type SessionComment } from "./session-detail-utils";

export type SidebarTab = "rubric" | "comments" | "ai";

export function SessionDetailSidebar({
  sessionId,
  analysis,
  tab,
  onTabChange,
  currentTime,
  comments,
  onCommentsUpdated,
  onSeek,
  onAiSeek,
  selectedCommentId,
  onCommentSelect,
}: {
  sessionId: string;
  analysis: AnalysisResult;
  tab: SidebarTab;
  onTabChange: (tab: SidebarTab) => void;
  currentTime: number;
  comments: SessionComment[];
  onCommentsUpdated: (comments: SessionComment[]) => void;
  onSeek: (seconds: number) => void;
  onAiSeek: (seconds: number) => void;
  selectedCommentId: string | null;
  onCommentSelect: (commentId: string) => void;
}) {
  const commentCount = comments.filter((c) => !c.parentId && isDiscussionComment(c)).length;

  return (
    <aside className={styles.sidebar}>
      <div className={styles.sidebarTabs} role="tablist" aria-label="Session tools">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "rubric"}
          className={`${styles.sidebarTab} ${tab === "rubric" ? styles.sidebarTabActive : ""}`}
          onClick={() => onTabChange("rubric")}
          title="Rubric"
        >
          <CheckCircle2 size={18} />
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "comments"}
          className={`${styles.sidebarTab} ${tab === "comments" ? styles.sidebarTabActive : ""}`}
          onClick={() => onTabChange("comments")}
          title="Comments"
        >
          <MessageSquare size={18} />
          {commentCount > 0 && <span className={styles.sidebarTabBadge}>{commentCount}</span>}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "ai"}
          className={`${styles.sidebarTab} ${tab === "ai" ? styles.sidebarTabActive : ""}`}
          onClick={() => onTabChange("ai")}
          title="AI chat"
        >
          <span className={styles.sidebarTabAi}>ai</span>
        </button>
      </div>

      <div className={styles.sidebarBody}>
        {tab === "rubric" && <SessionRubricPanel analysis={analysis} sessionId={sessionId} />}
        {tab === "comments" && (
          <div className={styles.commentsPanel}>
            <div className={styles.sidebarSectionHead}>
              <h2>Comments</h2>
              {commentCount > 0 && <span className={styles.sidebarScore}>{commentCount}</span>}
            </div>
            <SidebarCommentsPanel
              sessionId={sessionId}
              currentTime={currentTime}
              comments={comments}
              onCommentsUpdated={onCommentsUpdated}
              onSeek={onSeek}
              selectedCommentId={selectedCommentId}
              onCommentSelect={onCommentSelect}
            />
          </div>
        )}
        {tab === "ai" && (
          <SessionAiChat sessionId={sessionId} analysis={analysis} onSeek={onAiSeek} />
        )}
      </div>
    </aside>
  );
}

function SessionRubricPanel({ analysis, sessionId }: { analysis: AnalysisResult; sessionId: string }) {
  const [summaryExpanded, setSummaryExpanded] = useState(false);
  const anyQuestions = analysis.sectionScores.some((section) => section.questions?.length);
  const sortedSections = [...analysis.sectionScores].sort((a, b) => a.score - b.score);
  const focusSection = sortedSections[0] ?? analysis.sectionScores[0];
  const strongestSection = sortedSections[sortedSections.length - 1] ?? focusSection;
  const totalPts =
    analysis.totalPointsEarned ??
    Math.round((analysis.overallScore / 100) * (analysis.totalPointsPossible ?? 200));
  const totalMax = analysis.totalPointsPossible ?? 200;

  return (
    <div className={styles.rubricPanel}>
      <div className={styles.sidebarSectionHead}>
        <h2>Rubric</h2>
        <span className={styles.sidebarScore}>{analysis.overallScore}%</span>
      </div>

      {!anyQuestions && (
        <div className={styles.rubricLegacy}>
          <p>Legacy analysis — re-process for question-level detail.</p>
          <ReprocessButton sessionId={sessionId} />
        </div>
      )}

      <div
        role="button"
        tabIndex={0}
        className={`${styles.rubricInsightCard} ${summaryExpanded ? styles.rubricInsightCardExpanded : ""}`}
        onClick={() => setSummaryExpanded((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setSummaryExpanded((value) => !value);
          }
        }}
        aria-expanded={summaryExpanded}
      >
        <div className={styles.rubricInsightGridPanel} aria-hidden="true">
          <span className={styles.rubricInsightLabel}>Strengths</span>
          <RubricStrengthRadar sections={analysis.sectionScores} />
          <span className={styles.rubricInsightScore}>{analysis.overallScore}%</span>
        </div>

        <div className={styles.rubricInsightSummary}>
          <span className={styles.rubricInsightEyebrow}>Summary</span>
          <p className={styles.rubricInsightQuick}>
            {strongestSection && focusSection
              ? `Strongest in ${strongestSection.section}; biggest opportunity is ${focusSection.section}.`
              : `${totalPts}/${totalMax} points captured.`}
          </p>
          <p className={styles.rubricInsightBody}>{analysis.summary}</p>
          <span className={styles.rubricInsightHint}>
            {summaryExpanded ? "Click to compact" : "Click to expand"}
          </span>
        </div>
      </div>

      {analysis.sectionScores.map((section) => {
        const color = scoreColor(section.score);
        const questions = section.questions ?? [];
        const passCount = questions.filter((question) => question.passed).length;

        return (
          <details key={section.section} className={styles.rubricSection}>
            <summary>
              <span>{section.section}</span>
              <span className={`${styles.rubricPct} ${rubricPctByColor[color]}`}>
                {questions.length ? `${passCount}/${questions.length}` : `${section.score}%`}
              </span>
            </summary>
            {questions.length > 0 ? (
              <div className={styles.rubricQuestions}>
                {questions.map((question) => (
                  <div
                    key={question.id}
                    className={`${styles.rubricQ} ${question.passed ? styles.rubricQPass : styles.rubricQFail}`}
                  >
                    <span className={styles.rubricQMark}>{question.passed ? "✓" : "✗"}</span>
                    <div>
                      <p className={styles.rubricQText}>{question.question}</p>
                      {question.evidence && <p className={styles.rubricQEvidence}>{question.evidence}</p>}
                    </div>
                    <span className={styles.rubricQPts}>{question.earnedPoints}/{question.maxPoints}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className={styles.rubricEmpty}>Section scored {section.score}%.</p>
            )}
          </details>
        );
      })}
    </div>
  );
}

function RubricStrengthRadar({ sections }: { sections: AnalysisResult["sectionScores"] }) {
  const entries = sections.length
    ? sections.map((section) => ({
      label: shortAxisLabel(section.section),
      score: Math.max(0, Math.min(100, section.score)),
    }))
    : [{ label: "Score", score: 0 }];

  const cx = 70;
  const cy = 60;
  const radius = 30;
  const axisPoints = entries.map((_, index) => pointFor(index, entries.length, radius, cx, cy));
  const scorePoints = entries.map((entry, index) => pointFor(index, entries.length, radius * (entry.score / 100), cx, cy));
  const labelPoints = entries.map((_, index) => pointFor(index, entries.length, radius + 28, cx, cy));
  const polygon = scorePoints.map((point) => `${point.x},${point.y}`).join(" ");

  return (
    <svg className={styles.rubricInsightRadar} viewBox="0 0 140 120" role="img" aria-label="Rubric strength radar">
      {[0.33, 0.66, 1].map((scale) => (
        <polygon
          key={scale}
          points={axisPointsFor(entries.length, radius * scale, cx, cy)}
          className={styles.rubricInsightRadarGrid}
        />
      ))}
      {axisPoints.map((point, index) => (
        <line
          key={`axis-${entries[index]?.label ?? index}`}
          x1={cx}
          y1={cy}
          x2={point.x}
          y2={point.y}
          className={styles.rubricInsightRadarAxis}
        />
      ))}
      <polygon points={polygon} className={styles.rubricInsightRadarArea} />
      <polyline points={`${polygon} ${scorePoints[0]?.x ?? cx},${scorePoints[0]?.y ?? cy}`} className={styles.rubricInsightRadarLine} />
      {scorePoints.map((point, index) => (
        <circle
          key={`score-${entries[index]?.label ?? index}`}
          cx={point.x}
          cy={point.y}
          r="2.4"
          className={styles.rubricInsightRadarDot}
        />
      ))}
      {labelPoints.map((point, index) => (
        <text
          key={`label-${entries[index]?.label ?? index}`}
          x={point.x}
          y={point.y}
          textAnchor={textAnchorFor(point.x, cx)}
          dominantBaseline="middle"
          className={styles.rubricInsightRadarLabel}
        >
          {entries[index]?.label}
        </text>
      ))}
    </svg>
  );
}

function axisPointsFor(count: number, radius: number, cx: number, cy: number) {
  return Array.from({ length: count }, (_, index) => pointFor(index, count, radius, cx, cy))
    .map((point) => `${point.x},${point.y}`)
    .join(" ");
}

function pointFor(index: number, count: number, radius: number, cx: number, cy: number) {
  const angle = -Math.PI / 2 + (index * 2 * Math.PI) / count;
  return {
    x: Number((cx + radius * Math.cos(angle)).toFixed(2)),
    y: Number((cy + radius * Math.sin(angle)).toFixed(2)),
  };
}

function textAnchorFor(x: number, cx: number) {
  if (Math.abs(x - cx) < 4) return "middle";
  return x > cx ? "end" : "start";
}

function shortAxisLabel(label: string) {
  const clean = label.replace(/\s*&\s*/g, " ").replace(/\s+/g, " ").trim();
  const normalized = clean.toLowerCase();
  if (normalized.includes("greeting")) return "Greeting";
  if (normalized.includes("property") || normalized.includes("tour")) return "Property";
  if (normalized.includes("closing")) return "Closing";
  if (normalized.includes("follow")) return "Follow up";
  const words = clean.split(" ");
  if (words.length === 1) return words[0]!.slice(0, 10);
  return words
    .filter((word) => !["the", "and", "of"].includes(word.toLowerCase()))
    .slice(0, 2)
    .map((word) => word.length > 8 ? word.slice(0, 8) : word)
    .join(" ");
}
