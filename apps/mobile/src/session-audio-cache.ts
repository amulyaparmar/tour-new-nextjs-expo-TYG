import { Directory, File, Paths } from "expo-file-system";

import { getRecordingSignedPlaybackUrl } from "./api";

const CACHE_DIR_NAME = "audio-cache";

function cacheDir(): Directory {
  const dir = new Directory(Paths.document, CACHE_DIR_NAME);
  if (!dir.exists) {
    dir.create({ intermediates: true, idempotent: true });
  }
  return dir;
}

function cacheFile(sessionId: string, ext = "m4a"): File {
  return new File(cacheDir(), `${sessionId}.${ext}`);
}

/** Returns a local file:// URI if the session recording is already cached. */
export function getCachedRecordingUri(sessionId: string): string | null {
  try {
    for (const ext of ["m4a", "mp4", "mp3", "wav", "webm"]) {
      const file = cacheFile(sessionId, ext);
      if (file.exists && file.size > 0) return file.uri;
    }
    return null;
  } catch {
    return null;
  }
}

/** Download a remote recording into durable Documents cache. */
export async function cacheRecordingFromUrl(
  sessionId: string,
  url: string,
  ext = "m4a",
): Promise<string | null> {
  try {
    const destination = cacheFile(sessionId, ext);
    const downloaded = await File.downloadFileAsync(url, destination, { idempotent: true });
    return downloaded.exists && downloaded.size > 0 ? downloaded.uri : null;
  } catch {
    return null;
  }
}

/** Copy an already-local recording into the playback cache (e.g. after upload). */
export function promoteLocalRecordingToCache(
  sessionId: string,
  localUri: string,
  ext = "m4a",
): string | null {
  try {
    const source = new File(localUri);
    if (!source.exists) return null;
    const destination = cacheFile(sessionId, ext);
    if (destination.exists) {
      try {
        destination.delete();
      } catch {
        // overwrite via copy below if delete fails
      }
    }
    source.copy(destination);
    return destination.exists ? destination.uri : null;
  } catch {
    return null;
  }
}

export function clearCachedRecording(sessionId: string): void {
  try {
    for (const ext of ["m4a", "mp4", "mp3", "wav", "webm"]) {
      const file = cacheFile(sessionId, ext);
      if (file.exists) file.delete();
    }
  } catch {
    // Best-effort cleanup.
  }
}

/** Prefer local cache, otherwise a fresh signed URL (progressive). */
export async function resolveSessionPlaybackUri(
  sessionId: string,
): Promise<{ uri: string; fromCache: boolean }> {
  const cached = getCachedRecordingUri(sessionId);
  if (cached) return { uri: cached, fromCache: true };

  const { signedUrl } = await getRecordingSignedPlaybackUrl(sessionId);
  void cacheRecordingFromUrl(sessionId, signedUrl).catch(() => {});
  return { uri: signedUrl, fromCache: false };
}
