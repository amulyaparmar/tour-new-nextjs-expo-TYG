import "server-only";

const GEMINI_BASE = "https://generativelanguage.googleapis.com";
const GEMINI_UPLOAD_BASE = "https://generativelanguage.googleapis.com/upload";
const INLINE_AUDIO_MAX_BYTES = 20 * 1024 * 1024;

export type GeminiUploadedFile = {
  uri: string;
  mimeType: string;
  name?: string;
};

export function getGeminiConfig() {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured");
  const model = process.env.GEMINI_AUDIO_MODEL?.trim() || "gemini-2.5-flash";
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
  const startResponse = await fetch(`${GEMINI_UPLOAD_BASE}/v1beta/files`, {
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
  });

  if (!startResponse.ok) {
    const errText = await startResponse.text();
    throw new Error(`Gemini file upload start error ${startResponse.status}: ${errText}`);
  }

  const uploadUrl = startResponse.headers.get("x-goog-upload-url");
  if (!uploadUrl) throw new Error("Gemini file upload did not return x-goog-upload-url");

  const uploadResponse = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Length": String(buffer.length),
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
    },
    body: new Uint8Array(buffer),
  });

  if (!uploadResponse.ok) {
    const errText = await uploadResponse.text();
    throw new Error(`Gemini file upload finalize error ${uploadResponse.status}: ${errText}`);
  }

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

type GeminiAudioPart =
  | { file_data: { mime_type: string; file_uri: string } }
  | { inline_data: { mime_type: string; data: string } };

function buildAudioPart(
  buffer: Buffer,
  mimeType: string,
  uploaded?: GeminiUploadedFile
): GeminiAudioPart {
  if (uploaded) {
    return { file_data: { mime_type: uploaded.mimeType, file_uri: uploaded.uri } };
  }
  return {
    inline_data: {
      mime_type: mimeType,
      data: buffer.toString("base64"),
    },
  };
}

export async function geminiGenerateJson<T>(params: {
  prompt: string;
  schema: Record<string, unknown>;
  audioBuffer: Buffer;
  mimeType: string;
  fileName?: string;
  model?: string;
}): Promise<T> {
  const { apiKey, model: defaultModel } = getGeminiConfig();
  const model = params.model ?? defaultModel;
  const mimeType = geminiMimeTypeForRecording(params.mimeType, params.fileName);

  const uploaded = params.audioBuffer.length > INLINE_AUDIO_MAX_BYTES
    ? await uploadGeminiFile(params.audioBuffer, mimeType, params.fileName ?? "recording")
    : undefined;

  const body = {
    contents: [
      {
        parts: [
          { text: params.prompt },
          buildAudioPart(params.audioBuffer, mimeType, uploaded),
        ],
      },
    ],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: params.schema,
    },
  };

  const response = await fetch(
    `${GEMINI_BASE}/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify(body),
    }
  );

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini generateContent error ${response.status}: ${errText}`);
  }

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
