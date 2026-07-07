import type { SessionStatus } from "@tour/shared";

export const SESSION_PROCESSING_STATUSES: SessionStatus[] = [
  "uploaded",
  "transcribing",
  "segmenting",
  "analyzing",
];

export function isSessionProcessing(status: SessionStatus): boolean {
  return SESSION_PROCESSING_STATUSES.includes(status);
}

export async function waitForSessionProcessing(
  sessionId: string,
  options?: {
    intervalMs?: number;
    timeoutMs?: number;
    fetchSession?: () => Promise<{ status: SessionStatus; overallScore?: number | null }>;
  }
): Promise<{ status: SessionStatus; overallScore?: number | null }> {
  const intervalMs = options?.intervalMs ?? 3000;
  const timeoutMs = options?.timeoutMs ?? 15 * 60 * 1000;
  const started = Date.now();

  const fetchSession =
    options?.fetchSession ??
    (async () => {
      const res = await fetch(`/api/sessions/${sessionId}`, { cache: "no-store" });
      if (!res.ok) {
        throw new Error("Failed to check session status.");
      }
      const body = (await res.json()) as {
        session: { status: SessionStatus; overallScore?: number | null };
      };
      return body.session;
    });

  while (Date.now() - started < timeoutMs) {
    const session = await fetchSession();
    if (session.status === "analysis_ready" || session.status === "reviewed") {
      return session;
    }
    if (session.status === "failed") {
      throw new Error("Session processing failed.");
    }
    await sleep(intervalMs);
  }

  throw new Error("Processing timed out. Check back on the session page.");
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
