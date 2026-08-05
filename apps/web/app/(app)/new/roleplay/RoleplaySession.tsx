// @ts-nocheck
"use client";

// Runs one roleplay web call against the base assistant with per-scenario
// assistantOverrides. Owns its own Vapi instance (unlike VapiButtonTYG) because
// we need: the Call object returned by vapi.start() (for its id), no start
// delay, and a 'message' handler feeding the live transcript.

import Vapi from "@vapi-ai/web";
import { ArrowLeft, Mic, Pause, PhoneOff, Play, Sparkle } from "lucide-react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { buildRoleplayInitObj } from "@/lib/roleplay/buildAssistantOverrides";
import {
  cleanLiveTranscriptText,
  mergeAssistantCaptionText,
  normalizeLiveTranscriptText,
} from "@/lib/roleplay/liveTranscript";
import {
  ensureScenarioWaypoints,
  WAYPOINT_COMPLETE_FUNCTION_NAME,
  waypointIdsFromVapiMessage,
} from "@/lib/roleplay/waypoints";
import { playWaypointDing } from "@/lib/roleplay/waypointDing";
import { LiveTranscript } from "./LiveTranscript";
import { WaypointCarousel } from "./WaypointCarousel";
import { ROLEPLAY_VOICES } from "./voices";

// Same public (web) key as components/Vapi.tsx.
const VAPI_PUBLIC_KEY =
  process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY ?? "b8125470-e12b-443d-9300-c7e0fd79eeab";

// Dev-only debugging aids, compiled out of production builds. (The Pause
// button itself is trainee-facing and always available; ROLEPLAY_DEBUG gates
// the raw event log, the long-timeout checkbox, the simulate-waypoint button,
// and the Copy-debug-log action.)
const ROLEPLAY_DEBUG = process.env.NODE_ENV !== "production";
const DEBUG_EVENT_CAP = 2000;

export const RoleplaySession = ({
  scenario,
  traineeName,
  onBack,
  onCallEnded, // (callId: string) => void
}) => {
  const vapiRef = useRef(null);
  const callIdRef = useRef(null);
  const endedFiredRef = useRef(false);
  const captureActiveRef = useRef(false);
  const linesRef = useRef([]); // turn-by-turn finals, read at call-end (state closure is stale)
  const callStartedAtRef = useRef(null); // monotonic clock used for live transcript timestamps
  const activeTurnTimingRef = useRef({ user: null, bot: null });
  const userSpeechWindowsRef = useRef({
    active: null,
    pending: [],
    sequence: 0,
    groupSequence: 0,
    activeGroup: null,
    activeGroupTurn: null,
  });
  const latestAssistantSpeechRef = useRef({ turnKey: null });
  const interruptedAssistantTurnsRef = useRef(new Set());
  const assistantCaptionSequenceRef = useRef(0);
  const initialProspectCaptionSeededRef = useRef(false);
  const recentAssistantTurnRef = useRef(null);
  const lastAcceptedUserFinalRef = useRef(null);
  // Span of the observed user partial-transcript stream for the current
  // utterance ({ start, end, lastAtMs }). Vapi's user VAD events proved
  // unreliable live (late start, early stop, missing restart, or absent), so
  // final acceptance and timing corroborate the VAD window with this span.
  const userPartialActivityRef = useRef(null);
  // Set when the user stops/leaves while vapi.start() is still in flight.
  // SDK v1.x race: stop() no-ops until the web call object exists, so a
  // stop during 'starting' would otherwise leave a headless live call with
  // the mic hot. We re-check this flag once start() resolves.
  const stopRequestedRef = useRef(false);
  // True only while a Daily/Vapi call is actually connected. Guards against
  // calling vapi.stop() a second time on an already-ended call, which makes
  // daily-js throw an async "reading 'producers'" error during teardown.
  const callLiveRef = useRef(false);

  const [status, setStatus] = useState("idle"); // idle | starting | live | ended
  const [assistantSpeaking, setAssistantSpeaking] = useState(false);
  const [volume, setVolume] = useState(0);
  // Local-mic level for the meter. The SDK's volume-level event observes the
  // REMOTE participant only, so the trainee's side comes from daily's
  // local-audio-level observer (same source as the mic gate). Sqrt-scaled for
  // display: raw speech amplitude is tiny (voiced threshold is 0.01).
  const [micVolume, setMicVolume] = useState(0);
  const [lines, setLines] = useState([]);
  const [partial, setPartial] = useState(null);
  const [elapsedS, setElapsedS] = useState(0);
  const [completedWaypointIds, setCompletedWaypointIds] = useState([]);
  // Waypoint ids the completion chime already played for this call. A ref (not
  // derived from state inside the updater) so StrictMode's duplicate handler
  // set and transport-level re-delivered tool-calls can't double-play it.
  const waypointDingPlayedRef = useRef(new Set());
  // Voiced intervals measured from the LOCAL microphone (daily's local audio
  // level observer). Every other signal — VAD, partials, finals, even Vapi's
  // own conversation record — is transcriber-derived and can agree on speech
  // that never happened; mic energy cannot be fabricated.
  const micVoicedRef = useRef({ intervals: [], samples: 0 });
  // Cross-effect-run dedupe state for Vapi events. MUST be a ref: with two
  // handler sets live (StrictMode + the SDK's broken no-arg
  // removeAllListeners), an effect-local buffer gives each set its own
  // dedupe and every duplicate passes.
  const recentEventsRef = useRef([]);
  // Dev-only: raw event ring buffer.
  const debugEventsRef = useRef([]);
  // Lets code outside the listener effect (startCall) write to the ring buffer.
  const logDebugEventRef = useRef(null);
  const debugEventSeqRef = useRef(0);
  const [debugPaused, setDebugPaused] = useState(false);
  const [debugLongTimeouts, setDebugLongTimeouts] = useState(ROLEPLAY_DEBUG);
  const waypoints = useMemo(() => ensureScenarioWaypoints(scenario), [scenario]);
  const validWaypointIds = useMemo(
    () => new Set(waypoints.map((waypoint) => waypoint.id)),
    [waypoints]
  );


  // Lazily create the Vapi client once.
  if (!vapiRef.current) {
    vapiRef.current = new Vapi(VAPI_PUBLIC_KEY);
  }

  useEffect(() => {
    const vapi = vapiRef.current;
    const elapsedNow = () =>
      callStartedAtRef.current !== null
        ? Math.round(((performance.now() - callStartedAtRef.current) / 1000) * 10) / 10
        : 0;
    // Records the raw event BEFORE any guard/filter runs, so discarded finals
    // and ignored events stay visible when debugging transient caption states.
    // Mirrored to console.debug under the "[roleplay-debug]" tag.
    const logDebugEvent = (type, payload) => {
      if (!ROLEPLAY_DEBUG) return;
      debugEventSeqRef.current += 1;
      const events = debugEventsRef.current;
      events.push({
        seq: debugEventSeqRef.current,
        t: elapsedNow(),
        at: new Date().toISOString(),
        type,
        payload: payload ?? null,
      });
      if (events.length > DEBUG_EVENT_CAP) {
        events.splice(0, events.length - DEBUG_EVENT_CAP);
      }
      console.debug("[roleplay-debug]", type, payload ?? "");
    };
    logDebugEventRef.current = logDebugEvent;
    // Root cause of the observed event doubling (confirmed by
    // listener-audit reporting 2 handler sets): StrictMode runs this effect
    // twice, and the SDK's no-arg removeAllListeners() is a silent no-op —
    // its wrapper forwards an explicit `undefined`, so the events polyfill
    // takes the per-event branch instead of remove-everything. This dedupe
    // (state shared across effect runs via ref) is the second line of
    // defense: drop identical events inside a 50ms window.
    const isDuplicateEvent = (kind, payload) => {
      let key;
      try {
        key = `${kind}:${JSON.stringify(payload ?? null)}`;
      } catch {
        return false;
      }
      const recentEvents = recentEventsRef.current;
      const now = performance.now();
      while (recentEvents.length && now - recentEvents[0].atMs > 50) {
        recentEvents.shift();
      }
      if (recentEvents.some((entry) => entry.key === key)) return true;
      recentEvents.push({ key, atMs: now });
      return false;
    };
    const speakerKey = (role) => {
      if (role === "user" || role === "customer" || role === "human") return "user";
      if (role === "assistant" || role === "bot" || role === "ai") return "bot";
      return null;
    };
    const beginTurn = (role, timestamp = elapsedNow()) => {
      const key = speakerKey(role);
      if (!key) return null;
      const existing = activeTurnTimingRef.current[key];
      if (!existing) {
        activeTurnTimingRef.current[key] = {
          start: timestamp,
          end: null,
        };
      }
      return activeTurnTimingRef.current[key];
    };
    const endTurn = (role, timestamp = elapsedNow()) => {
      const timing = beginTurn(role, timestamp);
      if (!timing) return null;
      timing.end = Math.max(timing.start, timestamp);
      return timing;
    };
    // Local-mic voice activity. Levels are 0..1; the observer ticks ~10x/sec.
    const MIC_VOICED_LEVEL = 0.01;
    const MIC_SAMPLE_SECONDS = 0.12;
    const MIC_BRIDGE_SECONDS = 0.35;
    const MIC_WARMUP_SAMPLES = 20;
    const noteMicLevel = (level) => {
      const mic = micVoicedRef.current;
      mic.samples += 1;
      if (!(Number(level) >= MIC_VOICED_LEVEL)) return;
      const end = elapsedNow();
      const start = Math.max(0, end - MIC_SAMPLE_SECONDS);
      const last = mic.intervals[mic.intervals.length - 1];
      if (last && start - last.end <= MIC_BRIDGE_SECONDS) {
        last.end = Math.max(last.end, end);
      } else {
        mic.intervals.push({ start, end });
      }
      if (mic.intervals.length > 600) {
        mic.intervals.splice(0, mic.intervals.length - 600);
      }
    };
    // Voiced seconds inside a span, or null while the observer is still cold
    // (never let a missing observer suppress real speech).
    const micVoicedSecondsBetween = (start, end) => {
      const mic = micVoicedRef.current;
      if (mic.samples < MIC_WARMUP_SAMPLES) return null;
      return mic.intervals.reduce((total, interval) => {
        const overlap = Math.min(interval.end, end) - Math.max(interval.start, start);
        return overlap > 0 ? total + overlap : total;
      }, 0);
    };
    const USER_SPEECH_WINDOW_TTL_MS = 12_000;
    // Max silence between consecutive user finals that still counts as one
    // conversational turn (Deepgram endpoints long answers mid-sentence).
    const USER_FINAL_MERGE_GAP_S = 10;
    const pruneUserSpeechWindows = (now = performance.now()) => {
      const windows = userSpeechWindowsRef.current;
      windows.pending = windows.pending.filter(
        (window) => now - Number(window.closedAtMs ?? window.startedAtMs) <=
          USER_SPEECH_WINDOW_TTL_MS
      );
      if (
        windows.active &&
        now - Number(windows.active.startedAtMs) > 60_000
      ) {
        windows.active = null;
      }
      if (
        !windows.active &&
        windows.activeGroup !== null &&
        !windows.pending.some((window) => window.groupId === windows.activeGroup)
      ) {
        windows.activeGroup = null;
        windows.activeGroupTurn = null;
      }
    };
    const startUserSpeechWindow = (timestamp, turn) => {
      const windows = userSpeechWindowsRef.current;
      const now = performance.now();
      pruneUserSpeechWindows(now);
      const turnKey =
        turn === null || turn === undefined ? null : String(turn);

      if (windows.active) {
        if (turnKey !== null && !windows.active.turnAliases?.includes(turnKey)) {
          windows.active.turnAliases = [
            ...(windows.active.turnAliases ?? []),
            turnKey,
          ];
        }
        return windows.active;
      }

      // Vapi's VAD can restart with a different/empty turn id after a short
      // pause. Until the prospect begins speaking, it is still one agent turn.
      const canContinueGroup = windows.activeGroup !== null;
      if (!canContinueGroup) {
        windows.groupSequence += 1;
        windows.activeGroup = windows.groupSequence;
        windows.activeGroupTurn = turnKey;
      } else if (windows.activeGroupTurn === null && turnKey !== null) {
        windows.activeGroupTurn = turnKey;
      }

      windows.sequence += 1;
      windows.active = {
        id: windows.sequence,
        groupId: windows.activeGroup,
        turn,
        turnAliases: turnKey === null ? [] : [turnKey],
        start: timestamp,
        end: null,
        startedAtMs: now,
        closedAtMs: null,
      };
      return windows.active;
    };
    const stopUserSpeechWindow = (timestamp, turn) => {
      const windows = userSpeechWindowsRef.current;
      const active = windows.active;
      if (!active) return;
      const stopTurn =
        turn === null || turn === undefined ? null : String(turn);
      if (stopTurn !== null && !active.turnAliases?.includes(stopTurn)) {
        active.turnAliases = [...(active.turnAliases ?? []), stopTurn];
      }
      active.end = Math.max(active.start, timestamp);
      active.closedAtMs = performance.now();
      windows.pending.push(active);
      windows.active = null;
      pruneUserSpeechWindows();
    };
    const closeUserSpeechGroup = (timestamp) => {
      const windows = userSpeechWindowsRef.current;
      if (windows.active) {
        windows.active.end = Math.max(windows.active.start, timestamp);
        windows.active.closedAtMs = performance.now();
        windows.pending.push(windows.active);
        windows.active = null;
      }
      windows.activeGroup = null;
      windows.activeGroupTurn = null;
      pruneUserSpeechWindows();
    };
    const takeUserSpeechWindow = (
      eventTurn,
      timestamp,
      now = performance.now()
    ) => {
      const windows = userSpeechWindowsRef.current;
      pruneUserSpeechWindows(now);
      const candidates = [
        ...windows.pending,
        ...(windows.active ? [windows.active] : []),
      ];
      if (!candidates.length) return null;

      const turnKey =
        eventTurn === null || eventTurn === undefined
          ? null
          : String(eventTurn);
      const turnMatches =
        turnKey === null
          ? []
          : candidates.filter(
              (window) =>
                (window.turn !== null &&
                  window.turn !== undefined &&
                  String(window.turn) === turnKey) ||
                window.turnAliases?.includes(turnKey)
            );
      const turnMatch = turnMatches[turnMatches.length - 1] ?? null;
      // Transcript finals do not reliably include turn ids. In that case,
      // correlate with the newest speech group and discard older unmatched
      // permits as stale VAD/noise instead of letting a future final claim one.
      const target = turnMatch ?? candidates[candidates.length - 1];
      const matched = candidates.filter(
        (window) => window.groupId === target.groupId
      );
      const matchedIds = new Set(matched.map((window) => window.id));
      const staleIds = new Set(
        turnMatch
          ? []
          : candidates
              .filter(
                (window) =>
                  window.groupId !== target.groupId &&
                  Number(window.start) <= Number(target.start)
              )
              .map((window) => window.id)
      );

      windows.pending = windows.pending.filter(
        (window) => !matchedIds.has(window.id) && !staleIds.has(window.id)
      );
      if (windows.active && matchedIds.has(windows.active.id)) {
        windows.active = null;
      }
      if (windows.activeGroup === target.groupId) {
        windows.activeGroup = null;
        windows.activeGroupTurn = null;
      }

      // One finalized transcript can span several VAD windows separated by a
      // filler-word pause. Aggregate every segment in that user turn and merge
      // overlaps so the duration reflects voiced time without leaving stale
      // windows for a later phantom final to consume.
      const segments = matched
        .map((window) => ({
          start: Number(window.start),
          end: Math.max(Number(window.start), Number(window.end ?? timestamp)),
        }))
        .filter(
          (segment) =>
            Number.isFinite(segment.start) && Number.isFinite(segment.end)
        )
        .sort((a, b) => a.start - b.start);
      if (!segments.length) return null;

      const mergedSegments = [];
      segments.forEach((segment) => {
        const previous = mergedSegments[mergedSegments.length - 1];
        if (previous && segment.start <= previous.end + 0.05) {
          previous.end = Math.max(previous.end, segment.end);
        } else {
          mergedSegments.push({ ...segment });
        }
      });

      const start = mergedSegments[0].start;
      const end = mergedSegments[mergedSegments.length - 1].end;
      const duration =
        Math.round(
          mergedSegments.reduce(
            (total, segment) => total + Math.max(0, segment.end - segment.start),
            0
          ) * 10
        ) / 10;
      return {
        groupId: target.groupId,
        turn: target.turn,
        start,
        end,
        duration,
      };
    };
    const peekUserSpeechWindow = (now = performance.now()) => {
      pruneUserSpeechWindows(now);
      const windows = userSpeechWindowsRef.current;
      return windows.active ?? windows.pending[windows.pending.length - 1] ?? null;
    };
    const assistantTimingMatchesTurn = (timing, reportedTurn) => {
      if (!timing || reportedTurn === null || reportedTurn === undefined) {
        return false;
      }
      const alias = String(reportedTurn);
      return (
        timing.captionTurnKey === `turn:${alias}` ||
        timing.turnAliases?.has(alias)
      );
    };
    const addAssistantTurnAliases = (timing, ...values) => {
      if (!timing) return;
      const aliases = values.filter(
        (value) => value !== null && value !== undefined
      );
      if (!aliases.length) return;
      timing.turnAliases ??= new Set();
      aliases.forEach((value) => timing.turnAliases.add(String(value)));
    };
    const upsertAssistantCaption = (
      rawText,
      {
        timestamp = elapsedNow(),
        reportedTurn,
        timingSource = "live",
        acoustic = false,
        deferCreate = false,
      } = {}
    ) => {
      const text = cleanLiveTranscriptText(rawText);
      if (!text) return null;

      let timing = beginTurn("bot", timestamp);
      if (!timing) return null;

      // A generic audible-speech event can arrive just before Vapi's richer
      // assistant.speechStarted payload. Keep both on the same caption turn so
      // the known firstMessage fallback is replaced/merged instead of doubled.
      let turnKey = timing.captionTurnKey;
      if (
        !turnKey &&
        scenario.speaksFirst !== "agent" &&
        initialProspectCaptionSeededRef.current
      ) {
        const incoming = normalizeLiveTranscriptText(text);
        const configuredOpening = normalizeLiveTranscriptText(
          scenario.firstMessage
        );
        const openingLine = linesRef.current.find((line) => {
          if (speakerKey(line?.role) !== "bot" || !line?.assistantCaptionTurn) {
            return false;
          }
          const existing = normalizeLiveTranscriptText(line.text);
          return (
            existing === configuredOpening &&
            (existing === incoming ||
              existing.startsWith(incoming) ||
              incoming.startsWith(existing))
          );
        });
        if (openingLine) {
          turnKey = openingLine.assistantCaptionTurn;
          timing.start = Math.min(timing.start, Number(openingLine.time) || 0);
        }
      }
      if (!turnKey) {
        if (reportedTurn === null || reportedTurn === undefined) {
          if (!timing.fallbackCaptionTurnKey) {
            assistantCaptionSequenceRef.current += 1;
            timing.fallbackCaptionTurnKey =
              `playback:${assistantCaptionSequenceRef.current}`;
          }
          turnKey = timing.fallbackCaptionTurnKey;
        } else {
          turnKey = `turn:${String(reportedTurn)}`;
        }
      }

      // Native Vapi voices can stop/start TTS between chunks of one semantic
      // response. The internal `turn` changes, while `turnId` remains stable.
      // Reattach a continuation to its original audio/caption window so its
      // start time and accumulated text are preserved. ASR transcripts carry
      // NO turn ids, so a chunk boundary (speech-end + near-instant
      // speech-start) is only recognizable by timing: without turn info,
      // treat a short gap as the same semantic response — the cumulative ASR
      // stream otherwise re-renders already-shown words into a new bubble.
      const recentTiming = recentAssistantTurnRef.current;
      const recentFinishedAgoMs = recentTiming
        ? performance.now() - Number(recentTiming.finishedAtMs)
        : Infinity;
      const reattachByTurn =
        (recentTiming?.captionTurnKey === turnKey ||
          assistantTimingMatchesTurn(recentTiming, reportedTurn)) &&
        recentFinishedAgoMs <= 500;
      const reattachByTiming =
        (reportedTurn === null || reportedTurn === undefined) &&
        !!recentTiming?.captionTurnKey &&
        recentFinishedAgoMs <= 1500;
      if (
        !timing.captionTurnKey &&
        (reattachByTurn || reattachByTiming) &&
        !interruptedAssistantTurnsRef.current.has(
          recentTiming?.captionTurnKey ?? turnKey
        ) &&
        !interruptedAssistantTurnsRef.current.has(turnKey)
      ) {
        recentTiming.end = null;
        recentTiming.finishedAtMs = null;
        activeTurnTimingRef.current.bot = recentTiming;
        recentAssistantTurnRef.current = null;
        timing = recentTiming;
        // The continuation adopts the previous chunk's caption identity.
        // Keeping the freshly resolved key would orphan the existing bubble
        // and spawn a duplicate line backdated to the same start time.
        turnKey = timing.captionTurnKey ?? turnKey;
      }
      // Native voices can announce words in assistant.speechStarted that have
      // NOT been spoken yet (observed live: the response's FINAL chunk's text
      // delivered at playback start). A deferred caller never renders such
      // text — it is stashed on the turn timing, and finishAssistantTurn
      // materializes it only if the turn ends with no acoustic caption.
      if (deferCreate) {
        timing.deferredFallbackText = mergeAssistantCaptionText(
          timing.deferredFallbackText,
          text
        );
        if (reportedTurn !== null && reportedTurn !== undefined) {
          timing.turnAliases ??= new Set();
          timing.turnAliases.add(String(reportedTurn));
        }
        return timing;
      }
      timing.captionTurnKey = turnKey;
      if (reportedTurn !== null && reportedTurn !== undefined) {
        timing.turnAliases ??= new Set();
        timing.turnAliases.add(String(reportedTurn));
      }

      // An interrupted turn must not accept more model/TTS fallback text, but
      // its assistant-role ASR is still authoritative evidence of audio that
      // was actually played before the barge-in.
      if (!acoustic && interruptedAssistantTurnsRef.current.has(turnKey)) {
        return timing;
      }
      // Once acoustic ASR has begun, it is the source of truth for this bubble.
      // A late text-only TTS chunk must not append generated wording to it.
      if (!acoustic && timing.hasAcousticCaption) return timing;

      const startTime = Math.min(timing.start, timestamp);
      latestAssistantSpeechRef.current = { turnKey };
      if (
        scenario.speaksFirst !== "agent" &&
        !linesRef.current.some((line) => speakerKey(line?.role) === "bot")
      ) {
        initialProspectCaptionSeededRef.current = true;
      }

      setPartial((current) =>
        speakerKey(current?.role) === "bot" ? null : current
      );
      setLines((previous) => {
        let next = previous;
        const existingIndex = next.findIndex(
          (line) => line.assistantCaptionTurn === turnKey
        );

        if (existingIndex >= 0) {
          const mergedText = mergeAssistantCaptionText(
            next[existingIndex].text,
            text
          );
          if (mergedText !== next[existingIndex].text) {
            next = next.map((line, index) =>
              index === existingIndex ? { ...line, text: mergedText } : line
            );
          }
        } else {
          next = [
            ...next,
            {
              role: "assistant",
              text,
              time: startTime,
              endTime: startTime,
              duration: 0,
              timingSource,
              assistantCaptionTurn: turnKey,
              // End/duration are placeholders until finishAssistantTurn stamps
              // them; the transcript renders start-only while this is set.
              live: true,
            },
          ];
        }

        linesRef.current = next;
        return next;
      });
      return timing;
    };
    const replaceAssistantCaptionText = (turnKey, rawText) => {
      const text = cleanLiveTranscriptText(rawText);
      if (!turnKey || !text) return;
      setLines((previous) => {
        const next = previous.map((line) =>
          line.assistantCaptionTurn === turnKey
            ? { ...line, text }
            : line
        );
        linesRef.current = next;
        return next;
      });
    };
    const acceptAssistantTranscript = (
      rawText,
      { transcriptType, timestamp, reportedTurn } = {}
    ) => {
      const text = cleanLiveTranscriptText(rawText);
      if (!text) return;

      const now = performance.now();
      let timing = activeTurnTimingRef.current.bot;
      const recentTiming = recentAssistantTurnRef.current;
      if (
        !timing &&
        recentTiming &&
        now - Number(recentTiming.finishedAtMs) <= 4_000 &&
        (reportedTurn === null ||
          reportedTurn === undefined ||
          assistantTimingMatchesTurn(recentTiming, reportedTurn))
      ) {
        // Audio transcribers can hallucinate a provisional word in the quiet
        // after playback (observed as stray "Yes." / "Okay." captions). Keep
        // the settle window for legitimate late committed tails, but never
        // promote a post-speech partial that may not become final.
        if (transcriptType !== "final") return;
        timing = recentTiming;
      }
      // Assistant transcript events are accepted only inside (or immediately
      // after) an observed remote-audio turn. This keeps acoustic captions but
      // rejects model text for a response that was generated and never played.
      if (!timing) return;

      if (!timing.captionTurnKey && timing === activeTurnTimingRef.current.bot) {
        const resolvedTiming = upsertAssistantCaption(text, {
          timestamp,
          reportedTurn,
          timingSource: "vapi",
          acoustic: true,
        });
        timing = resolvedTiming ?? timing;
      } else if (reportedTurn !== null && reportedTurn !== undefined) {
        timing.turnAliases ??= new Set();
        timing.turnAliases.add(String(reportedTurn));
      }
      const turnKey = timing.captionTurnKey;
      if (!turnKey) return;
      timing.hasAcousticCaption = true;

      if (transcriptType === "final") {
        timing.committedCaptionText = mergeAssistantCaptionText(
          timing.committedCaptionText,
          text
        );
        timing.partialCaptionText = "";
      } else {
        timing.partialCaptionText = text;
      }

      const displayedText = mergeAssistantCaptionText(
        timing.committedCaptionText,
        timing.partialCaptionText
      );
      replaceAssistantCaptionText(turnKey, displayedText || text);
    };
    const finishAssistantTurn = (timestamp = elapsedNow()) => {
      if (!activeTurnTimingRef.current.bot) return;
      const timing = endTurn("bot", timestamp);
      // A turn that produced no acoustic caption still deserves a bubble:
      // the deferred speechStarted text has been fully played by now — unless
      // a barge-in cut the turn short, in which case most of it never aired.
      if (
        timing &&
        !timing.captionTurnKey &&
        timing.deferredFallbackText &&
        !timing.interrupted
      ) {
        upsertAssistantCaption(timing.deferredFallbackText, {
          timestamp: timing.start,
          timingSource: "live",
        });
      }
      const turnKey = timing?.captionTurnKey;
      if (turnKey) {
        const endTime = Math.max(timing.start, timing.end ?? timestamp);
        const duration = Math.round(Math.max(0, endTime - timing.start) * 10) / 10;
        setLines((previous) => {
          const next = previous.map((line) =>
            line.assistantCaptionTurn === turnKey
              ? { ...line, endTime, duration, live: false }
              : line
          );
          linesRef.current = next;
          return next;
        });
      }
      timing.finishedAtMs = performance.now();
      recentAssistantTurnRef.current = timing;
      activeTurnTimingRef.current.bot = null;
    };

    // Registration must be idempotent. NOTE: vapi.removeAllListeners() with
    // no argument is broken in @vapi-ai/web v1 — the wrapper forwards
    // `event === undefined` explicitly, defeating the events polyfill's
    // arguments.length check, so it removes NOTHING. Remove per event.
    const VAPI_EVENTS = [
      "call-start",
      "call-end",
      "speech-start",
      "speech-end",
      "volume-level",
      "message",
      "error",
    ];
    const clearVapiListeners = () =>
      VAPI_EVENTS.forEach((eventName) => vapi.removeAllListeners(eventName));
    clearVapiListeners();

    // Root-cause instrumentation for the observed event doubling: how many
    // handler sets are registered at OUR layer, and whether daily's transport
    // itself delivers an app-message twice. One of these must show it.
    let dailyProbeAttached = false;
    let lastDailyProbe = { key: "", atMs: 0 };
    vapi.on("call-start", () => {
      if (isDuplicateEvent("call-start")) return;
      logDebugEvent("call-start");
      logDebugEvent("listener-audit", {
        message: vapi.listenerCount?.("message") ?? null,
        speechStart: vapi.listenerCount?.("speech-start") ?? null,
        callStart: vapi.listenerCount?.("call-start") ?? null,
      });
      // The SDK's own volume-level/speech-start events observe the REMOTE
      // participant (the AI), so the local mic must be observed directly.
      try {
        vapi.call?.startLocalAudioLevelObserver?.(100);
        vapi.call?.on?.("local-audio-level", (e) => {
          noteMicLevel(e?.audioLevel);
          setMicVolume(
            Math.min(1, Math.sqrt(Math.max(0, Number(e?.audioLevel) || 0)) * 2)
          );
        });
      } catch (e) {
        console.warn("local audio level observer unavailable:", e);
      }
      if (ROLEPLAY_DEBUG && !dailyProbeAttached) {
        try {
          vapi.call?.on?.("app-message", (e) => {
            let key;
            try {
              key =
                typeof e?.data === "string"
                  ? e.data
                  : JSON.stringify(e?.data ?? null);
            } catch {
              return;
            }
            const now = performance.now();
            if (key === lastDailyProbe.key && now - lastDailyProbe.atMs < 50) {
              logDebugEvent("daily-duplicate-delivery", {
                sample: String(key).slice(0, 120),
              });
            }
            lastDailyProbe = { key, atMs: now };
          });
          dailyProbeAttached = true;
        } catch {}
      }
      callLiveRef.current = true;
      callStartedAtRef.current ??= performance.now();
      setStatus("live");
      toast.success(
        scenario.speaksFirst === "agent"
          ? "Call connected — answer with your property greeting!"
          : "Call started — you're the agent, just start talking!"
      );
    });

    vapi.on("call-end", () => {
      if (isDuplicateEvent("call-end")) return;
      logDebugEvent("call-end");
      dailyProbeAttached = false; // next call gets a fresh daily call object
      callLiveRef.current = false;
      captureActiveRef.current = false;
      setPartial(null);
      setAssistantSpeaking(false);
      setDebugPaused(false);
      // A call can die mid-turn: settle any still-live lines synchronously so
      // the transcript handed to the scorecard carries no in-progress markers.
      if (linesRef.current.some((line) => line.live)) {
        const finalizedLines = linesRef.current.map((line) =>
          line.live ? { ...line, live: false } : line
        );
        linesRef.current = finalizedLines;
        setLines(finalizedLines);
      }
      if (!endedFiredRef.current && callIdRef.current) {
        // Normal path: hand off to the scorecard with the live turn-by-turn
        // transcript (Vapi's post-call artifact merges turns into blobs).
        endedFiredRef.current = true;
        setStatus("ended");
        onCallEnded(callIdRef.current, linesRef.current);
      } else if (!callIdRef.current) {
        // Call died before we ever got its id (e.g. cancelled during connect)
        // — there is no scorecard to prepare, so return to idle.
        setStatus("idle");
      } else {
        setStatus("ended");
      }
    });

    vapi.on("speech-start", () => {
      if (isDuplicateEvent("speech-start")) return;
      logDebugEvent("speech-start");
      if (!captureActiveRef.current || endedFiredRef.current) return;
      callStartedAtRef.current ??= performance.now();
      const timestamp = elapsedNow();
      closeUserSpeechGroup(timestamp);
      beginTurn("bot", timestamp);
      setAssistantSpeaking(true);

      // Static firstMessage playback is audible but Vapi does not consistently
      // send assistant.speechStarted for it. Stash the configured opener as
      // this turn's deferred fallback — never rendered ahead of the audio; the
      // visible caption is built from ASR as the words are actually heard, and
      // the stash only materializes if the turn ends with no acoustic text.
      if (
        scenario.speaksFirst !== "agent" &&
        !initialProspectCaptionSeededRef.current
      ) {
        initialProspectCaptionSeededRef.current = true;
        upsertAssistantCaption(scenario.firstMessage, {
          timestamp,
          timingSource: "live",
          deferCreate: true,
        });
      }
    });
    vapi.on("speech-end", () => {
      if (isDuplicateEvent("speech-end")) return;
      logDebugEvent("speech-end");
      if (!captureActiveRef.current || endedFiredRef.current) return;
      finishAssistantTurn();
      setAssistantSpeaking(false);
    });
    vapi.on("volume-level", (v) => setVolume(v));

    vapi.on("message", (m) => {
      if (isDuplicateEvent("message", m)) return;
      logDebugEvent(m?.type ?? "message", m);
      if (m?.type === "tool-calls" || m?.type === "function-call") {
        const completedIds = waypointIdsFromVapiMessage(m).filter((id) =>
          validWaypointIds.has(id)
        );
        if (completedIds.length) {
          setCompletedWaypointIds((previous) =>
            Array.from(new Set([...previous, ...completedIds]))
          );
          const fresh = completedIds.filter(
            (id) => !waypointDingPlayedRef.current.has(id)
          );
          if (fresh.length) {
            fresh.forEach((id) => waypointDingPlayedRef.current.add(id));
            logDebugEvent("waypoint-complete", { waypointIds: fresh });
            playWaypointDing();
          }
        }
        return;
      }
      if (m?.type === "speech-update") {
        if (!captureActiveRef.current || endedFiredRef.current) return;
        const status = String(m?.status ?? "").toLowerCase();
        const key = speakerKey(m?.role);
        if (!key) return;
        if (/start/.test(status)) {
          if (key === "user") {
            startUserSpeechWindow(elapsedNow(), m?.turnId ?? m?.turn);
          } else {
            closeUserSpeechGroup(elapsedNow());
            const timing = beginTurn("bot");
            addAssistantTurnAliases(timing, m?.turnId, m?.turn);
            setAssistantSpeaking(true);
          }
        }
        if (/stop|end/.test(status)) {
          if (key === "bot") {
            addAssistantTurnAliases(
              activeTurnTimingRef.current.bot,
              m?.turnId,
              m?.turn
            );
            finishAssistantTurn();
            setAssistantSpeaking(false);
          } else {
            stopUserSpeechWindow(elapsedNow(), m?.turnId ?? m?.turn);
          }
        }
        return;
      }

      if (m?.type === "user-interrupted") {
        if (!captureActiveRef.current || endedFiredRef.current) return;
        const reportedTurns = [m?.turnId, m?.turn].filter(
          (value) => value !== null && value !== undefined
        );
        reportedTurns.forEach((value) =>
          interruptedAssistantTurnsRef.current.add(`turn:${String(value)}`)
        );
        const candidateTimings = [
          activeTurnTimingRef.current.bot,
          recentAssistantTurnRef.current,
        ].filter(Boolean);
        const matchedTiming = reportedTurns.length
          ? candidateTimings.find((timing) =>
              reportedTurns.some((value) =>
                assistantTimingMatchesTurn(timing, value)
              )
            )
          : candidateTimings[0];
        // A turn cut off before any caption existed carries only deferred
        // speechStarted text — words the barge-in guaranteed were NOT spoken.
        // Flag the timing itself so finishAssistantTurn won't materialize it.
        if (matchedTiming) matchedTiming.interrupted = true;
        const interruptedTurnKey =
          matchedTiming?.captionTurnKey ??
          (matchedTiming || reportedTurns.length
            ? null
            : latestAssistantSpeechRef.current.turnKey);
        if (interruptedTurnKey) {
          interruptedAssistantTurnsRef.current.add(interruptedTurnKey);
        }
        return;
      }

      // assistant.speechStarted proves that a TTS chunk entered playback, but
      // some native voices expose only the latest chunk's words here. Use it as
      // a playback-gated fallback; assistant audio transcripts below reconcile
      // the complete wording that was actually heard.
      if (m?.type === "assistant.speechStarted") {
        if (!captureActiveRef.current || endedFiredRef.current) return;
        callStartedAtRef.current ??= performance.now();
        const text = cleanLiveTranscriptText(m?.text);
        if (!text) return;

        const reportedSeconds =
          m?.secondsFromStart === null ||
          m?.secondsFromStart === undefined ||
          m?.secondsFromStart === ""
            ? NaN
            : Number(m.secondsFromStart);
        const timestamp = Number.isFinite(reportedSeconds)
          ? Math.max(0, Math.round(reportedSeconds * 10) / 10)
          : elapsedNow();
        const reportedTurn = m?.turnId ?? m?.turn;
        upsertAssistantCaption(text, {
          timestamp,
          reportedTurn,
          timingSource: Number.isFinite(reportedSeconds) ? "vapi" : "live",
          deferCreate: true,
        });
        return;
      }

      const isFinalOnlyTranscript =
        m?.type === 'transcript[transcriptType="final"]';
      if (m?.type !== "transcript" && !isFinalOnlyTranscript) return;
      if (!captureActiveRef.current || endedFiredRef.current) return;

      const transcriptSpeaker = speakerKey(m?.role);
      if (!transcriptSpeaker) return;

      const text = cleanLiveTranscriptText(m?.transcript);
      if (!text) return;
      const reportedSeconds =
        m?.secondsFromStart === null ||
        m?.secondsFromStart === undefined ||
        m?.secondsFromStart === ""
          ? NaN
          : Number(m.secondsFromStart);
      const elapsedSeconds = Number.isFinite(reportedSeconds)
        ? Math.max(0, reportedSeconds)
        : callStartedAtRef.current !== null
          ? Math.max(0, (performance.now() - callStartedAtRef.current) / 1000)
          : 0;
      const timestamp = Math.round(elapsedSeconds * 10) / 10;
      const transcriptType = isFinalOnlyTranscript ? "final" : m.transcriptType;
      // `turn` can increment between TTS chunks; `turnId` stays stable for the
      // semantic response and therefore makes the safer caption correlation id.
      const eventTurn = m?.turnId ?? m?.turn;

      if (transcriptSpeaker === "bot") {
        acceptAssistantTranscript(text, {
          transcriptType,
          timestamp,
          reportedTurn: eventTurn,
        });
        return;
      }

      if (transcriptType === "final") {
        const normalizedText = normalizeLiveTranscriptText(text);
        const receivedAt = performance.now();
        const previousFinal = lastAcceptedUserFinalRef.current;
        const bothHaveTurn =
          eventTurn !== null &&
          eventTurn !== undefined &&
          previousFinal?.turn !== null &&
          previousFinal?.turn !== undefined;
        const sameTurn =
          bothHaveTurn && String(eventTurn) === String(previousFinal.turn);
        const sameTurnDuplicate =
          sameTurn && previousFinal?.text === normalizedText;
        const sameTimedFinal =
          !bothHaveTurn &&
          previousFinal?.text === normalizedText &&
          ((Number.isFinite(reportedSeconds) &&
            Number.isFinite(previousFinal.reportedSeconds) &&
            Math.abs(reportedSeconds - previousFinal.reportedSeconds) < 0.25) ||
            receivedAt - previousFinal.receivedAt < 500);
        if (sameTurnDuplicate || sameTimedFinal) return;

        // Consume the complete assistant-bounded user group. A single final can
        // span several VAD fragments around pauses/fillers; leaving fragments
        // behind lets a later ASR revision create a phantom extra user line.
        const speechWindow = takeUserSpeechWindow(
          eventTurn,
          timestamp,
          receivedAt
        );
        // Vapi's user VAD is unreliable (observed live: started after the
        // first partials, stopped 1.9s into a 13s utterance with no restart,
        // or never fired — which silently dropped a real turn). The partial
        // stream is a second witness: accept a final backed by either.
        //
        // But the transcriber also hallucinates a lone backchannel word in
        // the quiet after a turn ("Yeah." / "Okay." / "Yes.") with NO VAD
        // window, then commits it as a final seconds later. Real speech
        // leaves either a VAD window or a partial stream that SPANS time
        // and commits promptly; a phantom leaves a single instantaneous
        // partial that goes stale first. Require one of those signatures.
        const activity = userPartialActivityRef.current;
        const activityFresh =
          activity && receivedAt - activity.lastAtMs <= USER_SPEECH_WINDOW_TTL_MS;
        const activityCredible =
          activityFresh &&
          (activity.end - activity.start >= 0.4 ||
            receivedAt - activity.lastAtMs <= 2_000);

        const boundsStart = Math.min(
          speechWindow ? Number(speechWindow.start) : Infinity,
          activityCredible ? activity.start : Infinity
        );
        const boundsEnd = Math.max(
          speechWindow ? Number(speechWindow.end ?? timestamp) : -Infinity,
          activityCredible ? activity.end : -Infinity
        );
        const startTime = Number.isFinite(boundsStart) ? boundsStart : timestamp;
        const endTime = Math.max(
          startTime,
          Number.isFinite(boundsEnd) ? boundsEnd : timestamp
        );

        // Final arbiter: the local microphone. The transcriber has been
        // observed inventing a complete, confident sentence out of silence
        // ("No, he doesn't.") and committing it as a FINAL — it reached the
        // LLM and Vapi's own conversation record, so every Vapi-derived
        // signal agreed with it. If the trainee's mic was silent across the
        // span, those words were not spoken, whoever claims otherwise.
        const spanSeconds = Math.max(0, endTime - startTime);
        const micVoicedSeconds = micVoicedSecondsBetween(
          startTime - 0.5,
          endTime + 0.5
        );
        const micRequiredSeconds = Math.max(0.2, 0.25 * spanSeconds);
        const micSaysSilent =
          micVoicedSeconds !== null && micVoicedSeconds < micRequiredSeconds;

        if ((!speechWindow && !activityCredible) || micSaysSilent) {
          logDebugEvent("user-final-rejected", {
            text,
            reason: micSaysSilent
              ? "microphone-silent"
              : activityFresh
                ? "instantaneous-stale-partial"
                : "no-witness",
            spanSeconds: Math.round(spanSeconds * 100) / 100,
            micVoicedSeconds:
              micVoicedSeconds === null
                ? null
                : Math.round(micVoicedSeconds * 100) / 100,
            micRequiredSeconds: Math.round(micRequiredSeconds * 100) / 100,
            partialAgeMs: activityFresh
              ? Math.round(receivedAt - activity.lastAtMs)
              : null,
          });
          setPartial(null);
          return;
        }
        userPartialActivityRef.current = null;
        lastAcceptedUserFinalRef.current = {
          turn: eventTurn,
          text: normalizedText,
          reportedSeconds,
          receivedAt,
        };

        setPartial(null);
        const spanDuration = Math.round(spanSeconds * 10) / 10;
        // VAD voiced-time is only trustworthy when its window plausibly covers
        // the utterance; a window that saw a fraction of the span missed most
        // of the speech, so report the span instead.
        const windowDuration = Number(speechWindow?.duration);
        const duration =
          Number.isFinite(windowDuration) &&
          spanDuration > 0 &&
          windowDuration / spanDuration >= 0.7
            ? windowDuration
            : spanDuration;
        setLines((prev) => {
          // Deepgram can endpoint one continuous answer into several finals
          // (observed: a mid-sentence split with the rest arriving 2s later).
          // If the last line is still the trainee's — the AI never responded
          // in between — consecutive finals are one conversational turn.
          const last = prev[prev.length - 1];
          const gap = last ? startTime - Number(last.endTime ?? NaN) : NaN;
          const mergeIntoLast =
            last &&
            speakerKey(last.role) === "user" &&
            Number.isFinite(gap) &&
            gap >= -1 &&
            gap <= USER_FINAL_MERGE_GAP_S;
          const next = mergeIntoLast
            ? prev.map((line, index) =>
                index === prev.length - 1
                  ? {
                      ...line,
                      text: mergeAssistantCaptionText(line.text, text),
                      endTime: Math.max(Number(line.endTime) || endTime, endTime),
                      duration:
                        Math.round(
                          ((Number(line.duration) || 0) + duration) * 10
                        ) / 10,
                    }
                  : line
              )
            : [
                ...prev,
                {
                  role: "user",
                  text,
                  time: startTime,
                  endTime,
                  duration,
                  timingSource: Number.isFinite(reportedSeconds) ? "vapi" : "live",
                },
              ];
          linesRef.current = next;
          return next;
        });
      } else if (transcriptType === "partial") {
        // Track the streaming-partial span independently of VAD (consumed by
        // the final-acceptance path). A gap larger than the window TTL starts
        // a new utterance span instead of stretching the old one.
        const nowMs = performance.now();
        const activity = userPartialActivityRef.current;
        if (!activity || nowMs - activity.lastAtMs > USER_SPEECH_WINDOW_TTL_MS) {
          userPartialActivityRef.current = {
            start: timestamp,
            end: timestamp,
            lastAtMs: nowMs,
          };
        } else {
          activity.start = Math.min(activity.start, timestamp);
          activity.end = Math.max(activity.end, timestamp);
          activity.lastAtMs = nowMs;
        }
        const speechWindow = peekUserSpeechWindow();
        if (!speechWindow) {
          setPartial(null);
          return;
        }
        const startTime = Math.min(speechWindow.start, speechWindow.end ?? timestamp);
        const endTime = Math.max(startTime, speechWindow.end ?? timestamp);
        setPartial({
          role: "user",
          text,
          time: startTime,
          endTime,
          duration: Math.round(Math.max(0, endTime - startTime) * 10) / 10,
        });
      }
    });

    vapi.on("error", (e) => {
      const message = e?.error?.message || e?.message || e?.errorMsg || "";
      if (isDuplicateEvent("error", { message })) return;
      logDebugEvent("error", {
        message: e?.message,
        errorMsg: e?.errorMsg,
        error: e?.error,
      });
      // A normal hangup (the AI's endCall tool, or the server closing the
      // room) surfaces as a daily-js "ejection" error — "Meeting has ended" —
      // after a successful call. Expected teardown: never toast for it, and
      // log at info level so Next's dev overlay doesn't count an "issue"
      // for every completed call.
      const benignTeardown =
        endedFiredRef.current ||
        /meeting (has )?ended|ejection|exit-room/i.test(
          `${message} ${e?.errorMsg ?? ""} ${e?.error?.type ?? ""}`
        );
      if (benignTeardown) {
        console.info("Vapi call teardown (benign):", message || e?.errorMsg || "ended");
        return;
      }
      console.error("Vapi error:", e);
      setStatus((s) => (s === "live" || s === "ended" ? s : "idle"));
      toast.error(message || "Voice call error — please try again.");
    });

    return () => {
      stopRequestedRef.current = true; // catch unmount during 'starting'
      captureActiveRef.current = false;
      clearVapiListeners();
      // Only stop a call that's actually connected. Stopping an already-ended
      // call (the normal call-end -> unmount path) makes daily-js throw.
      if (callLiveRef.current) {
        callLiveRef.current = false;
        try {
          vapi.stop();
        } catch {}
      }
    };
  }, []);

  // Safety net: daily-js can throw a benign async "reading 'producers'" error
  // while tearing a call down. Swallow ONLY that specific Daily error so it
  // doesn't surface as an unhandled runtime error; anything else is untouched.
  useEffect(() => {
    const isBenignDaily = (msg, stack) =>
      /producers/.test(msg || "") && /daily/i.test(`${msg} ${stack}`);
    const onError = (e) => {
      const msg = e?.message || "";
      const stack = e?.error?.stack || e?.filename || "";
      if (isBenignDaily(msg, stack)) {
        console.warn("[roleplay] suppressed benign daily-js teardown error:", msg);
        e.preventDefault?.();
        e.stopImmediatePropagation?.();
      }
    };
    const onRejection = (e) => {
      const msg = e?.reason?.message || String(e?.reason || "");
      const stack = e?.reason?.stack || "";
      if (isBenignDaily(msg, stack)) {
        console.warn("[roleplay] suppressed benign daily-js teardown rejection:", msg);
        e.preventDefault?.();
        e.stopImmediatePropagation?.();
      }
    };
    window.addEventListener("error", onError, true);
    window.addEventListener("unhandledrejection", onRejection, true);
    return () => {
      window.removeEventListener("error", onError, true);
      window.removeEventListener("unhandledrejection", onRejection, true);
    };
  }, []);

  // Simple elapsed-time ticker while live.
  useEffect(() => {
    if (status !== "live") return;
    const t = setInterval(() => setElapsedS((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [status]);

  // Keep a ref copy of the turn-by-turn lines so the call-end handler (whose
  // closure captured an empty lines array) can read the final transcript.
  useEffect(() => {
    linesRef.current = lines;
  }, [lines]);

  const startCall = async () => {
    if (status !== "idle") return;
    try {
      setStatus("starting");
      setLines([]);
      linesRef.current = [];
      setPartial(null);
      callStartedAtRef.current = null;
      activeTurnTimingRef.current = { user: null, bot: null };
      userSpeechWindowsRef.current = {
        active: null,
        pending: [],
        sequence: 0,
        groupSequence: 0,
        activeGroup: null,
        activeGroupTurn: null,
      };
      latestAssistantSpeechRef.current = { turnKey: null };
      interruptedAssistantTurnsRef.current = new Set();
      assistantCaptionSequenceRef.current = 0;
      initialProspectCaptionSeededRef.current = false;
      recentAssistantTurnRef.current = null;
      lastAcceptedUserFinalRef.current = null;
      userPartialActivityRef.current = null;
      micVoicedRef.current = { intervals: [], samples: 0 };
      setElapsedS(0);
      setVolume(0);
      setMicVolume(0);
      setCompletedWaypointIds([]);
      waypointDingPlayedRef.current = new Set();
      endedFiredRef.current = false;
      stopRequestedRef.current = false;
      captureActiveRef.current = true;
      debugEventsRef.current = [];
      debugEventSeqRef.current = 0;
      setDebugPaused(false);

      // Debug calls get long Vapi timeouts so a paused (muted) call is not
      // hung up by the silence timeout mid-inspection.
      const callScenario =
        ROLEPLAY_DEBUG && debugLongTimeouts
          ? {
              ...scenario,
              knobs: {
                ...(scenario.knobs ?? {}),
                silenceTimeoutSeconds: 3600,
                maxDurationSeconds: 7200,
              },
            }
          : scenario;
      const { assistantId, assistantOverrides } = buildRoleplayInitObj(callScenario, {
        traineeName,
      });
      // Record which STT actually ran, so a captured debug log is self-describing.
      logDebugEventRef.current?.("transcriber", {
        transcriber: assistantOverrides?.transcriber ?? "(assistant default)",
      });

      const call = await vapiRef.current.start(assistantId, assistantOverrides);

      // User hit End Call / Back / unmounted while start() was in flight —
      // now that the call object exists, stop() actually tears it down.
      if (stopRequestedRef.current) {
        captureActiveRef.current = false;
        try {
          vapiRef.current.stop();
        } catch {}
        setStatus("idle");
        return;
      }

      if (!call) {
        captureActiveRef.current = false;
        setStatus("idle");
        toast.error("Could not start the call — check your microphone permission and try again.");
        return;
      }
      callIdRef.current = call.id;
    } catch (e) {
      captureActiveRef.current = false;
      console.error("start failed:", e);
      setStatus("idle");
      // If the user deliberately cancelled during connect, a rejection here is
      // expected — don't show a misleading mic-permission error.
      if (!stopRequestedRef.current) {
        toast.error("Could not start the call — check your microphone permission and try again.");
      }
    }
  };

  const stopCall = () => {
    stopRequestedRef.current = true; // handles End Call during 'starting' too
    try {
      vapiRef.current.stop();
    } catch (e) {
      console.error("stop failed:", e);
    }
  };

  // Pause (trainee-facing): mutes the trainee's mic only. The transcript
  // keeps rendering live — the Vapi call stays up underneath, the prospect may
  // keep talking, and it can still hit the silence timeout. Capture is
  // untouched, so the scorecard always receives the full transcript.
  const toggleDebugPause = () => {
    if (status !== "live") return;
    const pausing = !debugPaused;
    try {
      vapiRef.current?.setMuted?.(pausing);
    } catch (e) {
      console.warn("setMuted failed:", e);
    }
    setDebugPaused(pausing);
  };

  const copyDebugLog = () => {
    let json;
    try {
      json = JSON.stringify(debugEventsRef.current, null, 1);
    } catch (e) {
      json = JSON.stringify({ serializationError: String(e) });
    }
    navigator.clipboard?.writeText(json);
    toast.success(`Debug log copied (${debugEventsRef.current.length} events)`);
  };

  // Dev-only: feed a synthetic WaypointComplete tool-calls message through the
  // REAL registered Vapi message handler (dedupe -> parser -> state -> ding),
  // so the carousel and chime can be exercised without a live voice call.
  const simulateWaypointComplete = () => {
    const next = waypoints.find(
      (waypoint) => !completedWaypointIds.includes(waypoint.id)
    );
    if (!next) {
      toast("All waypoints are already complete — start a new call to reset.");
      return;
    }
    const synthetic = {
      type: "tool-calls",
      simulated: true,
      toolCallList: [
        {
          function: {
            name: WAYPOINT_COMPLETE_FUNCTION_NAME,
            arguments: JSON.stringify({ waypointId: next.id }),
          },
        },
      ],
    };
    let delivered = false;
    try {
      delivered = vapiRef.current?.emit?.("message", synthetic) === true;
    } catch (e) {
      console.warn("simulate emit failed:", e);
    }
    if (!delivered) {
      toast.error("Simulation failed — no message handler is registered.");
    }
  };

  const fmtTime = (s) =>
    `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  // What the trainee should expect while paused: the call's actual compiled
  // silence timeout (dev debug calls get the long-timeout override).
  const pauseSilenceLimitS =
    ROLEPLAY_DEBUG && debugLongTimeouts
      ? 3600
      : Math.min(3600, Math.max(10, Number(scenario.knobs?.silenceTimeoutSeconds) || 90));

  return (
    <div className="flex flex-col gap-4 w-full">
      <button
        onClick={() => {
          if (status === "live" || status === "starting") stopCall();
          onBack();
        }}
        className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 w-fit"
      >
        <ArrowLeft size={16} /> Back to scenarios
      </button>

      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">{scenario.name}</h2>
            <p className="text-sm text-gray-500 mt-1">{scenario.description}</p>
            <p className="text-xs text-gray-400 mt-2">
              Voice: {scenario.voice.label} · Difficulty: {scenario.difficulty} · You are the{" "}
              <b>agent</b>; the AI plays the prospect.{" "}
              {scenario.speaksFirst === "agent"
                ? "Inbound call — answer with your property greeting to begin."
                : "The AI speaks first."}
            </p>
          </div>
          {(() => {
            const v = ROLEPLAY_VOICES.find((x) => x.voiceId === scenario.voice.voiceId);
            return v?.src ? (
              <img
                src={v.src}
                alt={scenario.voice.label}
                className="h-16 w-16 rounded-full object-cover border border-gray-200"
                onError={(e) => (e.currentTarget.style.display = "none")}
              />
            ) : (
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-100 border border-gray-200 text-xl font-semibold text-gray-500">
                {scenario.voice.label?.[0] ?? "?"}
              </span>
            );
          })()}
        </div>

        <div className="flex items-center gap-3 mt-6 flex-wrap">
          {status === "idle" && (
            <button
              onClick={startCall}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 px-6 rounded-lg transition-colors"
            >
              <Mic size={18} /> Start Roleplay <Sparkle size={16} />
            </button>
          )}
          {ROLEPLAY_DEBUG && status === "idle" && (
            <label className="flex items-center gap-1.5 text-xs text-gray-500 select-none">
              <input
                type="checkbox"
                checked={debugLongTimeouts}
                onChange={(e) => setDebugLongTimeouts(e.target.checked)}
              />
              Debug call: long timeouts (safe to pause)
            </label>
          )}
          {status === "starting" && (
            <button
              disabled
              className="flex items-center gap-2 bg-blue-400 text-white font-medium py-2.5 px-6 rounded-lg cursor-wait"
            >
              Connecting…
            </button>
          )}
          {(status === "live" || status === "starting") && (
            <button
              onClick={stopCall}
              className="flex items-center gap-2 border border-red-500 text-red-500 hover:bg-red-500 hover:text-white font-medium py-2.5 px-6 rounded-lg transition-colors"
            >
              <PhoneOff size={18} /> End Call
            </button>
          )}
          {status === "live" && (
            <button
              onClick={toggleDebugPause}
              className={`flex items-center gap-2 border font-medium py-2.5 px-4 rounded-lg transition-colors ${
                debugPaused
                  ? "border-amber-500 bg-amber-500 text-white hover:bg-amber-600"
                  : "border-amber-500 text-amber-600 hover:bg-amber-50"
              }`}
            >
              {debugPaused ? <Play size={16} /> : <Pause size={16} />}
              {debugPaused ? "Resume" : "Pause"}
            </button>
          )}
          {ROLEPLAY_DEBUG && (status === "idle" || status === "live") && (
            <button
              type="button"
              onClick={simulateWaypointComplete}
              title="Dev only: run a fake WaypointComplete through the real message handler"
              className="rounded-lg border border-dashed border-gray-300 px-3 py-2 text-xs font-medium text-gray-500 transition-colors hover:border-blue-300 hover:text-blue-600"
            >
              Simulate waypoint ✓
            </button>
          )}
          {status === "live" && (
            <div className="flex items-center gap-3 ml-auto">
              <span className="text-sm font-mono text-gray-500">{fmtTime(elapsedS)}</span>
              <span
                className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                  assistantSpeaking
                    ? "bg-amber-100 text-amber-700"
                    : "bg-green-100 text-green-700"
                }`}
              >
                {assistantSpeaking ? "Prospect speaking…" : "Your turn"}
              </span>
              <div className="w-20 h-2 bg-gray-100 rounded-full overflow-hidden">
                {/* Tracks whoever holds the floor, same as the badge: the
                    AI's remote volume while it speaks, the trainee's mic
                    otherwise. */}
                <div
                  className={`h-full transition-all duration-100 ${
                    assistantSpeaking ? "bg-amber-500" : "bg-green-500"
                  }`}
                  style={{
                    width: `${Math.min(
                      100,
                      Math.round((assistantSpeaking ? volume : micVolume) * 100)
                    )}%`,
                  }}
                />
              </div>
            </div>
          )}
          {status === "ended" && (
            <span className="text-sm text-gray-500">Call ended — preparing your scorecard…</span>
          )}
        </div>
      </div>

      {debugPaused && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <span>
            Paused — your mic is muted. The prospect may keep talking and can hang
            up after ~{pauseSilenceLimitS}s of silence.
          </span>
          {ROLEPLAY_DEBUG && (
            <button
              type="button"
              onClick={copyDebugLog}
              className="rounded border border-amber-400 bg-white px-2 py-1 font-medium text-amber-700 hover:bg-amber-100"
            >
              Copy debug log
            </button>
          )}
        </div>
      )}
      <LiveTranscript lines={lines} partial={partial} />
      <WaypointCarousel
        waypoints={waypoints}
        completedIds={completedWaypointIds}
        isLive={status === "live"}
      />
    </div>
  );
};
