import "server-only";

/** Extensions accepted by OpenAI Whisper's /v1/audio/transcriptions API. */
export const WHISPER_EXTENSIONS = new Set([
  "flac",
  "m4a",
  "mp3",
  "mp4",
  "mpeg",
  "mpga",
  "oga",
  "ogg",
  "wav",
  "webm",
]);

const EXT_MIME: Record<string, string> = {
  flac: "audio/flac",
  m4a: "audio/mp4",
  mp3: "audio/mpeg",
  mp4: "video/mp4",
  mpeg: "audio/mpeg",
  mpga: "audio/mpeg",
  oga: "audio/ogg",
  ogg: "audio/ogg",
  wav: "audio/wav",
  webm: "audio/webm",
  mov: "video/quicktime",
};

const MIME_EXT: Record<string, string> = {
  "audio/flac": "flac",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/mp4": "m4a",
  "audio/m4a": "m4a",
  "audio/x-m4a": "m4a",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/x-caf": "caf",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
};

export function extensionFromFileName(fileName?: string): string | null {
  const match = fileName?.match(/\.([a-z0-9]+)$/i);
  return match ? match[1]!.toLowerCase() : null;
}

export function extensionFromMimeType(mimeType: string): string | null {
  const normalized = mimeType.toLowerCase().split(";")[0]!.trim();
  if (MIME_EXT[normalized]) return MIME_EXT[normalized]!;

  if (normalized.includes("mpeg") || normalized.includes("mp3")) return "mp3";
  if (normalized.includes("m4a") || normalized.includes("mp4a")) return "m4a";
  if (normalized.includes("wav")) return "wav";
  if (normalized.includes("webm")) return "webm";
  if (normalized.includes("ogg")) return "ogg";
  if (normalized.includes("flac")) return "flac";
  if (normalized.includes("quicktime")) return "mov";
  if (normalized.includes("mp4")) return "mp4";

  return null;
}

/** Prefer the stored filename extension; fall back to MIME sniffing. */
export function resolveRecordingExtension(fileName?: string, mimeType?: string): string {
  return extensionFromFileName(fileName) ?? extensionFromMimeType(mimeType ?? "") ?? "mp3";
}

export function mimeTypeForExtension(ext: string): string {
  return EXT_MIME[ext] ?? "application/octet-stream";
}

export function isWhisperSupportedExtension(ext: string): boolean {
  return WHISPER_EXTENSIONS.has(ext.toLowerCase());
}

export function needsWhisperTranscode(ext: string): boolean {
  return !isWhisperSupportedExtension(ext);
}
