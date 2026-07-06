import type { PresignedUploadInfo } from "@tour/shared";
import { putFileToSignedUrl } from "@tour/shared";

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

export async function uploadLocalFileWithPresign<TComplete>(options: {
  authenticatedFetch: AuthenticatedFetch;
  presignPath: string;
  completePath: string;
  fileUri: string;
  mimeType: string;
  fileName: string;
  presignBody?: Record<string, unknown>;
  completeBody?: (presign: PresignedUploadInfo) => Record<string, unknown>;
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

  await putFileToSignedUrl(presign.signedUrl, file, options.mimeType);

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
