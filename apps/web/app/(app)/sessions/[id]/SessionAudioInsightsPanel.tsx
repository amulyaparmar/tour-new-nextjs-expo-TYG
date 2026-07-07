"use client";

import type { AudioInsights } from "@tour/shared";
import { Activity, Mic2, Sparkles, Volume2 } from "lucide-react";

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
  insights,
  duration,
  currentTime,
  onSeek,
}: {
  insights: AudioInsights;
  duration: number;
  currentTime: number;
  onSeek: (seconds: number) => void;
}) {
  const activeSegmentIndex = insights.segments.findIndex(
    (segment) => currentTime >= segment.startTime && currentTime <= segment.endTime
  );

  return (
    <div className={styles.audioPanel}>
      <div className={styles.sidebarSectionHead}>
        <h2>Audio insights</h2>
        <span className={styles.audioSentimentBadge} data-sentiment={insights.overallSentiment}>
          {SENTIMENT_LABELS[insights.overallSentiment]}
        </span>
      </div>

      <p className={styles.audioSummary}>{insights.summary}</p>

      <div className={styles.audioMetaRow}>
        <span className={styles.audioMetaPill}>
          <Sparkles size={14} />
          {insights.model}
        </span>
        <span className={styles.audioMetaPill}>
          <Mic2 size={14} />
          {insights.segments.length} segments
        </span>
      </div>

      {insights.speakerDynamics.length > 0 && (
        <section className={styles.audioSection}>
          <h3 className={styles.audioSectionTitle}>Speaker dynamics</h3>
          <div className={styles.audioSpeakerGrid}>
            {insights.speakerDynamics.map((speaker) => (
              <div key={speaker.speaker} className={styles.audioSpeakerCard}>
                <div className={styles.audioSpeakerHead}>
                  <strong>{speaker.speaker}</strong>
                  <span
                    className={styles.audioEmotionDot}
                    style={{ backgroundColor: EMOTION_COLORS[speaker.dominantEmotion] ?? "#71717a" }}
                    title={speaker.dominantEmotion}
                  />
                </div>
                <p className={styles.audioSpeakerStat}>
                  {formatDuration(speaker.talkTimeSeconds)} talk time
                </p>
                <p className={styles.audioSpeakerNotes}>{speaker.notes}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {insights.highlights.length > 0 && (
        <section className={styles.audioSection}>
          <h3 className={styles.audioSectionTitle}>Coaching highlights</h3>
          <div className={styles.audioHighlightList}>
            {insights.highlights.map((highlight, index) => (
              <button
                key={`${highlight.timestamp}-${index}`}
                type="button"
                className={styles.audioHighlightCard}
                onClick={() => onSeek(highlight.timestamp)}
              >
                <span className={styles.audioHighlightTime}>{formatMmSs(highlight.timestamp)}</span>
                <div>
                  <strong>{highlight.label}</strong>
                  <p>{highlight.explanation}</p>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {insights.ambienceCues.length > 0 && (
        <section className={styles.audioSection}>
          <h3 className={styles.audioSectionTitle}>
            <Volume2 size={16} />
            Ambience
          </h3>
          <div className={styles.audioAmbienceList}>
            {insights.ambienceCues.map((cue, index) => (
              <button
                key={`${cue.label}-${index}`}
                type="button"
                className={styles.audioAmbienceCard}
                onClick={() => onSeek(cue.startTime)}
              >
                <span>{formatMmSs(cue.startTime)}</span>
                <div>
                  <strong>{cue.label}</strong>
                  <p>{cue.description}</p>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className={styles.audioSection}>
        <h3 className={styles.audioSectionTitle}>
          <Activity size={16} />
          Sentiment timeline
        </h3>
        {duration > 0 && (
          <div className={styles.audioTimeline} aria-hidden>
            {insights.segments.map((segment, index) => {
              const left = (segment.startTime / duration) * 100;
              const width = Math.max(((segment.endTime - segment.startTime) / duration) * 100, 0.8);
              return (
                <button
                  key={`${segment.startTime}-${index}`}
                  type="button"
                  className={styles.audioTimelineSegment}
                  style={{
                    left: `${left}%`,
                    width: `${width}%`,
                    backgroundColor: EMOTION_COLORS[segment.emotion] ?? "#a1a1aa",
                    opacity: activeSegmentIndex === index ? 1 : 0.72,
                  }}
                  title={`${segment.speaker}: ${segment.emotion}`}
                  onClick={() => onSeek(segment.startTime)}
                />
              );
            })}
            <span
              className={styles.audioTimelinePlayhead}
              style={{ left: `${Math.min((currentTime / duration) * 100, 100)}%` }}
            />
          </div>
        )}
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
                <span className={styles.audioSegmentSpeaker}>{segment.speaker}</span>
                <span
                  className={styles.audioEmotionPill}
                  style={{ color: EMOTION_COLORS[segment.emotion] ?? "#71717a" }}
                >
                  {segment.emotion}
                </span>
                <span className={styles.audioEnergyPill}>{segment.energy} energy</span>
              </div>
              <p className={styles.audioSegmentText}>{segment.text}</p>
              {segment.translation && (
                <p className={styles.audioSegmentTranslation}>{segment.translation}</p>
              )}
              {segment.language && (
                <span className={styles.audioSegmentLanguage}>{segment.language}</span>
              )}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
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
