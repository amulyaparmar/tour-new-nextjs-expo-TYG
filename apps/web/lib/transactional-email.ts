import "server-only";

type TransactionalEmail = {
  to: string[];
  replyTo?: string | null;
  subject: string;
  html: string;
  text: string;
};

export async function sendTransactionalEmail(input: TransactionalEmail) {
  const workerUrl = process.env.TOUR_EMAIL_WORKER_URL?.trim();
  const workerToken = process.env.TOUR_EMAIL_WORKER_TOKEN?.trim();
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const apiToken = process.env.CLOUDFLARE_EMAIL_API_TOKEN?.trim();
  const fromAddress = process.env.CLOUDFLARE_EMAIL_FROM?.trim();
  const recipients = Array.from(new Set(input.to.map((email) => email.trim().toLowerCase()).filter(Boolean)));
  if (recipients.length === 0) return { configured: true, delivered: 0, failed: 0 };
  if (workerUrl && workerToken) {
    return sendWithEmailWorker(input, recipients, workerUrl, workerToken);
  }
  if (!accountId || !apiToken || !fromAddress) {
    return { configured: false, delivered: 0, failed: recipients.length };
  }

  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/email/sending/send`;
  const results = await Promise.allSettled(recipients.map(async (recipient) => {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: recipient,
        from: { address: fromAddress, name: "Tour" },
        reply_to: input.replyTo || undefined,
        subject: input.subject,
        html: input.html,
        text: input.text,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null) as { errors?: Array<{ message?: string }> } | null;
      throw new Error(body?.errors?.[0]?.message ?? `Email service returned ${response.status}.`);
    }
  }));
  const delivered = results.filter((result) => result.status === "fulfilled").length;
  return { configured: true, delivered, failed: recipients.length - delivered };
}

async function sendWithEmailWorker(
  input: TransactionalEmail,
  recipients: string[],
  workerUrl: string,
  workerToken: string
) {
  const results = await Promise.allSettled(recipients.map(async (recipient) => {
    const response = await fetch(workerUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${workerToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: recipient,
        replyTo: input.replyTo || undefined,
        subject: input.subject,
        html: input.html,
        text: input.text,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null) as { error?: string } | null;
      throw new Error(body?.error ?? `Email worker returned ${response.status}.`);
    }
  }));
  const delivered = results.filter((result) => result.status === "fulfilled").length;
  return { configured: true, delivered, failed: recipients.length - delivered };
}
