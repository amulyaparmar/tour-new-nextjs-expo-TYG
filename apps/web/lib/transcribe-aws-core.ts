import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import {
  GetTranscriptionJobCommand,
  StartTranscriptionJobCommand,
  TranscribeClient,
  type LanguageCode,
  type MediaFormat
} from "@aws-sdk/client-transcribe";

import type { TranscriptSegment } from "./transcribe";

/**
 * AWS Transcribe batch + ShowSpeakerLabels. Keeps audio inside AWS (pairs with
 * Bedrock analysis). Transcribe reads only from S3, so we stage the audio buffer
 * to S3 first. The job is async; we poll to completion.
 */
export async function transcribeWithAws(
  sessionId: string,
  audioBuffer: Buffer,
  mimeType: string
): Promise<TranscriptSegment[]> {
  const bucket = process.env.TRANSCRIBE_S3_BUCKET;
  if (!bucket) throw new Error("TRANSCRIBE_S3_BUCKET is not configured");
  if (audioBuffer.length === 0) throw new Error("Empty audio buffer");

  const region = process.env.AWS_REGION || "us-east-1";
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  if (!accessKeyId || !secretAccessKey) {
    throw new Error("AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY are not configured");
  }

  const mediaFormat = toMediaFormat(mimeType);
  const audioKey = `transcribe-input/${sessionId}.${mediaFormat}`;
  const outputKey = `transcribe-output/${sessionId}.json`;
  const credentials = { accessKeyId, secretAccessKey };

  const s3 = new S3Client({ region, credentials });
  const transcribe = new TranscribeClient({ region, credentials });

  await putObject(s3, bucket, audioKey, audioBuffer, mimeType);

  const jobName = `tour-${sessionId}-${Date.now()}`;
  const languageCode = process.env.TRANSCRIBE_LANGUAGE_CODE;

  await transcribe.send(
    new StartTranscriptionJobCommand({
      TranscriptionJobName: jobName,
      ...(languageCode
        ? { LanguageCode: languageCode as LanguageCode }
        : { IdentifyLanguage: true }),
      MediaFormat: mediaFormat,
      Media: { MediaFileUri: `s3://${bucket}/${audioKey}` },
      OutputBucketName: bucket,
      OutputKey: outputKey,
      Settings: { ShowSpeakerLabels: true, MaxSpeakerLabels: 4 }
    })
  );

  const transcriptJson = await pollJob(transcribe, s3, jobName, bucket, outputKey);
  const segments = parseTranscript(sessionId, transcriptJson);
  if (!segments.length) throw new Error("Transcribe returned no speech segments");
  return segments;
}

async function putObject(
  s3: S3Client,
  bucket: string,
  key: string,
  body: Buffer | Uint8Array,
  contentType?: string
): Promise<void> {
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ...(contentType ? { ContentType: contentType } : {})
    })
  );
}

async function getObjectText(s3: S3Client, bucket: string, key: string): Promise<string> {
  const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!res.Body) throw new Error(`S3 object ${bucket}/${key} has no body`);
  return await res.Body.transformToString();
}

async function pollJob(
  transcribe: TranscribeClient,
  s3: S3Client,
  jobName: string,
  bucket: string,
  outputKey: string
): Promise<TranscribeOutput> {
  const pollIntervalMs = Number(process.env.TRANSCRIBE_POLL_INTERVAL_MS || 5000);
  const maxAttempts = Number(process.env.TRANSCRIBE_MAX_POLL_ATTEMPTS || 150);

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const { TranscriptionJob } = await transcribe.send(
      new GetTranscriptionJobCommand({ TranscriptionJobName: jobName })
    );
    const status = TranscriptionJob?.TranscriptionJobStatus;

    if (status === "COMPLETED") {
      const text = await getObjectText(s3, bucket, outputKey);
      return JSON.parse(text) as TranscribeOutput;
    }
    if (status === "FAILED") {
      throw new Error(`Transcribe job failed: ${TranscriptionJob?.FailureReason ?? "unknown"}`);
    }

    await sleep(pollIntervalMs);
  }

  throw new Error("Transcribe job timed out");
}

type TranscribeItem = {
  type: "pronunciation" | "punctuation";
  start_time?: string;
  end_time?: string;
  alternatives: Array<{ content: string; confidence?: string }>;
};

type SpeakerSegment = {
  start_time: string;
  end_time: string;
  speaker_label: string;
  items: Array<{ start_time: string; end_time: string; speaker_label: string }>;
};

export type TranscribeOutput = {
  results?: {
    transcripts?: Array<{ transcript?: string }>;
    items?: TranscribeItem[];
    speaker_labels?: { speakers?: number; segments?: SpeakerSegment[] };
  };
};

/**
 * Merge words with speaker label segments into speaker-grouped turns.
 * Punctuation has no timestamp, so it inherits the previous word's speaker.
 */
export function parseTranscript(sessionId: string, output: TranscribeOutput): TranscriptSegment[] {
  const items = output.results?.items ?? [];
  const speakerSegments = output.results?.speaker_labels?.segments ?? [];

  const speakerByStart = new Map<string, string>();
  for (const seg of speakerSegments) {
    for (const it of seg.items) {
      speakerByStart.set(it.start_time, it.speaker_label);
    }
  }

  type Turn = { speaker: string; start: number; end: number; words: string[] };
  const turns: Turn[] = [];
  let lastSpeaker = "spk_0";

  for (const item of items) {
    const content = item.alternatives[0]?.content ?? "";
    if (!content) continue;

    if (item.type === "punctuation") {
      const turn = turns[turns.length - 1];
      if (turn) turn.words.push(content);
      continue;
    }

    const speaker = (item.start_time && speakerByStart.get(item.start_time)) || lastSpeaker;
    lastSpeaker = speaker;
    const start = Number(item.start_time ?? 0);
    const end = Number(item.end_time ?? start);

    const current = turns[turns.length - 1];
    if (current && current.speaker === speaker) {
      current.words.push(content);
      current.end = end;
    } else {
      turns.push({ speaker, start, end, words: [content] });
    }
  }

  const labels = labelSpeakers(turns);

  return turns.map((turn, i) => ({
    id: `${sessionId}-t${i}`,
    speaker: labels.get(turn.speaker) ?? turn.speaker,
    startTime: Math.round(turn.start),
    endTime: Math.round(turn.end),
    text: joinWords(turn.words)
  }));
}

function joinWords(words: string[]): string {
  return words
    .reduce((acc, w) => {
      if (/^[.,!?;:]+$/.test(w)) return acc + w;
      return acc ? `${acc} ${w}` : w;
    }, "")
    .trim();
}

function labelSpeakers(turns: Array<{ speaker: string; start: number; end: number }>): Map<string, string> {
  const talkTime = new Map<string, number>();
  for (const t of turns) {
    talkTime.set(t.speaker, (talkTime.get(t.speaker) ?? 0) + Math.max(0, t.end - t.start));
  }

  const ranked = [...talkTime.entries()].sort((a, b) => b[1] - a[1]).map(([speaker]) => speaker);

  const labels = new Map<string, string>();
  ranked.forEach((speaker, rank) => {
    if (rank === 0) labels.set(speaker, "Agent");
    else if (rank === 1) labels.set(speaker, "Prospect");
    else labels.set(speaker, `Speaker ${rank + 1}`);
  });
  return labels;
}

export function toMediaFormat(mimeType: string): MediaFormat {
  const m = mimeType.toLowerCase();
  if (m.includes("mp4") && m.includes("audio")) return "mp4";
  if (m.includes("m4a") || m.includes("mp4a")) return "m4a";
  if (m.includes("mp4")) return "mp4";
  if (m.includes("webm")) return "webm";
  if (m.includes("wav")) return "wav";
  if (m.includes("ogg")) return "ogg";
  if (m.includes("flac")) return "flac";
  if (m.includes("amr")) return "amr";
  return "mp3";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
