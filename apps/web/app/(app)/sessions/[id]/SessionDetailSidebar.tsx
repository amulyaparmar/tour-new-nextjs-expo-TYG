"use client";

import type { AnalysisResult } from "@tour/shared";
import { CheckCircle2, MessageSquare } from "lucide-react";

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
  const anyQuestions = analysis.sectionScores.some((section) => section.questions?.length);

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

      <div className={styles.rubricSummary}>
        <p>{analysis.summary}</p>
      </div>

      {analysis.sectionScores.map((section) => {
        const color = scoreColor(section.score);
        const questions = section.questions ?? [];
        const passCount = questions.filter((question) => question.passed).length;

        return (
          <details key={section.section} className={styles.rubricSection} open>
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
