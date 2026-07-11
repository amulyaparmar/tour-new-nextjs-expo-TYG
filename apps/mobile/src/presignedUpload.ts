import type { PresignedUploadInfo } from "@tour/shared";

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

async function readUploadBody(
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

function putFileToSignedUrl(
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
      const loaded = event.loaded;
      const elapsedSeconds = Math.max((Date.now() - startedAt) / 1000, 0.1);
      const bytesPerSecond = loaded > 0 ? loaded / elapsedSeconds : null;
      const remaining = Math.max(total - loaded, 0);
      onProgress({
        loaded,
        total,
        percent: total > 0 ? Math.round((loaded / total) * 100) : 0,
        bytesPerSecond,
        etaSeconds: bytesPerSecond && bytesPerSecond > 0 ? remaining / bytesPerSecond : null,
      });
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
  const file = await readUploadBody(options.fileUri, options.mimeType);
  const presign = await requestJson<PresignedUploadInfo>(
    options.authenticatedFetch,
    options.presignPath,
    {
      fileName: options.fileName,
      contentType: options.mimeType,
      ...(options.presignBody ?? {}),
    }
  );

  await putFileToSignedUrl(presign.signedUrl, file, options.mimeType, options.onProgress);

  return requestJson<TComplete>(
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
}
