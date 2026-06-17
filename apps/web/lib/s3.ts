import "server-only";

import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";

/**
 * Generic S3 helper backed by IAM credentials. Used today to stage audio for AWS
 * Transcribe and read back the transcript JSON; written generically so it can
 * also become the primary recordings store later.
 *
 * Env: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION.
 */

let client: S3Client | null = null;

export function getS3Client(): S3Client {
  if (client) return client;

  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  const region = process.env.AWS_REGION || "us-east-1";

  if (!accessKeyId || !secretAccessKey) {
    throw new Error("AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY are not configured");
  }

  client = new S3Client({ region, credentials: { accessKeyId, secretAccessKey } });
  return client;
}

export async function putObject(
  bucket: string,
  key: string,
  body: Buffer | Uint8Array,
  contentType?: string
): Promise<string> {
  await getS3Client().send(
    new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ...(contentType ? { ContentType: contentType } : {}) })
  );
  return `s3://${bucket}/${key}`;
}

export async function getObjectText(bucket: string, key: string): Promise<string> {
  const res = await getS3Client().send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!res.Body) throw new Error(`S3 object ${bucket}/${key} has no body`);
  // Node.js stream → string
  return await (res.Body as { transformToString: () => Promise<string> }).transformToString();
}
