"use client";

import Link from "next/link";
import type { AnalysisModelId, AnalysisResult, AudioInsights, AudioInsightsStatus, ConversationPhaseSegmentation, SessionParticipants } from "@tour/shared";
import { Activity, CheckCircle2, ExternalLink, MessageSquare } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { PolarAngleAxis, PolarGrid, Radar, RadarChart, ResponsiveContainer } from "recharts";

import { SidebarCommentsPanel } from "./SidebarCommentsPanel";
import { SessionAudioInsightsSidebarTab } from "./SessionAudioInsightsSidebarTab";
import { SessionAiChat } from "./SessionAiChat";
import { TourSegmentSummary } from "./TourSegmentSummary";
import { ClickableTimestampText } from "./ClickableTimestampText";
import { ReanalyzeWithRubric } from "./ReanalyzeWithRubric";
import { ReprocessButton } from "./ReprocessButton";
import { rubricPctByColor } from "./session-detail-class-maps";
import styles from "./session-detail.module.css";
import { isDiscussionComment, scoreColor, type SessionComment } from "./session-detail-utils";

export type SidebarTab = "rubric" | "comments" | "audio" | "ai";

export function SessionDetailSidebar({
  sessionId,
  analysis,
  rubric,
  phases,
  initialAudioInsightsStatus,
  initialAudioInsights,
  participants,
  duration,
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
  rubric: {
    id: string;
    name: string | null;
    analysisModel?: AnalysisModelId;
  } | null;
  phases: ConversationPhaseSegmentation | null;
  initialAudioInsightsStatus: AudioInsightsStatus;
  initialAudioInsights: AudioInsights | null;
  participants: SessionParticipants;
  duration: number;
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
          aria-selected={tab === "audio"}
          className={`${styles.sidebarTab} ${tab === "audio" ? styles.sidebarTabActive : ""}`}
          onClick={() => onTabChange("audio")}
          title="Audio insights"
        >
          <Activity size={18} />
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
        <div
          className={`${styles.sidebarPanel} ${tab === "rubric" ? styles.sidebarPanelActive : ""}`}
          hidden={tab !== "rubric"}
        >
          <SessionRubricPanel
            analysis={analysis}
            sessionId={sessionId}
            rubric={rubric}
            phases={phases}
            duration={duration}
            currentTime={currentTime}
            onSeek={onSeek}
          />
        </div>
        <div
          className={`${styles.sidebarPanel} ${tab === "comments" ? styles.sidebarPanelActive : ""}`}
          hidden={tab !== "comments"}
        >
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
        </div>
        <div
          className={`${styles.sidebarPanel} ${tab === "audio" ? styles.sidebarPanelActive : ""}`}
          hidden={tab !== "audio"}
        >
          <SessionAudioInsightsSidebarTab
            sessionId={sessionId}
            initialStatus={initialAudioInsightsStatus}
            initialInsights={initialAudioInsights}
            participants={participants}
            duration={duration}
            currentTime={currentTime}
            onSeek={onSeek}
          />
        </div>
        <div
          className={`${styles.sidebarPanel} ${tab === "ai" ? styles.sidebarPanelActive : ""}`}
          hidden={tab !== "ai"}
        >
          <SessionAiChat
            sessionId={sessionId}
            analysis={analysis}
            defaultModel={rubric?.analysisModel}
            onSeek={onAiSeek}
          />
        </div>
      </div>
    </aside>
  );
}

function SessionRubricPanel({
  analysis,
  sessionId,
  rubric,
  phases,
  duration,
  currentTime,
  onSeek,
}: {
  analysis: AnalysisResult;
  sessionId: string;
  rubric: {
    id: string;
    name: string | null;
  } | null;
  phases: ConversationPhaseSegmentation | null;
  duration: number;
  currentTime: number;
  onSeek: (seconds: number) => void;
}) {
  const [summaryExpanded, setSummaryExpanded] = useState(false);
  const [openRubricSection, setOpenRubricSection] = useState<string | null>(null);
  const sectionRefs = useRef<Record<string, HTMLDetailsElement | null>>({});
  const anyQuestions = analysis.sectionScores.some((section) => section.questions?.length);
  const sortedSections = [...analysis.sectionScores].sort((a, b) => a.score - b.score);
  const focusSection = sortedSections[0] ?? analysis.sectionScores[0];
  const strongestSection = sortedSections[sortedSections.length - 1] ?? focusSection;
  const totalPts =
    analysis.totalPointsEarned ??
    Math.round((analysis.overallScore / 100) * (analysis.totalPointsPossible ?? 200));
  const totalMax = analysis.totalPointsPossible ?? 200;
  const selectRubricSection = (sectionName: string) => {
    setOpenRubricSection((current) => current === sectionName ? null : sectionName);
    window.requestAnimationFrame(() => {
      sectionRefs.current[sectionName]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
  };

  return (
    <div className={styles.rubricPanel}>
      <div className={styles.sidebarSectionHead}>
        <h2>Rubric</h2>
        <div className={styles.rubricHeaderActions}>
          {rubric ? (
            <Link
              href={`/rubrics/${encodeURIComponent(rubric.id)}`}
              className={styles.rubricSourceLink}
              title={`Open rubric ${rubric.name ?? rubric.id}`}
            >
              <span className={styles.rubricSourceName}>{rubric.name ?? "Rubric"}</span>
              <span className={styles.rubricSourceId}>{shortRubricId(rubric.id)}</span>
              <ExternalLink size={12} />
            </Link>
          ) : (
            <span className={styles.rubricSourceMuted}>Default rubric</span>
          )}
          <span className={styles.sidebarScore}>{analysis.overallScore}%</span>
        </div>
      </div>

      <ReanalyzeWithRubric sessionId={sessionId} currentRubricId={rubric?.id ?? null} />

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
        <div
          className={styles.rubricInsightGridPanel}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <div className={styles.rubricInsightGraphHead}>
            <span className={styles.rubricInsightLabel}>Strengths</span>
          </div>
          <RubricStrengthRadar
            sections={analysis.sectionScores}
            activeSection={openRubricSection}
            onSectionSelect={selectRubricSection}
          />
          <div className={styles.rubricInsightStrengthScores}>
            {analysis.sectionScores.map((section) => (
              <button
                key={section.section}
                type="button"
                className={`${styles.rubricInsightStrengthScore} ${openRubricSection === section.section ? styles.rubricInsightStrengthScoreActive : ""}`}
                onClick={() => selectRubricSection(section.section)}
                aria-pressed={openRubricSection === section.section}
              >
                <span>{shortAxisLabel(section.section)}</span>
                <strong>{Math.round(section.score)}%</strong>
              </button>
            ))}
          </div>
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
          {summaryExpanded && (
            <TourSegmentSummary
              phases={phases}
              duration={duration}
              currentTime={currentTime}
              onSeek={onSeek}
            />
          )}
        </div>
      </div>

      {analysis.sectionScores.map((section) => {
        const color = scoreColor(section.score);
        const questions = section.questions ?? [];
        const passCount = questions.filter((question) => question.passed).length;

        return (
          <details
            key={section.section}
            ref={(node) => { sectionRefs.current[section.section] = node; }}
            className={`${styles.rubricSection} ${openRubricSection === section.section ? styles.rubricSectionActive : ""}`}
            open={openRubricSection === section.section}
          >
            <summary
              onClick={(event) => {
                event.preventDefault();
                selectRubricSection(section.section);
              }}
            >
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
                      {question.evidence && (
                        <ClickableTimestampText
                          text={question.evidence}
                          onSeek={onSeek}
                          className={styles.rubricQEvidence}
                        />
                      )}
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

function shortRubricId(id: string) {
  if (id.length <= 12) return id;
  return `${id.slice(0, 6)}...${id.slice(-4)}`;
}

function RubricStrengthRadar({
  sections,
  activeSection,
  onSectionSelect,
}: {
  sections: AnalysisResult["sectionScores"];
  activeSection: string | null;
  onSectionSelect: (sectionName: string) => void;
}) {
  const [shouldAnimate, setShouldAnimate] = useState(true);
  const radarData = sections.length
    ? sections.map((section) => ({
      axis: shortAxisLabel(section.section),
      score: Math.max(0, Math.min(100, section.score)),
      section: section.section,
    }))
    : [{ axis: "Score", score: 0, section: "Score" }];

  useEffect(() => {
    const timeout = window.setTimeout(() => setShouldAnimate(false), 1200);
    return () => window.clearTimeout(timeout);
  }, []);

  return (
    <div
      className={`${styles.rubricInsightRadar} ${shouldAnimate ? styles.rubricInsightRadarAnimate : ""}`}
      role="img"
      aria-label="Rubric strength radar"
    >
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={radarData} margin={{ top: 18, right: 28, bottom: 18, left: 28 }}>
          <PolarGrid stroke="#e4e4e7" />
          <PolarAngleAxis
            dataKey="axis"
            tick={(props) => (
              <RubricRadarTick
                {...props}
                sections={sections}
                activeSection={activeSection}
                onSectionSelect={onSectionSelect}
              />
            )}
          />
          <Radar
            dataKey="score"
            stroke="#4d8ae5"
            fill="#4d8ae5"
            fillOpacity={0.2}
            strokeWidth={2.4}
            isAnimationActive={shouldAnimate}
            animationBegin={120}
            animationDuration={900}
            animationEasing="ease-out"
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}

function RubricRadarTick({
  payload,
  x,
  y,
  textAnchor,
  sections,
  activeSection,
  onSectionSelect,
}: {
  payload?: { value?: string };
  x?: number;
  y?: number;
  textAnchor?: "start" | "middle" | "end";
  sections: AnalysisResult["sectionScores"];
  activeSection: string | null;
  onSectionSelect: (sectionName: string) => void;
}) {
  const label = String(payload?.value ?? "");
  const section = sections.find((item) => shortAxisLabel(item.section) === label);
  if (!section) return null;
  const isActive = activeSection === section.section;

  return (
    <g
      className={`${styles.rubricInsightRadarTick} ${isActive ? styles.rubricInsightRadarTickActive : ""}`}
      role="button"
      tabIndex={0}
      onClick={(event) => {
        event.stopPropagation();
        onSectionSelect(section.section);
      }}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        onSectionSelect(section.section);
      }}
      aria-label={`Open ${section.section} rubric section`}
    >
      <text x={x} y={y} textAnchor={textAnchor} dominantBaseline="middle">
        {label}
      </text>
    </g>
  );
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
