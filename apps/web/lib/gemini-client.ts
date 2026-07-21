import "server-only";

import { DEFAULT_GEMINI_AUDIO_MODEL } from "@tour/shared";

const GEMINI_BASE = "https://generativelanguage.googleapis.com";
const GEMINI_UPLOAD_BASE = "https://generativelanguage.googleapis.com/upload";

/** Transient Gemini / upstream failures — retried with backoff. */
const GEMINI_RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);
const GEMINI_MAX_ATTEMPTS = 6;
const GEMINI_BASE_DELAY_MS = 3_000;
const GEMINI_MAX_DELAY_MS = 90_000;
const GEMINI_DEFAULT_TIMEOUT_MS = 60_000;
const GEMINI_GENERATE_TIMEOUT_MS = 30_000;
const GEMINI_UPLOAD_TIMEOUT_MS = 180_000;
const GEMINI_FILE_GET_TIMEOUT_MS = 30_000;

function readPositiveIntEnv(name: string): number | null {
  const value = process.env[name]?.trim();
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null;
}

function geminiRequestTimeoutMs(label: string): number {
  const globalTimeout = readPositiveIntEnv("GEMINI_REQUEST_TIMEOUT_MS");
  const normalized = label.toLowerCase();

  if (normalized.includes("generatecontent") || normalized.includes("audio chat")) {
    return (
      readPositiveIntEnv("GEMINI_GENERATE_TIMEOUT_MS")
      ?? globalTimeout
      ?? GEMINI_GENERATE_TIMEOUT_MS
    );
  }

  if (normalized.includes("upload finalize")) {
    return (
      readPositiveIntEnv("GEMINI_UPLOAD_TIMEOUT_MS")
      ?? globalTimeout
      ?? GEMINI_UPLOAD_TIMEOUT_MS
    );
  }

  if (normalized.includes("file get") || normalized.includes("upload start")) {
    return (
      readPositiveIntEnv("GEMINI_FILE_GET_TIMEOUT_MS")
      ?? globalTimeout
      ?? GEMINI_FILE_GET_TIMEOUT_MS
    );
  }

  return globalTimeout ?? GEMINI_DEFAULT_TIMEOUT_MS;
}

function geminiTimeoutError(label: string, timeoutMs: number): Error {
  return new Error(`${label} timed out after ${timeoutMs}ms`);
}

function geminiRetryDelayMs(attempt: number): number {
  const exponential = GEMINI_BASE_DELAY_MS * 2 ** (attempt - 1);
  const jitter = Math.floor(Math.random() * 750);
  return Math.min(GEMINI_MAX_DELAY_MS, exponential + jitter);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableGeminiStatus(status: number): boolean {
  return GEMINI_RETRYABLE_STATUSES.has(status);
}

async function fetchWithGeminiRetry(
  url: string,
  init: RequestInit,
  label: string
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= GEMINI_MAX_ATTEMPTS; attempt++) {
    const timeoutMs = geminiRequestTimeoutMs(label);
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort(geminiTimeoutError(label, timeoutMs));
    }, timeoutMs);

    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      if (response.ok) return response;

      const errText = await response.text();
      lastError = new Error(`${label} error ${response.status}: ${errText}`);

      if (!isRetryableGeminiStatus(response.status) || attempt === GEMINI_MAX_ATTEMPTS) {
        throw lastError;
      }

      const delayMs = geminiRetryDelayMs(attempt);
      console.warn(
        `[gemini] ${label} returned ${response.status}; retry ${attempt}/${GEMINI_MAX_ATTEMPTS} in ${delayMs}ms`
      );
      await sleep(delayMs);
    } catch (error) {
      if (error instanceof Error && error.message.includes(`${label} error`)) {
        throw error;
      }

      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt === GEMINI_MAX_ATTEMPTS) throw lastError;

      const delayMs = geminiRetryDelayMs(attempt);
      console.warn(
        `[gemini] ${label} network error; retry ${attempt}/${GEMINI_MAX_ATTEMPTS} in ${delayMs}ms:`,
        lastError.message
      );
      await sleep(delayMs);
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError ?? new Error(`${label} failed after ${GEMINI_MAX_ATTEMPTS} attempts`);
}

export type GeminiUploadedFile = {
  uri: string;
  mimeType: string;
  name?: string;
};

export function getGeminiConfig() {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured");
  const model = process.env.GEMINI_AUDIO_MODEL?.trim() || DEFAULT_GEMINI_AUDIO_MODEL;
  return { apiKey, model };
}

export function isGeminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}

/** Map recording MIME/extension to Gemini-supported audio MIME types. */
export function geminiMimeTypeForRecording(mimeType: string, fileName?: string): string {
  const ext = fileName?.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();
  if (ext === "mp3" || ext === "mpeg" || ext === "mpga") return "audio/mp3";
  if (ext === "wav") return "audio/wav";
  if (ext === "flac") return "audio/flac";
  if (ext === "ogg" || ext === "oga") return "audio/ogg";
  if (ext === "aac" || ext === "m4a") return "audio/aac";
  if (ext === "aiff" || ext === "aif") return "audio/aiff";

  const normalized = mimeType.toLowerCase().split(";")[0]!.trim();
  if (normalized === "audio/mpeg" || normalized === "audio/mp3") return "audio/mp3";
  if (normalized === "audio/wav" || normalized === "audio/x-wav") return "audio/wav";
  if (normalized === "audio/flac") return "audio/flac";
  if (normalized === "audio/ogg") return "audio/ogg";
  if (normalized === "audio/aac" || normalized === "audio/mp4" || normalized === "audio/m4a") {
    return "audio/aac";
  }
  if (normalized === "audio/aiff") return "audio/aiff";
  return "audio/mp3";
}

export async function uploadGeminiFile(
  buffer: Buffer,
  mimeType: string,
  displayName: string
): Promise<GeminiUploadedFile> {
  const { apiKey } = getGeminiConfig();
  const startResponse = await fetchWithGeminiRetry(
    `${GEMINI_UPLOAD_BASE}/v1beta/files`,
    {
      method: "POST",
      headers: {
        "x-goog-api-key": apiKey,
        "X-Goog-Upload-Protocol": "resumable",
        "X-Goog-Upload-Command": "start",
        "X-Goog-Upload-Header-Content-Length": String(buffer.length),
        "X-Goog-Upload-Header-Content-Type": mimeType,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ file: { display_name: displayName } }),
    },
    "Gemini file upload start"
  );

  const uploadUrl = startResponse.headers.get("x-goog-upload-url");
  if (!uploadUrl) throw new Error("Gemini file upload did not return x-goog-upload-url");

  const uploadResponse = await fetchWithGeminiRetry(
    uploadUrl,
    {
      method: "POST",
      headers: {
        "Content-Length": String(buffer.length),
        "X-Goog-Upload-Offset": "0",
        "X-Goog-Upload-Command": "upload, finalize",
      },
      body: new Uint8Array(buffer),
    },
    "Gemini file upload finalize"
  );

  const payload = (await uploadResponse.json()) as {
    file?: { uri?: string; mimeType?: string; name?: string };
  };
  const uri = payload.file?.uri;
  if (!uri) throw new Error("Gemini file upload returned no file URI");

  return {
    uri,
    mimeType: payload.file?.mimeType ?? mimeType,
    name: payload.file?.name,
  };
}

/** Upload via Files API and wait until Gemini marks the file ACTIVE. */
export async function uploadGeminiAudioFile(
  buffer: Buffer,
  mimeType: string,
  displayName: string
): Promise<GeminiUploadedFile> {
  const normalizedMime = geminiMimeTypeForRecording(mimeType, displayName);
  const uploaded = await uploadGeminiFile(buffer, normalizedMime, displayName);
  if (uploaded.name) {
    await waitForGeminiFileActive(uploaded.name);
  }
  return uploaded;
}

async function waitForGeminiFileActive(
  fileName: string,
  maxAttempts = 30,
  delayMs = 2_000
): Promise<void> {
  const { apiKey } = getGeminiConfig();

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const response = await fetchWithGeminiRetry(
      `${GEMINI_BASE}/v1beta/${fileName}`,
      { headers: { "x-goog-api-key": apiKey } },
      "Gemini file get"
    );

    const payload = (await response.json()) as { state?: string; error?: { message?: string } };
    const state = payload.state ?? "ACTIVE";

    if (state === "ACTIVE") return;
    if (state === "FAILED") {
      throw new Error(
        `Gemini file processing failed: ${payload.error?.message ?? "unknown error"}`
      );
    }

    if (attempt === maxAttempts) {
      throw new Error(`Gemini file not active after ${maxAttempts} attempts (last state: ${state})`);
    }

    await sleep(delayMs);
  }
}

export type GeminiChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export async function geminiChatWithAudioFile(params: {
  file: { uri: string; mimeType: string };
  messages: GeminiChatMessage[];
  model?: string;
}): Promise<string> {
  const { apiKey, model: defaultModel } = getGeminiConfig();
  const model = params.model ?? defaultModel;

  if (params.messages.length === 0) {
    throw new Error("At least one message is required.");
  }

  const contents = params.messages.map((message, index) => {
    const parts: Array<GeminiAudioPart | { text: string }> = [{ text: message.content }];
    if (index === 0 && message.role === "user") {
      parts.unshift({
        file_data: { mime_type: params.file.mimeType, file_uri: params.file.uri },
      });
    }
    return {
      role: message.role === "assistant" ? "model" : "user",
      parts,
    };
  });

  const response = await fetchWithGeminiRetry(
    `${GEMINI_BASE}/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({ contents }),
    },
    "Gemini audio chat"
  );

  const payload = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };

  const text = payload.candidates?.[0]?.content?.parts
    ?.map((part) => part.text ?? "")
    .join("")
    .trim();

  if (!text) throw new Error("Gemini returned an empty chat response");
  return text;
}

type GeminiAudioPart =
  | { file_data: { mime_type: string; file_uri: string } }
  | { inline_data: { mime_type: string; data: string } };

function buildAudioPart(
  buffer: Buffer,
  mimeType: string,
  uploaded: GeminiUploadedFile
): GeminiAudioPart {
  return { file_data: { mime_type: uploaded.mimeType, file_uri: uploaded.uri } };
}

export async function geminiGenerateJson<T>(params: {
  prompt: string;
  schema: Record<string, unknown>;
  audioBuffer: Buffer;
  mimeType: string;
  fileName?: string;
  model?: string;
  uploadedFile?: GeminiUploadedFile;
  useResponseSchema?: boolean;
}): Promise<T> {
  const { apiKey, model: defaultModel } = getGeminiConfig();
  const model = params.model ?? defaultModel;
  const mimeType = geminiMimeTypeForRecording(params.mimeType, params.fileName);

  const uploaded = params.uploadedFile
    ?? await uploadGeminiAudioFile(
      params.audioBuffer,
      mimeType,
      params.fileName ?? "recording"
    );

  const generationConfig: Record<string, unknown> = {
    responseMimeType: "application/json",
  };
  if (params.useResponseSchema !== false) {
    generationConfig.responseSchema = params.schema;
  }

  const body = {
    contents: [
      {
        parts: [
          { text: params.prompt },
          buildAudioPart(params.audioBuffer, mimeType, uploaded),
        ],
      },
    ],
    generationConfig,
  };

  const response = await fetchWithGeminiRetry(
    `${GEMINI_BASE}/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify(body),
    },
    "Gemini generateContent"
  );

  const payload = (await response.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
  };

  const text = payload.candidates?.[0]?.content?.parts
    ?.map((part) => part.text ?? "")
    .join("")
    .trim();

  if (!text) throw new Error("Gemini returned an empty response");

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Gemini response was not valid JSON: ${text.slice(0, 400)}`);
  }
}

/** Parse MM:SS or HH:MM:SS timestamps from Gemini into seconds. */
export function parseGeminiTimestamp(value: string): number {
  const parts = value.trim().split(":").map((part) => Number(part));
  if (parts.some((part) => Number.isNaN(part))) return 0;
  if (parts.length === 2) return parts[0]! * 60 + parts[1]!;
  if (parts.length === 3) return parts[0]! * 3600 + parts[1]! * 60 + parts[2]!;
  return 0;
}
