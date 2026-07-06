import "server-only";

import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import {
  isWhisperSupportedExtension,
  mimeTypeForExtension,
  needsWhisperTranscode,
  resolveRecordingExtension,
} from "./recording-format";

const exec = promisify(execFile);

export type WhisperUpload = {
  buffer: Buffer;
  ext: string;
  mimeType: string;
};

/** Normalize recordings so Whisper receives a supported filename + container. */
export async function prepareWhisperUpload(
  audioBuffer: Buffer,
  mimeType: string,
  fileName?: string
): Promise<WhisperUpload> {
  const ext = resolveRecordingExtension(fileName, mimeType);

  if (!needsWhisperTranscode(ext)) {
    return {
      buffer: audioBuffer,
      ext,
      mimeType: mimeTypeForExtension(ext),
    };
  }

  return transcodeForWhisper(audioBuffer, ext);
}

async function transcodeForWhisper(audioBuffer: Buffer, ext: string): Promise<WhisperUpload> {
  const id = randomUUID();
  const inputPath = path.join(tmpdir(), `whisper-in-${id}.${ext}`);
  const outputPath = path.join(tmpdir(), `whisper-out-${id}.m4a`);

  await writeFile(inputPath, audioBuffer);

  try {
    await exec(
      "ffmpeg",
      ["-y", "-i", inputPath, "-vn", "-c:a", "aac", "-b:a", "128k", outputPath],
      { timeout: 120_000 }
    );

    const { readFile } = await import("node:fs/promises");
    const buffer = await readFile(outputPath);
    if (buffer.length === 0) {
      throw new Error("ffmpeg produced an empty audio file");
    }

    return { buffer, ext: "m4a", mimeType: "audio/mp4" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Recording format ".${ext}" is not supported by Whisper and ffmpeg conversion failed. ` +
        `Install ffmpeg or upload flac/m4a/mp3/mp4/wav/webm. (${message})`
    );
  } finally {
    await Promise.all([unlink(inputPath), unlink(outputPath)].map((p) => p.catch(() => undefined)));
  }
}

export function assertWhisperReady(upload: WhisperUpload): void {
  if (!isWhisperSupportedExtension(upload.ext)) {
    throw new Error(`Internal error: unsupported Whisper upload extension ".${upload.ext}"`);
  }
}
