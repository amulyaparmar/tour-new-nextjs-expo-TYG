import type { PresignedUploadInfo, UploadProgressCallback } from "@tour/shared";

type JsonRequestInit = RequestInit & { json?: Record<string, unknown> };

async function requestJson<T>(url: string, init: JsonRequestInit = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  const response = await fetch(url, {
    ...rest,
    headers: {
      ...(json ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: json ? JSON.stringify(json) : init.body,
    credentials: init.credentials ?? "include",
  });

  const body = await response.json().catch(() => null) as { error?: string } | null;
  if (!response.ok) {
    throw new Error(body?.error ?? `Request failed (${response.status}).`);
  }
  return body as T;
}

function putWithProgress(
  signedUrl: string,
  file: Blob,
  contentType: string,
  onProgress?: UploadProgressCallback
): Promise<void> {
  if (!onProgress) {
    return fetch(signedUrl, {
      method: "PUT",
      body: file,
      headers: { "Content-Type": contentType },
    }).then((response) => {
      if (!response.ok) {
        throw new Error(`Direct upload failed (${response.status}).`);
      }
    });
  }

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", signedUrl);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Direct upload failed (${xhr.status}).`));
    };
    xhr.onerror = () => reject(new Error("Network error during upload."));
    xhr.send(file);
  });
}

export async function presignAndPutFile(options: {
  presignUrl: string;
  file: Blob;
  contentType: string;
  presignBody: Record<string, unknown>;
  onProgress?: UploadProgressCallback;
  credentials?: RequestCredentials;
}): Promise<PresignedUploadInfo> {
  const presign = await requestJson<PresignedUploadInfo>(options.presignUrl, {
    method: "POST",
    json: options.presignBody,
    credentials: options.credentials,
  });

  await putWithProgress(presign.signedUrl, options.file, options.contentType, options.onProgress);
  return presign;
}

export async function uploadFileWithPresign<TComplete>(options: {
  presignUrl: string;
  completeUrl: string;
  file: Blob;
  contentType: string;
  presignBody: Record<string, unknown>;
  completeBody?: (presign: PresignedUploadInfo) => Record<string, unknown>;
  onProgress?: UploadProgressCallback;
  credentials?: RequestCredentials;
}): Promise<TComplete> {
  const presign = await presignAndPutFile({
    presignUrl: options.presignUrl,
    file: options.file,
    contentType: options.contentType,
    presignBody: options.presignBody,
    onProgress: options.onProgress,
    credentials: options.credentials,
  });

  return requestJson<TComplete>(options.completeUrl, {
    method: "POST",
    json: {
      objectKey: presign.objectKey,
      token: presign.token,
      contentType: options.contentType,
      ...(options.completeBody?.(presign) ?? {}),
    },
    credentials: options.credentials,
  });
}

function fallbackDurationFromSize(file: Blob, contentType: string): number | null {
  if (!file.size || file.size <= 0) return null;
  const lowerType = contentType.toLowerCase();
  const assumedBitsPerSecond = lowerType.startsWith("audio/")
    ? 128_000
    : lowerType.startsWith("video/")
      ? 2_500_000
      : 0;
  if (!assumedBitsPerSecond) return null;
  const seconds = Math.round((file.size * 8) / assumedBitsPerSecond);
  return Number.isFinite(seconds) && seconds > 0 ? Math.max(1, seconds) : null;
}

export async function detectMediaDurationSeconds(file: Blob): Promise<number | null> {
  const contentType = file.type || "application/octet-stream";
  const lowerType = contentType.toLowerCase();
  const sizeFallback = fallbackDurationFromSize(file, contentType);
  if (typeof document === "undefined") return sizeFallback;
  if (!lowerType.startsWith("audio/") && !lowerType.startsWith("video/")) return sizeFallback;

  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const media = lowerType.startsWith("video/")
      ? document.createElement("video")
      : document.createElement("audio");
    let settled = false;

    const finish = (duration: number | null) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      media.removeAttribute("src");
      media.load();
      resolve(duration && Number.isFinite(duration) && duration > 0 ? Math.round(duration) : sizeFallback);
    };

    const timeout = window.setTimeout(() => finish(null), 7000);
    media.preload = "metadata";
    media.onloadedmetadata = () => {
      window.clearTimeout(timeout);
      finish(media.duration);
    };
    media.onerror = () => {
      window.clearTimeout(timeout);
      finish(null);
    };
    media.src = url;
  });
}

export async function uploadFileForRubricExtract<T>(file: File): Promise<T> {
  const presign = await presignAndPutFile({
    presignUrl: "/api/admin/rubrics/extract/presign",
    file,
    contentType: file.type || "application/octet-stream",
    presignBody: {
      fileName: file.name,
      contentType: file.type || "application/octet-stream",
    },
  });

  return requestJson<T>("/api/admin/rubrics/extract", {
    method: "POST",
    json: {
      objectKey: presign.objectKey,
      fileName: file.name,
    },
  });
}
