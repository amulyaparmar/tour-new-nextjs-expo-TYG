"use client";

import { useState, type ReactNode } from "react";
import type {
  AudioConversationStats,
  AudioInsights,
  SessionParticipants,
  TranscriptConversationStats,
} from "@tour/shared";
import { formatSpeakerAnnotation } from "@tour/shared";
import {
  Activity,
  BarChart3,
  ChevronDown,
  MessageCircle,
  Mic2,
  Sparkles,
  Volume2,
} from "lucide-react";

import styles from "./session-detail.module.css";

const SENTIMENT_LABELS: Record<AudioInsights["overallSentiment"], string> = {
  positive: "Positive",
  neutral: "Neutral",
  negative: "Negative",
  mixed: "Mixed",
};

const EMOTION_COLORS: Record<string, string> = {
  happy: "#16a34a",
  excited: "#2563eb",
  neutral: "#71717a",
  concerned: "#d97706",
  sad: "#7c3aed",
  angry: "#dc2626",
};

export function SessionAudioInsightsPanel({
  sessionId,
  insights,
  fallbackConversationStats = null,
  participants,
  duration,
  currentTime,
  onSeek,
  onAskRecording,
}: {
  sessionId: string;
  insights: AudioInsights;
  fallbackConversationStats?: TranscriptConversationStats | null;
  participants: SessionParticipants;
  duration: number;
  currentTime: number;
  onSeek: (seconds: number) => void;
  onAskRecording?: (model?: string) => void;
}) {
  const conversationStats =
    insights.conversationStats ?? fallbackConversationStats;
  const conversationStatsSource = insights.conversationStats
    ? "gemini"
    : conversationStats
      ? "transcript"
      : null;
  const labelFor = (speaker: string) =>
    formatSpeakerAnnotation(speaker, participants);
  const activeSegmentIndex = insights.segments.findIndex(
    (segment) =>
      currentTime >= segment.startTime && currentTime <= segment.endTime,
  );
  const totalTalkTime = insights.speakerDynamics.reduce(
    (sum, speaker) => sum + speaker.talkTimeSeconds,
    0,
  );

  return (
    <div className={styles.audioPanel}>
      <header className={styles.audioPanelHeader}>
        <div className={styles.sidebarSectionHead}>
          <h2>Audio insights</h2>
          <span
            className={styles.audioSentimentBadge}
            data-sentiment={insights.overallSentiment}
          >
            {SENTIMENT_LABELS[insights.overallSentiment]}
          </span>
        </div>
        <button
          type="button"
          className={styles.audioAskAiButton}
          onClick={() => onAskRecording?.(insights.model)}
        >
          <MessageCircle size={15} aria-hidden />
          Ask AI
        </button>
      </header>

      <div className={styles.audioPanelScroll}>
        <div className={styles.audioAccordionStack}>
          {conversationStats && (
            <AudioAccordion
              title="Stats"
              icon={<BarChart3 size={14} aria-hidden />}
              defaultOpen
              preview={
                conversationStats.talkRatioPercent == null
                  ? "Conversation measurements"
                  : `${Math.round(conversationStats.talkRatioPercent)}% talk ratio`
              }
            >
              <AudioStatsGrid
                stats={conversationStats}
                source={conversationStatsSource}
              />
            </AudioAccordion>
          )}

          <AudioAccordion
            title="Overview"
            defaultOpen={!conversationStats}
            preview={truncate(insights.summary, 72)}
          >
            <p className={styles.audioSummary}>{insights.summary}</p>
            <div className={styles.audioMetaRow}>
              <span className={styles.audioMetaPill}>
                <Sparkles size={12} aria-hidden />
                {formatModelLabel(insights.model)}
              </span>
              <span className={styles.audioMetaPill}>
                <Mic2 size={12} aria-hidden />
                {insights.segments.length} segments
              </span>
            </div>
          </AudioAccordion>

          {insights.speakerDynamics.length > 0 && (
            <AudioAccordion
              title="Speaker dynamics"
              count={insights.speakerDynamics.length}
              defaultOpen
              preview={`${insights.speakerDynamics.length} speakers`}
            >
              <div className={styles.audioSpeakerGrid}>
                {insights.speakerDynamics.map((speaker) => {
                  const talkShare =
                    totalTalkTime > 0
                      ? Math.round(
                          (speaker.talkTimeSeconds / totalTalkTime) * 100,
                        )
                      : 0;

                  return (
                    <article
                      key={speaker.speaker}
                      className={styles.audioSpeakerCard}
                    >
                      <div className={styles.audioSpeakerHead}>
                        <div className={styles.audioSpeakerIdentity}>
                          <strong>{labelFor(speaker.speaker)}</strong>
                          <span
                            className={styles.audioEmotionPill}
                            style={{
                              color:
                                EMOTION_COLORS[speaker.dominantEmotion] ??
                                "#71717a",
                            }}
                          >
                            {capitalize(speaker.dominantEmotion)}
                          </span>
                        </div>
                        <span className={styles.audioSpeakerStat}>
                          {formatDuration(speaker.talkTimeSeconds)}
                        </span>
                      </div>
                      <div className={styles.audioTalkBar} aria-hidden>
                        <span
                          className={styles.audioTalkBarFill}
                          style={{ width: `${talkShare}%` }}
                        />
                      </div>
                      <p className={styles.audioSpeakerNotes}>
                        {speaker.notes}
                      </p>
                    </article>
                  );
                })}
              </div>
            </AudioAccordion>
          )}

          <AudioAccordion
            title="Sentiment timeline"
            icon={<Activity size={14} aria-hidden />}
            defaultOpen
            preview={
              duration > 0
                ? `${formatMmSs(currentTime)} / ${formatMmSs(duration)}`
                : "Timeline"
            }
          >
            {duration > 0 ? (
              <div className={styles.audioTimelineWrap}>
                <div className={styles.audioTimeline} aria-hidden>
                  {insights.segments.map((segment, index) => {
                    const left = (segment.startTime / duration) * 100;
                    const width = Math.max(
                      ((segment.endTime - segment.startTime) / duration) * 100,
                      0.8,
                    );
                    return (
                      <button
                        key={`${segment.startTime}-${index}`}
                        type="button"
                        className={styles.audioTimelineSegment}
                        style={{
                          left: `${left}%`,
                          width: `${width}%`,
                          backgroundColor:
                            EMOTION_COLORS[segment.emotion] ?? "#a1a1aa",
                          opacity: activeSegmentIndex === index ? 1 : 0.75,
                        }}
                        title={`${labelFor(segment.speaker)}: ${segment.emotion}`}
                        onClick={() => onSeek(segment.startTime)}
                      />
                    );
                  })}
                  <span
                    className={styles.audioTimelinePlayhead}
                    style={{
                      left: `${Math.min((currentTime / duration) * 100, 100)}%`,
                    }}
                  />
                </div>
                <div className={styles.audioTimelineLabels}>
                  <span>0:00</span>
                  <span>{formatMmSs(duration)}</span>
                </div>
              </div>
            ) : (
              <p className={styles.audioPanelEmptyHint}>
                Timeline unavailable — recording duration is unknown.
              </p>
            )}
          </AudioAccordion>

          <AudioAccordion
            title="Segments"
            count={insights.segments.length}
            preview={
              activeSegmentIndex >= 0
                ? `${formatMmSs(insights.segments[activeSegmentIndex]!.startTime)} · ${labelFor(insights.segments[activeSegmentIndex]!.speaker)}`
                : `${insights.segments.length} moments`
            }
          >
            <div className={styles.audioSegmentList}>
              {insights.segments.map((segment, index) => (
                <button
                  key={`${segment.startTime}-${index}`}
                  type="button"
                  className={`${styles.audioSegmentCard} ${activeSegmentIndex === index ? styles.audioSegmentCardActive : ""}`}
                  onClick={() => onSeek(segment.startTime)}
                >
                  <div className={styles.audioSegmentHead}>
                    <span className={styles.audioSegmentTime}>
                      {formatMmSs(segment.startTime)}
                    </span>
                    <span className={styles.audioSegmentSpeaker}>
                      {labelFor(segment.speaker)}
                    </span>
                    <span
                      className={styles.audioEmotionPill}
                      style={{
                        color: EMOTION_COLORS[segment.emotion] ?? "#71717a",
                      }}
                    >
                      {capitalize(segment.emotion)}
                    </span>
                  </div>
                  <p className={styles.audioSegmentText}>{segment.text}</p>
                </button>
              ))}
            </div>
          </AudioAccordion>

          {insights.highlights.length > 0 && (
            <AudioAccordion
              title="Coaching highlights"
              count={insights.highlights.length}
              preview={`${insights.highlights.length} moments`}
            >
              <div className={styles.audioHighlightList}>
                {insights.highlights.map((highlight, index) => (
                  <button
                    key={`${highlight.timestamp}-${index}`}
                    type="button"
                    className={styles.audioHighlightCard}
                    onClick={() => onSeek(highlight.timestamp)}
                  >
                    <span className={styles.audioHighlightTime}>
                      {formatMmSs(highlight.timestamp)}
                    </span>
                    <div className={styles.audioCardBody}>
                      <strong>{highlight.label}</strong>
                      <p>{highlight.explanation}</p>
                    </div>
                  </button>
                ))}
              </div>
            </AudioAccordion>
          )}

          {insights.ambienceCues.length > 0 && (
            <AudioAccordion
              title="Ambience"
              icon={<Volume2 size={14} aria-hidden />}
              count={insights.ambienceCues.length}
              preview={`${insights.ambienceCues.length} cues`}
            >
              <div className={styles.audioAmbienceList}>
                {insights.ambienceCues.map((cue, index) => (
                  <button
                    key={`${cue.label}-${index}`}
                    type="button"
                    className={styles.audioAmbienceCard}
                    onClick={() => onSeek(cue.startTime)}
                  >
                    <span className={styles.audioHighlightTime}>
                      {formatMmSs(cue.startTime)}
                    </span>
                    <div className={styles.audioCardBody}>
                      <strong>{cue.label}</strong>
                      <p>{cue.description}</p>
                    </div>
                  </button>
                ))}
              </div>
            </AudioAccordion>
          )}
        </div>
      </div>
    </div>
  );
}

export function AudioStatsGrid({
  stats,
  source = null,
}: {
  stats: AudioConversationStats | TranscriptConversationStats;
  source?: "gemini" | "transcript" | null;
}) {
  const interactivityScore = isGeminiConversationStats(stats)
    ? formatInteractivityScore(stats)
    : null;
  const items = [
    {
      label: "Talk ratio",
      value:
        stats.talkRatioPercent == null
          ? null
          : `${Math.round(stats.talkRatioPercent)}%`,
      hint: "Rep share of total talk time",
    },
    {
      label: "Longest prospect talk",
      value:
        stats.longestProspectTalkSeconds == null
          ? null
          : formatStatDuration(stats.longestProspectTalkSeconds),
      hint: "Longest uninterrupted prospect monologue",
    },
    {
      label: "Longest talk",
      value:
        stats.longestTalkSeconds == null
          ? null
          : formatStatDuration(stats.longestTalkSeconds),
      hint: "Longest uninterrupted monologue",
    },
    {
      label: "Rep talk time",
      value:
        stats.repTalkTimeSeconds == null
          ? null
          : formatStatDuration(stats.repTalkTimeSeconds),
      hint: "Total rep speaking time",
    },
    {
      label: "Interactivity",
      value: interactivityScore == null ? null : `${interactivityScore}/5`,
      hint: "Meaningful back-and-forth quality",
    },
    {
      label: "Patience",
      value:
        stats.patienceSeconds == null
          ? null
          : formatPatience(stats.patienceSeconds),
      hint: "Avg pause after prospect before rep responds",
    },
    {
      label: "Talk speed",
      value:
        stats.talkSpeedWordsPerMinute == null
          ? null
          : `${Math.round(stats.talkSpeedWordsPerMinute)} wpm`,
      hint: "Rep words per minute",
    },
  ].filter(
    (item): item is { label: string; value: string; hint: string } =>
      item.value !== null,
  );

  return (
    <div className={styles.audioStatsSection}>
      <div className={styles.audioStatsGrid}>
        {items.map((item) => (
          <article
            key={item.label}
            className={styles.audioStatCard}
            title={item.hint}
          >
            <span className={styles.audioStatLabel}>{item.label}</span>
            <strong className={styles.audioStatValue}>{item.value}</strong>
          </article>
        ))}
      </div>
      <p className={styles.audioStatsNote}>
        {source === "transcript"
          ? "Transcript estimate calculated from speaker timestamps. Gemini may replace these measurements after listening to the recording."
          : isGeminiConversationStats(stats) && stats.interactivityNotes
            ? stats.interactivityNotes
            : "Measured by Gemini from the recording."}
      </p>
    </div>
  );
}

function isGeminiConversationStats(
  stats: AudioConversationStats | TranscriptConversationStats,
): stats is AudioConversationStats {
  return "interactivityScore" in stats;
}

function formatInteractivityScore(stats: AudioConversationStats): number {
  if (stats.interactivityTotal > 5) {
    return Math.round(
      Math.max(
        0,
        Math.min(5, (stats.interactivityScore / stats.interactivityTotal) * 5),
      ),
    );
  }
  return Math.round(Math.max(0, Math.min(5, stats.interactivityScore)));
}

function formatStatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  if (mins >= 60) {
    const hours = Math.floor(mins / 60);
    const remMins = mins % 60;
    return secs > 0
      ? `${hours}h ${remMins}m ${secs}s`
      : `${hours}h ${remMins}m`;
  }
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
}

function formatPatience(seconds: number): string {
  if (seconds < 1) return `${seconds.toFixed(1)}s`;
  return `${Math.round(seconds)}s`;
}

export function AudioAccordion({
  title,
  icon,
  count,
  preview,
  defaultOpen = false,
  children,
}: {
  title: string;
  icon?: ReactNode;
  count?: number;
  preview?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <details
      className={`${styles.audioAccordion} ${open ? styles.audioAccordionOpen : ""}`}
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className={styles.audioAccordionSummary}>
        <span className={styles.audioAccordionTitle}>
          {icon}
          {title}
          {count != null && (
            <span className={styles.audioSectionCount}>{count}</span>
          )}
        </span>
        <span className={styles.audioAccordionMeta}>
          {!open && preview ? (
            <span className={styles.audioAccordionPreview}>{preview}</span>
          ) : null}
          <ChevronDown
            size={14}
            className={styles.audioAccordionChevron}
            aria-hidden
          />
        </span>
      </summary>
      <div className={styles.audioAccordionBody}>{children}</div>
    </details>
  );
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max).trim()}…`;
}

function formatModelLabel(model: string): string {
  return model
    .replace(/^gemini-/i, "Gemini ")
    .replace(/-/g, " ")
    .replace(/\bflash\b/i, "Flash")
    .replace(/\bpro\b/i, "Pro");
}

function capitalize(value: string): string {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatMmSs(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
}
