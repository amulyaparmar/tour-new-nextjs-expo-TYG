import { transcribeDictationWithElevenLabs } from "@/lib/elevenlabs-dictation";
import { safeDictationError } from "@/lib/safe-ai-error";

export const maxDuration = 60;

const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_REQUESTS = 12;

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

const rateLimitStore = new Map<string, RateLimitEntry>();

function consumeRateLimit(request: Request): boolean {
  const now = Date.now();
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const key = forwardedFor || request.headers.get("x-real-ip") || "local";
  const current = rateLimitStore.get(key);

  if (!current || current.resetAt <= now) {
    rateLimitStore.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (current.count >= RATE_LIMIT_REQUESTS) return false;

  current.count += 1;
  return true;
}

export async function POST(request: Request) {
  if (!consumeRateLimit(request)) {
    return Response.json(
      { error: "Too many dictation requests. Please wait a few minutes." },
      { status: 429 }
    );
  }

  try {
    const formData = await request.formData();
    const audio = formData.get("file");

    if (!(audio instanceof Blob)) {
      return Response.json({ error: "An audio recording is required." }, { status: 400 });
    }
    if (audio.size === 0) {
      return Response.json({ error: "The recording is empty." }, { status: 400 });
    }
    if (audio.size > MAX_AUDIO_BYTES) {
      return Response.json(
        { error: "The recording is too large. Keep dictation under one minute." },
        { status: 413 }
      );
    }

    const fileName = audio instanceof File && audio.name ? audio.name : "dictation.webm";
    const text = await transcribeDictationWithElevenLabs(audio, fileName);
    return Response.json({ text });
  } catch (error) {
    console.error("Dictation failed", error);
    return Response.json({ error: safeDictationError(error) }, { status: 500 });
  }
}
