import type { PresignedUploadInfo } from "@tour/shared";
import {
  createUploadTask,
  FileSystemUploadType,
  getInfoAsync,
} from "expo-file-system/legacy";
import { Platform } from "react-native";

export type UploadProgressInfo = {
  loaded: number;
  total: number;
  percent: number;
  bytesPerSecond: number | null;
  etaSeconds: number | null;
};

type AuthenticatedFetch = (
  path: string,
  init?: RequestInit
) => Promise<Response>;

function progressFromBytes(
  loaded: number,
  total: number,
  startedAt: number
): UploadProgressInfo {
  const elapsedSeconds = Math.max((Date.now() - startedAt) / 1000, 0.1);
  const bytesPerSecond = loaded > 0 ? loaded / elapsedSeconds : null;
  const remaining = Math.max(total - loaded, 0);
  return {
    loaded,
    total,
    percent: total > 0 ? Math.round((loaded / total) * 100) : 0,
    bytesPerSecond,
    etaSeconds: bytesPerSecond && bytesPerSecond > 0 ? remaining / bytesPerSecond : null,
  };
}

async function resolveLocalUploadFile(fileUri: string): Promise<{ uri: string; size: number }> {
  const candidates = [fileUri];
  if (fileUri.startsWith("file://")) {
    try {
      candidates.push(decodeURI(fileUri));
    } catch {
      // keep original only
    }
  } else if (fileUri.startsWith("/")) {
    candidates.push(`file://${fileUri}`);
  }

  // Recorder may still be flushing to disk right after stop.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    for (const candidate of candidates) {
      try {
        const info = await getInfoAsync(candidate);
        if (info.exists && "size" in info && typeof info.size === "number" && info.size > 0) {
          return { uri: candidate, size: info.size };
        }
      } catch {
        // try next candidate
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 200 * (attempt + 1)));
  }

  throw new Error("Recording file is missing on device. Record again or pick another file.");
}

async function readUploadBodyWeb(
  fileUri: string,
  mimeType: string
): Promise<Blob> {
  const response = await fetch(fileUri);
  if (!response.ok) {
    throw new Error("Could not read the selected file for upload.");
  }
  const blob = await response.blob();
  if (blob.type) return blob;
  return new Blob([await blob.arrayBuffer()], { type: mimeType });
}

async function requestJson<T>(
  authenticatedFetch: AuthenticatedFetch,
  path: string,
  body: Record<string, unknown>
): Promise<T> {
  const response = await authenticatedFetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const parsed = await response.json().catch(() => null) as { error?: string } | null;
  if (!response.ok) {
    throw new Error(parsed?.error ?? `Request failed (${response.status}).`);
  }
  return parsed as T;
}

/** Native: stream file URI straight to the signed URL (no JS Blob read). */
async function putLocalFileUriToSignedUrl(
  signedUrl: string,
  fileUri: string,
  contentType: string,
  totalBytes: number,
  onProgress?: (progress: UploadProgressInfo) => void
): Promise<void> {
  const startedAt = Date.now();
  const task = createUploadTask(
    signedUrl,
    fileUri,
    {
      httpMethod: "PUT",
      uploadType: FileSystemUploadType.BINARY_CONTENT,
      headers: { "Content-Type": contentType },
    },
    (event) => {
      if (!onProgress) return;
      onProgress(progressFromBytes(event.totalBytesSent, event.totalBytesExpectedToSend || totalBytes, startedAt));
    }
  );

  const result = await task.uploadAsync();
  if (!result || result.status < 200 || result.status >= 300) {
    throw new Error(
      result?.body?.trim()
        || `Direct upload failed (${result?.status ?? "no response"}).`
    );
  }
  onProgress?.({
    loaded: totalBytes,
    total: totalBytes,
    percent: 100,
    bytesPerSecond: null,
    etaSeconds: 0,
  });
}

function putBlobToSignedUrl(
  signedUrl: string,
  body: Blob,
  contentType: string,
  onProgress?: (progress: UploadProgressInfo) => void
): Promise<void> {
  if (!onProgress) {
    return fetch(signedUrl, {
      method: "PUT",
      body,
      headers: { "Content-Type": contentType },
    }).then(async (response) => {
      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(detail.trim() || `Direct upload failed (${response.status}).`);
      }
    });
  }

  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", signedUrl);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (event) => {
      const total = event.lengthComputable ? event.total : body.size;
      onProgress(progressFromBytes(event.loaded, total, startedAt));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress({
          loaded: body.size,
          total: body.size,
          percent: 100,
          bytesPerSecond: null,
          etaSeconds: 0,
        });
        resolve();
      } else {
        reject(new Error(xhr.responseText?.trim() || `Direct upload failed (${xhr.status}).`));
      }
    };
    xhr.onerror = () => reject(new Error("Network error during upload."));
    xhr.ontimeout = () => reject(new Error("Upload timed out."));
    xhr.send(body);
  });
}

export async function uploadLocalFileWithPresign<TComplete>(options: {
  authenticatedFetch: AuthenticatedFetch;
  presignPath: string;
  completePath: string;
  fileUri: string;
  mimeType: string;
  fileName: string;
  presignBody?: Record<string, unknown>;
  completeBody?: (presign: PresignedUploadInfo) => Record<string, unknown>;
  onProgress?: (progress: UploadProgressInfo) => void;
}): Promise<TComplete> {
  let fileUri = options.fileUri?.trim();
  if (!fileUri) {
    throw new Error("Recording file is missing on device. Record again or pick another file.");
  }
  if (!fileUri.includes("://") && fileUri.startsWith("/")) {
    fileUri = `file://${fileUri}`;
  }

  let resolvedUri = fileUri;
  let totalBytes = 0;
  if (Platform.OS !== "web") {
    try {
      const local = await resolveLocalUploadFile(fileUri);
      resolvedUri = local.uri;
      totalBytes = local.size;
    } catch (caught) {
      console.warn("[upload] local file resolve failed", { fileUri, caught });
      throw caught;
    }
  }

  let presign: PresignedUploadInfo;
  try {
    presign = await requestJson<PresignedUploadInfo>(
      options.authenticatedFetch,
      options.presignPath,
      {
        fileName: options.fileName,
        contentType: options.mimeType,
        ...(options.presignBody ?? {}),
      }
    );
  } catch (caught) {
    const detail = caught instanceof Error ? caught.message : "presign failed";
    throw new Error(`Could not prepare upload: ${detail}`);
  }

  try {
    if (Platform.OS === "web") {
      const body = await readUploadBodyWeb(resolvedUri, options.mimeType);
      await putBlobToSignedUrl(presign.signedUrl, body, options.mimeType, options.onProgress);
    } else {
      await putLocalFileUriToSignedUrl(
        presign.signedUrl,
        resolvedUri,
        options.mimeType,
        totalBytes,
        options.onProgress
      );
    }
  } catch (caught) {
    const detail = caught instanceof Error ? caught.message : "upload failed";
    throw new Error(`Could not upload recording: ${detail}`);
  }

  try {
    return await requestJson<TComplete>(
      options.authenticatedFetch,
      options.completePath,
      {
        objectKey: presign.objectKey,
        token: presign.token,
        contentType: options.mimeType,
        fileName: options.fileName,
        ...(options.completeBody?.(presign) ?? {}),
      }
    );
  } catch (caught) {
    const detail = caught instanceof Error ? caught.message : "finalize failed";
    throw new Error(`Upload finished but could not finalize: ${detail}`);
  }
}
