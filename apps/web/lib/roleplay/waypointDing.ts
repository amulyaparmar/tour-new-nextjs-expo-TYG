// Synthesized two-tone chime played when a live waypoint is completed.
// WebAudio (no asset, no network). A5 -> E6, ~0.5s total, quiet enough to sit
// under the live call audio. Safe to call from any handler: failures (no
// AudioContext, autoplay policy, closed context) are swallowed — sound is a
// nice-to-have and must never break the call.

let sharedContext: AudioContext | null = null;

export const playWaypointDing = () => {
  if (typeof window === "undefined") return;
  try {
    const Ctor: typeof AudioContext | undefined =
      window.AudioContext ?? (window as any).webkitAudioContext;
    if (!Ctor) return;
    if (!sharedContext || sharedContext.state === "closed") {
      sharedContext = new Ctor();
    }
    const ctx = sharedContext;
    // The user started the call with a click, so resume() is permitted even
    // when the context was created outside a gesture handler.
    if (ctx.state === "suspended") void ctx.resume();

    const now = ctx.currentTime;
    const notes: Array<[frequency: number, delaySeconds: number]> = [
      [880, 0], // A5
      [1318.51, 0.09], // E6
    ];
    for (const [frequency, delay] of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = frequency;
      const start = now + delay;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.1, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.4);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.45);
    }
  } catch {
    // Sound is best-effort only.
  }
};
