import type { PresignedUploadInfo } from "@tour/shared";
import { putFileToSignedUrl } from "@tour/shared";

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

export async function uploadFileWithPresign<TComplete>(options: {
  presignUrl: string;
  completeUrl: string;
  file: Blob;
  contentType: string;
  presignBody: Record<string, unknown>;
  completeBody?: (presign: PresignedUploadInfo) => Record<string, unknown>;
  credentials?: RequestCredentials;
}): Promise<TComplete> {
  const presign = await requestJson<PresignedUploadInfo>(options.presignUrl, {
    method: "POST",
    json: options.presignBody,
    credentials: options.credentials,
  });

  await putFileToSignedUrl(presign.signedUrl, options.file, options.contentType);

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

export async function uploadFileForRubricExtract<T>(options: {
  apiUrl: (path: string) => string;
  file: File;
}): Promise<T> {
  const contentType = options.file.type || "application/octet-stream";
  const presign = await requestJson<PresignedUploadInfo>(
    options.apiUrl("/api/admin/rubrics/extract/presign"),
    {
      method: "POST",
      json: {
        fileName: options.file.name,
        contentType,
      },
    }
  );

  await putFileToSignedUrl(presign.signedUrl, options.file, contentType);

  return requestJson<T>(options.apiUrl("/api/admin/rubrics/extract"), {
    method: "POST",
    json: {
      objectKey: presign.objectKey,
      fileName: options.file.name,
    },
  });
}
