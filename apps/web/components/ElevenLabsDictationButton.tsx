"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Mic, Square } from "lucide-react";

import styles from "./ElevenLabsDictationButton.module.css";

type DictationStatus = "idle" | "recording" | "transcribing";

type Props = {
  disabled?: boolean;
  variant?: "chat" | "landing";
  onBeforeStart?: () => void | Promise<void>;
  onTranscript: (text: string) => void;
  onError?: (message: string | null) => void;
};

const MAX_DICTATION_MS = 60_000;

function preferredMimeType() {
  if (typeof MediaRecorder === "undefined") return "";
  return [
    "audio/webm;codecs=opus",
    "audio/mp4",
    "audio/webm",
  ].find((mimeType) => MediaRecorder.isTypeSupported(mimeType)) ?? "";
}

function extensionForMimeType(mimeType: string) {
  if (mimeType.includes("mp4")) return "m4a";
  if (mimeType.includes("ogg")) return "ogg";
  return "webm";
}

export function ElevenLabsDictationButton({
  disabled = false,
  variant = "chat",
  onBeforeStart,
  onTranscript,
  onError,
}: Props) {
  const [status, setStatus] = useState<DictationStatus>("idle");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const stopTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  const reportError = useCallback((message: string | null) => {
    onError?.(message);
  }, [onError]);

  const releaseMicrophone = useCallback(() => {
    if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
    stopTimerRef.current = undefined;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    mediaRecorderRef.current = null;
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
      const recorder = mediaRecorderRef.current;
      if (recorder?.state === "recording") recorder.stop();
      releaseMicrophone();
    };
  }, [releaseMicrophone]);

  const transcribe = useCallback(async (audio: Blob) => {
    if (audio.size === 0 || Date.now() - startedAtRef.current < 250) {
      reportError("Hold the microphone a little longer, then try again.");
      return;
    }

    setStatus("transcribing");
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const mimeType = audio.type || "audio/webm";
      const formData = new FormData();
      formData.append("file", audio, `dictation.${extensionForMimeType(mimeType)}`);
      const response = await fetch("/api/dictation", {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });
      const body = (await response.json().catch(() => null)) as {
        text?: string;
        error?: string;
      } | null;

      if (!response.ok || !body?.text?.trim()) {
        throw new Error(body?.error || "Dictation could not be transcribed.");
      }

      onTranscript(body.text.trim());
      reportError(null);
    } catch (error) {
      if (controller.signal.aborted) return;
      reportError(error instanceof Error ? error.message : "Dictation failed. Please try again.");
    } finally {
      abortRef.current = null;
      if (mountedRef.current) setStatus("idle");
    }
  }, [onTranscript, reportError]);

  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state !== "recording") return;
    recorder.stop();
  }, []);

  const startRecording = useCallback(async () => {
    if (disabled || status !== "idle") return;
    reportError(null);

    if (
      typeof navigator === "undefined"
      || !navigator.mediaDevices?.getUserMedia
      || typeof MediaRecorder === "undefined"
    ) {
      reportError("Voice dictation is not supported in this browser.");
      return;
    }

    try {
      await onBeforeStart?.();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = preferredMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);

      streamRef.current = stream;
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];
      startedAtRef.current = Date.now();

      recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      });
      recorder.addEventListener("stop", () => {
        const audio = new Blob(chunksRef.current, {
          type: recorder.mimeType || mimeType || "audio/webm",
        });
        chunksRef.current = [];
        releaseMicrophone();
        if (!mountedRef.current) return;
        void transcribe(audio);
      }, { once: true });

      recorder.start();
      setStatus("recording");
      stopTimerRef.current = setTimeout(stopRecording, MAX_DICTATION_MS);
    } catch (error) {
      releaseMicrophone();
      const permissionDenied =
        error instanceof DOMException
        && (error.name === "NotAllowedError" || error.name === "SecurityError");
      reportError(
        permissionDenied
          ? "Microphone access is needed for dictation."
          : "Could not start dictation. Please try again."
      );
      setStatus("idle");
    }
  }, [
    disabled,
    onBeforeStart,
    releaseMicrophone,
    reportError,
    status,
    stopRecording,
    transcribe,
  ]);

  const label =
    status === "recording"
      ? "Stop dictation"
      : status === "transcribing"
        ? "Transcribing dictation"
        : "Start dictation";

  return (
    <button
      type="button"
      className={[
        styles.button,
        variant === "landing" ? styles.landing : "",
        status === "recording" ? styles.recording : "",
      ].filter(Boolean).join(" ")}
      disabled={disabled || status === "transcribing"}
      aria-label={label}
      aria-pressed={status === "recording"}
      title={label}
      onClick={status === "recording" ? stopRecording : startRecording}
    >
      {status === "transcribing" ? (
        <Loader2 size={variant === "landing" ? 20 : 17} className={styles.spinner} aria-hidden />
      ) : status === "recording" ? (
        <Square size={variant === "landing" ? 17 : 14} fill="currentColor" aria-hidden />
      ) : (
        <Mic size={variant === "landing" ? 20 : 17} aria-hidden />
      )}
    </button>
  );
}
