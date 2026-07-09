import { Audio } from "expo-av";
import { useCallback, useEffect, useState } from "react";

import { getApiBaseUrl } from "@/config";

export function getRecordingPlaybackUrl(sessionId: string) {
  return `${getApiBaseUrl()}/api/sessions/${sessionId}/recording`;
}

export function useSessionPlayback(sessionId: string) {
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState(1);

  const playbackUrl = getRecordingPlaybackUrl(sessionId);

  useEffect(() => {
    let mounted = true;
    let loadedSound: Audio.Sound | undefined;

    void (async () => {
      try {
        await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
        const result = await Audio.Sound.createAsync(
          { uri: playbackUrl },
          { shouldPlay: false, progressUpdateIntervalMillis: 250 }
        );
        if (!mounted) {
          await result.sound.unloadAsync();
          return;
        }
        loadedSound = result.sound;
        setSound(result.sound);
        result.sound.setOnPlaybackStatusUpdate((status) => {
          if (!mounted || !status.isLoaded) return;
          setPosition(status.positionMillis / 1000);
          if (status.durationMillis) setDuration(status.durationMillis / 1000);
          setPlaying(status.isPlaying);
          if (status.didJustFinish) setPlaying(false);
        });
      } catch {
        // Audio unavailable for this session.
      }
    })();

    return () => {
      mounted = false;
      void loadedSound?.unloadAsync();
    };
  }, [playbackUrl]);

  const seekToSeconds = useCallback(
    async (seconds: number, shouldPlay = false) => {
      if (!sound) return;
      const next = Math.max(0, Math.min(duration || seconds, seconds));
      await sound.setPositionAsync(next * 1000);
      setPosition(next);
      if (shouldPlay) await sound.playAsync();
    },
    [duration, sound]
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

  const progressPercent = duration > 0 ? Math.min(100, (position / duration) * 100) : 0;

  return {
    ready: !!sound,
    playing,
    position,
    duration,
    speed,
    progressPercent,
    seekToSeconds,
    togglePlayback,
    changeSpeed,
  };
}
