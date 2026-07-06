export type PresignedUploadInfo = {
  signedUrl: string;
  token: string;
  path: string;
  objectKey: string;
};

export type UploadProgressCallback = (percent: number) => void;

/** PUT file bytes to a Supabase signed upload URL. */
export async function putFileToSignedUrl(
  signedUrl: string,
  body: Blob,
  contentType: string
): Promise<void> {
  const response = await fetch(signedUrl, {
    method: "PUT",
    body,
    headers: { "Content-Type": contentType },
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(detail.trim() || `Direct upload failed (${response.status}).`);
  }
}

export async function uploadViaPresignedFlow<TComplete>(options: {
  file: Blob;
  contentType: string;
  requestPresign: () => Promise<PresignedUploadInfo>;
  requestComplete: (presign: PresignedUploadInfo) => Promise<TComplete>;
}): Promise<TComplete> {
  const presign = await options.requestPresign();
  await putFileToSignedUrl(presign.signedUrl, options.file, options.contentType);
  return options.requestComplete(presign);
}
