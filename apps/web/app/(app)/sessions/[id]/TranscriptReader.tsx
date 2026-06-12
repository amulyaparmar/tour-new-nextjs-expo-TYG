"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Forward, Search, Sparkles } from "lucide-react";

type ReaderTranscriptSegment = {
  id: string;
  speaker: string;
  startTime: number;
  endTime: number;
  text: string;
};

type Props = {
  transcript: ReaderTranscriptSegment[];
  summary?: string | null;
  currentTime: number;
  duration: number;
  seekTo: (seconds: number) => void;
};

const speakerStyles = [
  { color: "#0071e3", softColor: "#e8f2ff" },
  { color: "#7c3aed", softColor: "#f0eaff" },
  { color: "#0f766e", softColor: "#e6fffb" },
  { color: "#b45309", softColor: "#fff7ed" },
  { color: "#be123c", softColor: "#fff1f2" }
];

export function TranscriptReader({ transcript, summary, currentTime, duration, seekTo }: Props) {
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const rowRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [query, setQuery] = useState("");
  const [showSummary, setShowSummary] = useState(Boolean(summary));

  const transcriptEnd = useMemo(() => {
    return transcript.reduce((max, seg) => Math.max(max, seg.endTime || seg.startTime), 0);
  }, [transcript]);

  const totalDuration = duration || transcriptEnd;

  const speakerMap = useMemo(() => {
    const uniqueSpeakers = Array.from(new Set(transcript.map((seg) => seg.speaker || "Speaker")));
    return new Map(
      uniqueSpeakers.map((speaker, index) => [
        speaker,
        {
          ...speakerStyles[index % speakerStyles.length],
          initials: speaker
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2)
            .map((part) => part[0]?.toUpperCase())
            .join("") || `S${index + 1}`
        }
      ])
    );
  }, [transcript]);

  const speakerStats = useMemo(() => {
    return Array.from(speakerMap.keys()).map((speaker) => {
      const segments = transcript.filter((seg) => (seg.speaker || "Speaker") === speaker);
      const seconds = segments.reduce((sum, seg) => sum + Math.max(0, (seg.endTime || seg.startTime) - seg.startTime), 0);
      return { speaker, count: segments.length, seconds };
    });
  }, [speakerMap, transcript]);

  const activeSegment = useMemo(() => {
    if (transcript.length === 0) return null;
    return transcript.reduce<ReaderTranscriptSegment | null>((active, seg) => {
      if (currentTime >= seg.startTime && (!active || seg.startTime >= active.startTime)) return seg;
      return active;
    }, null) ?? transcript[0]!;
  }, [currentTime, transcript]);

  const filteredTranscript = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return transcript;
    return transcript.filter((seg) => {
      return seg.text.toLowerCase().includes(trimmed) || seg.speaker.toLowerCase().includes(trimmed);
    });
  }, [query, transcript]);

  useEffect(() => {
    if (!activeSegment || !transcriptRef.current) return;
    const row = rowRefs.current[activeSegment.id];
    if (!row) return;

    const container = transcriptRef.current;
    const offset = row.offsetTop - container.offsetTop - container.clientHeight / 2 + row.clientHeight / 2;
    container.scrollTo({ top: Math.max(0, offset), behavior: "smooth" });
  }, [activeSegment?.id]);

  return (
    <section className="vr-card" aria-label="Voice AI transcript reader">
      <div className="vr-toolbar">
        <div className="vr-search">
          <Search size={15} />
          <input
            aria-label="Search transcript"
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder="Search transcript..."
            type="search"
            value={query}
          />
        </div>

        <div className="vr-speakers" aria-label="Diarized speakers">
          {speakerStats.map((stat) => {
            const speaker = speakerMap.get(stat.speaker)!;
            return (
              <button
                className="vr-speaker-chip"
                key={stat.speaker}
                onClick={() => {
                  const first = transcript.find((seg) => (seg.speaker || "Speaker") === stat.speaker);
                  if (first) seekTo(first.startTime);
                }}
                style={{ color: speaker.color, backgroundColor: speaker.softColor }}
                type="button"
              >
                <span>{speaker.initials}</span>
                {stat.speaker}
                <small>{formatTime(stat.seconds)}</small>
              </button>
            );
          })}
        </div>
      </div>

      {summary && (
        <div className="vr-summary">
          <button className="vr-summary-toggle" type="button" onClick={() => setShowSummary((value) => !value)}>
            <Sparkles size={16} />
            AI generated summary
          </button>
          {showSummary && <p>{summary}</p>}
        </div>
      )}

      <div className="vr-transcript" ref={transcriptRef}>
        <div className="vr-transcript-status" aria-live="polite">
          <span>{formatTime(currentTime)}</span>
          <span>{activeSegment ? `${activeSegment.speaker || "Speaker"} speaking` : "No active transcript line"}</span>
          <span>{formatTime(totalDuration)}</span>
        </div>
        {filteredTranscript.map((seg) => {
          const speaker = speakerMap.get(seg.speaker || "Speaker") ?? speakerStyles[0]!;
          const active = activeSegment?.id === seg.id;

          return (
            <button
              className={active ? "vr-entry vr-entry--active" : "vr-entry"}
              key={seg.id}
              onClick={() => seekTo(seg.startTime)}
              ref={(node) => {
                rowRefs.current[seg.id] = node;
              }}
              type="button"
            >
              <span className="vr-entry-time">{formatTime(seg.startTime)}</span>
              <span className="vr-entry-speaker">
                <span className="vr-entry-avatar" style={{ backgroundColor: speaker.softColor, color: speaker.color }}>
                  {"initials" in speaker ? speaker.initials : "S"}
                </span>
                <span style={{ color: speaker.color }}>{seg.speaker || "Speaker"}</span>
              </span>
              <span className="vr-entry-text">{seg.text}</span>
              <span className="vr-entry-jump">
                <Forward size={15} />
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function formatTime(timeInSeconds: number) {
  if (!Number.isFinite(timeInSeconds) || timeInSeconds < 0) return "00:00";
  const hours = Math.floor(timeInSeconds / 3600);
  const minutes = Math.floor((timeInSeconds % 3600) / 60);
  const seconds = Math.floor(timeInSeconds % 60);
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
