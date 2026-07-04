"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { AnalysisResult } from "@tour/shared";

import { FloatingSessionPlayer } from "./FloatingSessionPlayer";
import { SessionDetailSidebar, type SidebarTab } from "./SessionDetailSidebar";
import { SessionTranscriptStage } from "./SessionTranscriptStage";
import {
  buildSessionMoments,
  isDiscussionComment,
  mergeKeyMomentComments,
  PLAYBACK_RATES,
  type SessionComment,
  type SessionMoment,
  type SessionScreenshot,
  type TranscriptSegment,
} from "./session-detail-utils";
import styles from "./session-detail.module.css";

type Props = {
  sessionId: string;
  analysis: AnalysisResult;
  transcript: TranscriptSegment[];
  screenshots: SessionScreenshot[];
  recordingUrl: string | null;
  videoUrl: string | null;
  audioUrl: string | null;
  duration: number;
};

function sortNavigableComments(comments: SessionComment[]) {
  return [...comments].sort((a, b) => {
    if (a.timestampSec != null && b.timestampSec != null) {
      return a.timestampSec - b.timestampSec;
    }
    if (a.timestampSec != null) return -1;
    if (b.timestampSec != null) return 1;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });
}

export function SessionDetailExperience({
  sessionId,
  analysis,
  transcript,
  screenshots,
  recordingUrl,
  videoUrl,
  audioUrl,
  duration,
}: Props) {
  const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [loadedDuration, setLoadedDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [selectedMomentIndex, setSelectedMomentIndex] = useState(0);
  const [selectedCommentIndex, setSelectedCommentIndex] = useState(0);
  const [showComments, setShowComments] = useState(true);
  const [comments, setComments] = useState<SessionComment[]>([]);
  const [mediaError, setMediaError] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("rubric");
  const [chatScrollRequest, setChatScrollRequest] = useState<{ key: number; seconds: number } | null>(null);
  const chatScrollKeyRef = useRef(0);

  const discussionComments = useMemo(
    () => comments.filter(isDiscussionComment),
    [comments]
  );

  const topLevelComments = useMemo(
    () => discussionComments.filter((comment) => !comment.parentId),
    [discussionComments]
  );

  const navigableComments = useMemo(
    () => sortNavigableComments(topLevelComments),
    [topLevelComments]
  );

  const timestampedComments = useMemo(
    () => topLevelComments
      .filter((comment) => comment.timestampSec != null)
      .sort((a, b) => (a.timestampSec ?? 0) - (b.timestampSec ?? 0)),
    [topLevelComments]
  );

  const selectedCommentId = navigableComments[selectedCommentIndex]?.id ?? null;
  const activeCommentId = selectedCommentId;

  const src = recordingUrl || audioUrl || videoUrl || "";
  const isVideo =
    /\.(mp4|webm|mov)(\?|$)/i.test(src) ||
    (!!videoUrl && !audioUrl && !recordingUrl?.includes("/recording"));

  const transcriptEnd = useMemo(
    () => transcript.reduce((max, seg) => Math.max(max, seg.endTime || seg.startTime), 0),
    [transcript]
  );
  const effectiveDuration = loadedDuration || duration || transcriptEnd;

  const moments = useMemo(() => {
    const base = buildSessionMoments(analysis, transcript, screenshots, effectiveDuration);
    return mergeKeyMomentComments(base, comments, analysis, transcript, effectiveDuration);
  }, [analysis, transcript, screenshots, effectiveDuration, comments]);

  const seekTo = useCallback((seconds: number, options?: { play?: boolean }) => {
    const clamped = effectiveDuration > 0
      ? Math.max(0, Math.min(effectiveDuration, seconds))
      : Math.max(0, seconds);

    if (mediaRef.current && Number.isFinite(clamped)) {
      mediaRef.current.currentTime = clamped;
      mediaRef.current.playbackRate = playbackRate;
      if (options?.play) {
        void mediaRef.current.play().then(() => setIsPlaying(true)).catch(() => undefined);
      }
    }
    setCurrentTime(clamped);

    const idx = moments.findIndex((moment, index) => {
      const next = moments[index + 1];
      return clamped >= moment.timestamp && (!next || clamped < next.timestamp);
    });
    if (idx >= 0) setSelectedMomentIndex(idx);

    const commentIdx = navigableComments.findIndex((comment) => {
      if (comment.timestampSec == null) return false;
      return Math.abs(comment.timestampSec - clamped) < 3;
    });
    if (commentIdx >= 0) setSelectedCommentIndex(commentIdx);
  }, [effectiveDuration, moments, playbackRate, navigableComments]);

  const handleAiSeek = useCallback((seconds: number) => {
    seekTo(seconds, { play: true });
    chatScrollKeyRef.current += 1;
    setChatScrollRequest({ key: chatScrollKeyRef.current, seconds });
  }, [seekTo]);

  const refreshComments = useCallback(() => {
    void fetch(`/api/sessions/${sessionId}/comments`)
      .then((res) => res.ok ? res.json() : Promise.reject(new Error("Failed")))
      .then((data: { comments: SessionComment[] }) => setComments(data.comments))
      .catch(() => undefined);
  }, [sessionId]);

  const togglePlayback = useCallback(() => {
    const el = mediaRef.current;
    if (!el) return;
    el.playbackRate = playbackRate;
    if (el.paused) {
      void el.play().then(() => setIsPlaying(true)).catch(() => undefined);
    } else {
      el.pause();
      setIsPlaying(false);
    }
  }, [playbackRate]);

  const cyclePlaybackRate = useCallback(() => {
    setPlaybackRate((current) => {
      const index = PLAYBACK_RATES.indexOf(current as (typeof PLAYBACK_RATES)[number]);
      return PLAYBACK_RATES[(index + 1) % PLAYBACK_RATES.length] ?? 1;
    });
  }, []);

  const handleMomentSelect = useCallback((moment: SessionMoment) => {
    const idx = moments.findIndex((item) => item.id === moment.id);
    if (idx >= 0) setSelectedMomentIndex(idx);
    seekTo(moment.timestamp, { play: true });
  }, [moments, seekTo]);

  const navigateMoment = useCallback((direction: -1 | 1) => {
    if (moments.length === 0) return;
    const nextIndex = (selectedMomentIndex + direction + moments.length) % moments.length;
    setSelectedMomentIndex(nextIndex);
    seekTo(moments[nextIndex]!.timestamp, { play: true });
  }, [moments, selectedMomentIndex, seekTo]);

  const navigateComment = useCallback((direction: -1 | 1) => {
    if (navigableComments.length === 0) return;
    const nextIndex = (selectedCommentIndex + direction + navigableComments.length) % navigableComments.length;
    setSelectedCommentIndex(nextIndex);
    setShowComments(true);
    const comment = navigableComments[nextIndex];
    if (comment?.timestampSec != null) {
      seekTo(comment.timestampSec, { play: false });
    }
  }, [navigableComments, selectedCommentIndex, seekTo]);

  const toggleComments = useCallback(() => {
    setShowComments((value) => {
      const next = !value;
      if (next && navigableComments.length > 0) {
        const comment = navigableComments[selectedCommentIndex] ?? navigableComments[0];
        if (comment?.timestampSec != null) {
          seekTo(comment.timestampSec, { play: false });
        }
      }
      return next;
    });
  }, [navigableComments, selectedCommentIndex, seekTo]);

  const handleCommentSelect = useCallback((commentId: string) => {
    const idx = navigableComments.findIndex((comment) => comment.id === commentId);
    if (idx >= 0) setSelectedCommentIndex(idx);
    setShowComments(true);
    const comment = navigableComments.find((item) => item.id === commentId);
    if (comment?.timestampSec != null) {
      seekTo(comment.timestampSec, { play: false });
    }
  }, [navigableComments, seekTo]);

  const handleCommentsUpdated = useCallback((updated: SessionComment[]) => {
    setComments(updated);
  }, []);

  const handleScrollTimeChange = useCallback((seconds: number) => {
    if (isPlaying) return;
    const clamped = effectiveDuration > 0
      ? Math.max(0, Math.min(effectiveDuration, seconds))
      : Math.max(0, seconds);
    setCurrentTime(clamped);

    const idx = moments.findIndex((moment, index) => {
      const next = moments[index + 1];
      return clamped >= moment.timestamp && (!next || clamped < next.timestamp);
    });
    if (idx >= 0) setSelectedMomentIndex(idx);

    const commentIdx = navigableComments.findIndex((comment) => {
      if (comment.timestampSec == null) return false;
      return Math.abs(comment.timestampSec - clamped) < 3;
    });
    if (commentIdx >= 0) setSelectedCommentIndex(commentIdx);
  }, [effectiveDuration, isPlaying, moments, navigableComments]);

  useEffect(() => {
    if (mediaRef.current) mediaRef.current.playbackRate = playbackRate;
  }, [playbackRate, src]);

  useEffect(() => {
    if (navigableComments.length === 0) return;
    if (selectedCommentIndex >= navigableComments.length) {
      setSelectedCommentIndex(0);
    }
  }, [navigableComments.length, selectedCommentIndex]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/sessions/${sessionId}/comments`)
      .then((res) => res.ok ? res.json() : Promise.reject(new Error("Failed")))
      .then((data: { comments: SessionComment[] }) => {
        if (!cancelled) setComments(data.comments);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [sessionId]);

  if (!src) {
    return (
      <div className={styles.emptyRecording}>
        No recording available for this session.
      </div>
    );
  }

  if (mediaError) {
    return (
      <div className={`${styles.emptyRecording} ${styles.emptyRecordingError}`}>
        Could not load recording. Try refreshing the page.
      </div>
    );
  }

  return (
    <div className={styles.shell}>
      <HiddenMedia
        isVideo={isVideo}
        mediaRef={mediaRef}
        src={src}
        duration={effectiveDuration}
        onError={() => setMediaError(true)}
        onLoadedDuration={setLoadedDuration}
        onPlayingChange={setIsPlaying}
        onTimeChange={setCurrentTime}
      />

      <div className={styles.main}>
        <SessionTranscriptStage
          sessionId={sessionId}
          transcript={transcript}
          summary={analysis.summary}
          currentTime={currentTime}
          duration={effectiveDuration}
          isPlaying={isPlaying}
          moments={moments}
          comments={topLevelComments}
          showComments={showComments}
          activeCommentId={activeCommentId}
          commentNavIndex={selectedCommentIndex}
          commentNavTotal={navigableComments.length}
          seekTo={(seconds) => seekTo(seconds, { play: true })}
          onScrollTimeChange={handleScrollTimeChange}
          onCommentsUpdated={refreshComments}
          onInlineComposeOpen={() => setShowComments(true)}
          onCommentSelect={handleCommentSelect}
          onCommentNavigate={navigateComment}
          onMomentClick={handleMomentSelect}
          chatScrollRequest={chatScrollRequest}
        />

        <FloatingSessionPlayer
          currentTime={currentTime}
          duration={effectiveDuration}
          isPlaying={isPlaying}
          moments={moments}
          comments={timestampedComments}
          commentCount={topLevelComments.length}
          showComments={showComments}
          activeComment={navigableComments[selectedCommentIndex] ?? null}
          selectedCommentId={selectedCommentId}
          playbackRate={playbackRate}
          selectedMomentIndex={selectedMomentIndex}
          transcript={transcript}
          onToggleComments={toggleComments}
          onMomentNavigate={navigateMoment}
          onMomentSelect={handleMomentSelect}
          onPlaybackRate={cyclePlaybackRate}
          onSeek={seekTo}
          togglePlayback={togglePlayback}
        />
      </div>

      <SessionDetailSidebar
        sessionId={sessionId}
        analysis={analysis}
        tab={sidebarTab}
        onTabChange={setSidebarTab}
        currentTime={currentTime}
        comments={discussionComments}
        onCommentsUpdated={handleCommentsUpdated}
        onSeek={(seconds) => seekTo(seconds, { play: false })}
        onAiSeek={handleAiSeek}
        selectedCommentId={selectedCommentId}
        onCommentSelect={handleCommentSelect}
      />
    </div>
  );
}

function HiddenMedia({
  isVideo,
  mediaRef,
  src,
  duration,
  onError,
  onLoadedDuration,
  onPlayingChange,
  onTimeChange,
}: {
  isVideo: boolean;
  mediaRef: RefObject<HTMLVideoElement | HTMLAudioElement | null>;
  src: string;
  duration: number;
  onError: () => void;
  onLoadedDuration: (duration: number) => void;
  onPlayingChange: (isPlaying: boolean) => void;
  onTimeChange: (seconds: number) => void;
}) {
  const handleLoadedMetadata = (element: HTMLVideoElement | HTMLAudioElement) => {
    onLoadedDuration(Number.isFinite(element.duration) ? element.duration : 0);
  };

  if (isVideo) {
    return (
      <video
        ref={mediaRef as RefObject<HTMLVideoElement>}
        className={styles.hiddenMedia}
        playsInline
        src={src}
        onEnded={() => {
          onTimeChange(duration);
          onPlayingChange(false);
        }}
        onError={onError}
        onLoadedMetadata={(event) => handleLoadedMetadata(event.currentTarget)}
        onPause={() => onPlayingChange(false)}
        onPlay={() => onPlayingChange(true)}
        onTimeUpdate={(event) => onTimeChange(event.currentTarget.currentTime)}
      />
    );
  }

  return (
    <audio
      ref={mediaRef as RefObject<HTMLAudioElement>}
      className={styles.hiddenMedia}
      preload="metadata"
      src={src}
      onEnded={() => {
        onTimeChange(duration);
        onPlayingChange(false);
      }}
      onError={onError}
      onLoadedMetadata={(event) => handleLoadedMetadata(event.currentTarget)}
      onPause={() => onPlayingChange(false)}
      onPlay={() => onPlayingChange(true)}
      onTimeUpdate={(event) => onTimeChange(event.currentTarget.currentTime)}
    />
  );
}
