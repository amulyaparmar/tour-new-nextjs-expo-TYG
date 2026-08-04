import "server-only";

import {
  ApiError,
  GoogleGenAI,
  ServiceTier,
  type Content,
  type HttpOptions,
  type Part,
} from "@google/genai";
import {
  DEFAULT_GEMINI_AUDIO_MODEL,
  GEMINI_AUDIO_MODELS,
  isGeminiAudioModelId,
  type GeminiAudioModelId,
} from "@tour/shared";

const GEMINI_BASE = "https://generativelanguage.googleapis.com";
const GEMINI_UPLOAD_BASE = "https://generativelanguage.googleapis.com/upload";

/** Transient Gemini / upstream failures — retried with backoff. */
const GEMINI_RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);
const GEMINI_MAX_ATTEMPTS = 6;
const GEMINI_MODEL_MAX_ATTEMPTS = 2;
const GEMINI_BASE_DELAY_MS = 3_000;
const GEMINI_MAX_DELAY_MS = 90_000;
const GEMINI_DEFAULT_TIMEOUT_MS = 60_000;
const GEMINI_GENERATE_TIMEOUT_MS = 30_000;
const GEMINI_CHAT_TIMEOUT_MS = 30_000;
const GEMINI_AUDIO_INSIGHTS_TIMEOUT_MS = 10 * 60_000;
const GEMINI_UPLOAD_TIMEOUT_MS = 180_000;
const GEMINI_FILE_GET_TIMEOUT_MS = 30_000;

type GeminiRetryOptions = {
  timeoutMs?: number;
  maxAttempts?: number;
  retryTimeouts?: boolean;
};

function readPositiveIntEnv(name: string): number | null {
  const value = process.env[name]?.trim();
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null;
}

function getGeminiModelMaxAttempts(): number {
  return readPositiveIntEnv("GEMINI_MODEL_MAX_ATTEMPTS") ?? GEMINI_MODEL_MAX_ATTEMPTS;
}

function geminiRequestTimeoutMs(label: string): number {
  const globalTimeout = readPositiveIntEnv("GEMINI_REQUEST_TIMEOUT_MS");
  const normalized = label.toLowerCase();

  if (normalized.includes("audio chat")) {
    return (
      readPositiveIntEnv("GEMINI_CHAT_TIMEOUT_MS")
      ?? globalTimeout
      ?? GEMINI_CHAT_TIMEOUT_MS
    );
  }

  if (normalized.includes("generatecontent")) {
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

export function getGeminiAudioInsightsTimeoutMs(): number {
  return (
    readPositiveIntEnv("GEMINI_AUDIO_INSIGHTS_TIMEOUT_MS")
    ?? GEMINI_AUDIO_INSIGHTS_TIMEOUT_MS
  );
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
  label: string,
  options: GeminiRetryOptions = {},
): Promise<Response> {
  let lastError: Error | null = null;
  const maxAttempts =
    Number.isFinite(options.maxAttempts) && Number(options.maxAttempts) > 0
      ? Math.floor(Number(options.maxAttempts))
      : GEMINI_MAX_ATTEMPTS;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const timeoutMs =
      Number.isFinite(options.timeoutMs) && Number(options.timeoutMs) > 0
        ? Math.floor(Number(options.timeoutMs))
        : geminiRequestTimeoutMs(label);
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort(geminiTimeoutError(label, timeoutMs));
    }, timeoutMs);

    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      if (response.ok) return response;

      const errText = await response.text();
      lastError = new Error(`${label} error ${response.status}: ${errText}`);

      if (!isRetryableGeminiStatus(response.status) || attempt === maxAttempts) {
        throw lastError;
      }

      const delayMs = geminiRetryDelayMs(attempt);
      console.warn(
        `[gemini] ${label} returned ${response.status}; retry ${attempt}/${maxAttempts} in ${delayMs}ms`
      );
      await sleep(delayMs);
    } catch (error) {
      if (error instanceof Error && error.message.includes(`${label} error`)) {
        throw error;
      }

      lastError =
        controller.signal.aborted && controller.signal.reason instanceof Error
          ? controller.signal.reason
          : error instanceof Error
            ? error
            : new Error(String(error));
      const timedOut =
        controller.signal.aborted
        && lastError.message === geminiTimeoutError(label, timeoutMs).message;
      if ((timedOut && options.retryTimeouts === false) || attempt === maxAttempts) {
        throw lastError;
      }

      const delayMs = geminiRetryDelayMs(attempt);
      console.warn(
        `[gemini] ${label} network error; retry ${attempt}/${maxAttempts} in ${delayMs}ms:`,
        lastError.message
      );
      await sleep(delayMs);
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError ?? new Error(`${label} failed after ${maxAttempts} attempts`);
}

export type GeminiUploadedFile = {
  uri: string;
  mimeType: string;
  name?: string;
};

export type GeminiServiceTier = "priority" | "standard" | "flex";

const DEFAULT_GEMINI_AUDIO_MODEL_CHAIN = GEMINI_AUDIO_MODELS.map(({ id }) => id);

function normalizeGeminiServiceTier(
  value: string | undefined,
): GeminiServiceTier | null {
  const configuredTier = value?.trim().toLowerCase();
  if (
    configuredTier === "priority"
    || configuredTier === "standard"
    || configuredTier === "flex"
  ) {
    return configuredTier;
  }

  return null;
}

function getGeminiServiceTierCandidates(): GeminiServiceTier[] {
  const primaryTier = normalizeGeminiServiceTier(process.env.GEMINI_SERVICE_TIER)
    ?? "standard";
  const configuredFallback = process.env.GEMINI_FALLBACK_SERVICE_TIER?.trim();
  if (configuredFallback?.toLowerCase() === "none") return [primaryTier];

  const fallbackTier = normalizeGeminiServiceTier(configuredFallback) ?? "priority";
  return Array.from(new Set([primaryTier, fallbackTier]));
}

function reportGeminiServiceTier(
  headers: Record<string, string> | undefined,
  requestedTier: GeminiServiceTier,
  label: string,
): void {
  const servedTier = Object.entries(headers ?? {}).find(
    ([name]) => name.toLowerCase() === "x-gemini-service-tier",
  )?.[1]?.trim().toLowerCase();
  if (servedTier && servedTier !== requestedTier) {
    console.warn(
      `[gemini] ${label} requested ${requestedTier} service tier but was served by ${servedTier}`,
    );
  }
}

function toSdkServiceTier(serviceTier: GeminiServiceTier): ServiceTier {
  if (serviceTier === "flex") return ServiceTier.FLEX;
  if (serviceTier === "standard") return ServiceTier.STANDARD;
  return ServiceTier.PRIORITY;
}

function shouldFallbackGeminiServiceTier(error: unknown): boolean {
  if (error instanceof ApiError) {
    return isRetryableGeminiStatus(error.status);
  }
  if (!(error instanceof Error)) return true;

  const status = error.message.match(/\b(?:error|status)\s+(\d{3})\b/i)?.[1];
  if (status) return isRetryableGeminiStatus(Number(status));

  return /timed out|timeout|network|fetch failed|econnreset|econnrefused|socket/i.test(
    error.message,
  );
}

function reportGeminiServiceTierFallback(
  failedTier: GeminiServiceTier,
  nextTier: GeminiServiceTier,
  label: string,
  error: unknown,
): void {
  const reason = error instanceof Error ? error.message : String(error);
  console.warn(
    `[gemini] ${label} failed on ${failedTier}; retrying on ${nextTier}: ${reason}`,
  );
}

async function withGeminiServiceTierFallback<T>(
  label: string,
  operation: (serviceTier: GeminiServiceTier) => Promise<T>,
): Promise<T> {
  const serviceTiers = getGeminiServiceTierCandidates();

  for (let index = 0; index < serviceTiers.length; index++) {
    const serviceTier = serviceTiers[index]!;
    try {
      return await operation(serviceTier);
    } catch (error) {
      const nextTier = serviceTiers[index + 1];
      if (!nextTier || !shouldFallbackGeminiServiceTier(error)) throw error;
      reportGeminiServiceTierFallback(serviceTier, nextTier, label, error);
    }
  }

  throw new Error(`${label} failed across all configured service tiers`);
}

function geminiRetryBackoffSeconds(attempts: number): number {
  let total = 0;
  for (let retry = 0; retry < attempts - 1; retry++) {
    total += Math.min(4, 2 ** retry);
  }
  return total;
}

function getGeminiSdkHttpOptions(
  label: string,
  options: GeminiRetryOptions = {},
): HttpOptions {
  const attempts = options.maxAttempts ?? getGeminiModelMaxAttempts();
  const configuredBudgetMs = options.timeoutMs;
  const retryBackoffMs = geminiRetryBackoffSeconds(attempts) * 1_000;
  const timeout = configuredBudgetMs
    ? Math.max(1_000, Math.floor((configuredBudgetMs - retryBackoffMs) / attempts))
    : geminiRequestTimeoutMs(label);

  return {
    timeout,
    retryOptions: {
      attempts,
      initialDelay: 1,
      maxDelay: 4,
      expBase: 2,
      jitter: 1,
      httpStatusCodes: Array.from(GEMINI_RETRYABLE_STATUSES),
    },
  };
}

function normalizeConfiguredAudioModel(value: string | undefined): GeminiAudioModelId {
  if (!value) return DEFAULT_GEMINI_AUDIO_MODEL;
  if (isGeminiAudioModelId(value)) return value;

  console.warn(
    `[gemini] Ignoring unsupported audio model "${value}"; using ${DEFAULT_GEMINI_AUDIO_MODEL}`,
  );
  return DEFAULT_GEMINI_AUDIO_MODEL;
}

function getGeminiAudioModelCandidates(primaryModel: string): GeminiAudioModelId[] {
  const primary = normalizeConfiguredAudioModel(primaryModel);
  const configuredFallbacks = process.env.GEMINI_AUDIO_FALLBACK_MODELS?.trim();
  if (configuredFallbacks?.toLowerCase() === "none") return [primary];

  const fallbackModels = configuredFallbacks
    ? configuredFallbacks
      .split(",")
      .map((model) => model.trim())
      .filter((model): model is GeminiAudioModelId => {
        if (!model) return false;
        if (isGeminiAudioModelId(model)) return true;
        console.warn(`[gemini] Ignoring unsupported fallback audio model "${model}"`);
        return false;
      })
    : DEFAULT_GEMINI_AUDIO_MODEL_CHAIN;

  return Array.from(new Set([primary, ...fallbackModels]));
}

function shouldFallbackGeminiAudioModel(error: unknown): boolean {
  if (error instanceof ApiError) {
    return ![400, 401, 403].includes(error.status);
  }
  if (!(error instanceof Error)) return true;
  // Authentication and malformed requests cannot be repaired by changing models.
  return !/\berror (?:400|401|403)\b/i.test(error.message);
}

function reportGeminiModelFallback(
  failedModel: GeminiAudioModelId,
  nextModel: GeminiAudioModelId,
  error: unknown,
): void {
  const reason = error instanceof Error ? error.message : String(error);
  console.warn(
    `[gemini] Audio inference failed with ${failedModel}; falling back to ${nextModel}: ${reason}`,
  );
}

export function getGeminiConfig() {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured");
  const model = normalizeConfiguredAudioModel(process.env.GEMINI_AUDIO_MODEL?.trim());
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
  const client = new GoogleGenAI({ apiKey });
  const models = getGeminiAudioModelCandidates(params.model ?? defaultModel);

  if (params.messages.length === 0) {
    throw new Error("At least one message is required.");
  }

  const contents: Content[] = params.messages.map((message, index) => {
    const parts: Part[] = [{ text: message.content }];
    if (index === 0 && message.role === "user") {
      parts.unshift({
        fileData: { mimeType: params.file.mimeType, fileUri: params.file.uri },
      });
    }
    return {
      role: message.role === "assistant" ? "model" : "user",
      parts,
    };
  });

  let lastError: unknown;
  for (let index = 0; index < models.length; index++) {
    const model = models[index]!;
    try {
      const label = `Gemini audio chat (${model})`;
      const response = await withGeminiServiceTierFallback(
        label,
        async (serviceTier) => {
          const result = await client.models.generateContent({
            model,
            contents,
            config: {
              serviceTier: toSdkServiceTier(serviceTier),
              httpOptions: getGeminiSdkHttpOptions(label),
            },
          });
          reportGeminiServiceTier(
            result.sdkHttpResponse?.headers,
            serviceTier,
            label,
          );
          return result;
        },
      );

      const text = response.text?.trim();

      if (!text) throw new Error("Gemini returned an empty chat response");
      return text;
    } catch (error) {
      lastError = error;
      const nextModel = models[index + 1];
      if (!nextModel || !shouldFallbackGeminiAudioModel(error)) throw error;
      reportGeminiModelFallback(model, nextModel, error);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Gemini audio chat failed across all configured models");
}

type GeminiAudioPart =
  | { fileData: { mimeType: string; fileUri: string } }
  | { inlineData: { mimeType: string; data: string } };

function buildAudioPart(
  uploaded: GeminiUploadedFile
): GeminiAudioPart {
  return { fileData: { mimeType: uploaded.mimeType, fileUri: uploaded.uri } };
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
  requestOptions?: GeminiRetryOptions;
}): Promise<{ value: T; model: GeminiAudioModelId }> {
  const { apiKey, model: defaultModel } = getGeminiConfig();
  const client = new GoogleGenAI({ apiKey });
  const models = getGeminiAudioModelCandidates(params.model ?? defaultModel);
  const mimeType = geminiMimeTypeForRecording(params.mimeType, params.fileName);

  const uploaded = params.uploadedFile
    ?? await uploadGeminiAudioFile(
      params.audioBuffer,
      mimeType,
      params.fileName ?? "recording"
    );

  const contents: Content[] = [{
    role: "user",
    parts: [
      { text: params.prompt },
      buildAudioPart(uploaded),
    ],
  }];

  let lastError: unknown;
  for (let index = 0; index < models.length; index++) {
    const model = models[index]!;
    try {
      const label = `Gemini generateContent (${model})`;
      const response = await withGeminiServiceTierFallback(
        label,
        async (serviceTier) => {
          const result = await client.models.generateContent({
            model,
            contents,
            config: {
              responseMimeType: "application/json",
              responseSchema: params.useResponseSchema === false ? undefined : params.schema,
              serviceTier: toSdkServiceTier(serviceTier),
              httpOptions: getGeminiSdkHttpOptions(label, params.requestOptions),
            },
          });
          reportGeminiServiceTier(
            result.sdkHttpResponse?.headers,
            serviceTier,
            label,
          );
          return result;
        },
      );

      const text = response.text?.trim();

      if (!text) throw new Error("Gemini returned an empty response");

      try {
        return { value: JSON.parse(text) as T, model };
      } catch {
        throw new Error(`Gemini response was not valid JSON: ${text.slice(0, 400)}`);
      }
    } catch (error) {
      lastError = error;
      const nextModel = models[index + 1];
      if (!nextModel || !shouldFallbackGeminiAudioModel(error)) throw error;
      reportGeminiModelFallback(model, nextModel, error);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Gemini audio inference failed across all configured models");
}

/** Parse MM:SS or HH:MM:SS timestamps from Gemini into seconds. */
export function parseGeminiTimestamp(value: string): number {
  const parts = value.trim().split(":").map((part) => Number(part));
  if (parts.some((part) => Number.isNaN(part))) return 0;
  if (parts.length === 2) return parts[0]! * 60 + parts[1]!;
  if (parts.length === 3) return parts[0]! * 3600 + parts[1]! * 60 + parts[2]!;
  return 0;
}
