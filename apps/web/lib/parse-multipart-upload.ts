import "server-only";

export async function parseMultipartUpload(request: Request): Promise<FormData> {
  const contentType = request.headers.get("content-type") ?? "";

  if (!contentType.includes("multipart/form-data")) {
    throw new UploadParseError(
      'Upload requires multipart/form-data with a file field named "file".',
      415
    );
  }

  if (!contentType.includes("boundary=")) {
    throw new UploadParseError(
      "Invalid multipart upload: missing boundary. Send FormData and do not set Content-Type manually.",
      400
    );
  }

  const contentLength = request.headers.get("content-length");
  if (contentLength === "0") {
    throw new UploadParseError("Upload body is empty.", 400);
  }

  try {
    return await request.formData();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to parse upload body.";
    throw new UploadParseError(message, 400);
  }
}

export class UploadParseError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "UploadParseError";
    this.status = status;
  }
}
