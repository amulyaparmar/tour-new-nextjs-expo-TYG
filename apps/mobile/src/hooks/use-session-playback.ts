import { Audio } from "expo-av";
import { useCallback, useEffect, useState } from "react";

import { getRecordingSignedPlaybackUrl } from "@/api";
import {
  cacheRecordingFromUrl,
  resolveSessionPlaybackUri,
} from "@/session-audio-cache";

export type SessionPlaybackState = {
  ready: boolean;
  loading: boolean;
  error: string | null;
  playing: boolean;
  position: number;
  duration: number;
  speed: number;
  progressPercent: number;
  fromCache: boolean;
  seekToSeconds: (seconds: number, shouldPlay?: boolean) => Promise<void>;
  togglePlayback: () => Promise<void>;
  changeSpeed: () => Promise<void>;
  retry: () => void;
};

export function useSessionPlayback(sessionId: string): SessionPlaybackState {
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    let mounted = true;
    let loadedSound: Audio.Sound | undefined;

    void (async () => {
      setLoading(true);
      setError(null);
      setSound(null);
      setPlaying(false);
      setPosition(0);
      setDuration(0);
      setFromCache(false);

      try {
        await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
        let resolved = await resolveSessionPlaybackUri(sessionId);

        try {
          const result = await Audio.Sound.createAsync(
            { uri: resolved.uri },
            { shouldPlay: false, progressUpdateIntervalMillis: 250 },
          );
          if (!mounted) {
            await result.sound.unloadAsync();
            return;
          }
          loadedSound = result.sound;
          setSound(result.sound);
          setFromCache(resolved.fromCache);
        } catch {
          if (resolved.fromCache) throw new Error("Cached audio could not be loaded.");
          const refreshed = await getRecordingSignedPlaybackUrl(sessionId);
          resolved = { uri: refreshed.signedUrl, fromCache: false };
          void cacheRecordingFromUrl(sessionId, refreshed.signedUrl).catch(() => {});
          const result = await Audio.Sound.createAsync(
            { uri: resolved.uri },
            { shouldPlay: false, progressUpdateIntervalMillis: 250 },
          );
          if (!mounted) {
            await result.sound.unloadAsync();
            return;
          }
          loadedSound = result.sound;
          setSound(result.sound);
          setFromCache(false);
        }

        loadedSound.setOnPlaybackStatusUpdate((status) => {
          if (!mounted || !status.isLoaded) return;
          setPosition(status.positionMillis / 1000);
          if (status.durationMillis) setDuration(status.durationMillis / 1000);
          setPlaying(status.isPlaying);
          if (status.didJustFinish) setPlaying(false);
        });
      } catch (caught) {
        if (mounted) {
          setError(caught instanceof Error ? caught.message : "Audio is unavailable for this session.");
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
      void loadedSound?.unloadAsync();
    };
  }, [sessionId, retryToken]);

  const seekToSeconds = useCallback(
    async (seconds: number, shouldPlay = false) => {
      if (!sound) return;
      const next = Math.max(0, Math.min(duration || seconds, seconds));
      await sound.setPositionAsync(next * 1000);
      setPosition(next);
      if (shouldPlay) await sound.playAsync();
    },
    [duration, sound],
  );

  const togglePlayback = useCallback(async () => {
    if (!sound) return;
    if (playing) await sound.pauseAsync();
    else await sound.playAsync();
  }, [playing, sound]);

  const changeSpeed = useCallback(async () => {
    if (!sound) return;
    const next = speed === 1 ? 1.25 : speed === 1.25 ? 1.5 : speed === 1.5 ? 2 : 1;
    await sound.setRateAsync(next, true);
    setSpeed(next);
  }, [sound, speed]);

  const retry = useCallback(() => {
    setRetryToken((token) => token + 1);
  }, []);

  const progressPercent = duration > 0 ? Math.min(100, (position / duration) * 100) : 0;

  return {
    ready: !!sound,
    loading,
    error,
    playing,
    position,
    duration,
    speed,
    progressPercent,
    fromCache,
    seekToSeconds,
    togglePlayback,
    changeSpeed,
    retry,
  };
}
