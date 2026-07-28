import { authenticatedFetch } from "./auth";
import { appendLocalFile } from "./uploadFormData";

export async function transcribeDictation(fileUri: string): Promise<string> {
  const formData = new FormData();
  await appendLocalFile(formData, "file", fileUri, "audio/mp4", "dictation.m4a");

  const response = await authenticatedFetch("/api/dictation", {
    method: "POST",
    body: formData,
  });
  const body = (await response.json().catch(() => null)) as {
    text?: string;
    error?: string;
  } | null;

  if (!response.ok || !body?.text?.trim()) {
    throw new Error(body?.error || "Dictation could not be transcribed.");
  }

  return body.text.trim();
}
