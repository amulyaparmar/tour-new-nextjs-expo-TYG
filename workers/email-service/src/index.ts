type SendRequest = {
  to?: unknown;
  replyTo?: unknown;
  subject?: unknown;
  html?: unknown;
  text?: unknown;
};

type WorkerEnv = Cloudflare.Env & {
  SERVICE_TOKEN: string;
};

export default {
  async fetch(request, env): Promise<Response> {
    if (request.method === "GET") {
      return Response.json({ ok: true, service: "tour-email-service", sender: env.FROM_ADDRESS });
    }
    if (request.method !== "POST") {
      return Response.json({ error: "Method not allowed." }, { status: 405 });
    }

    const authorization = request.headers.get("authorization");
    if (!env.SERVICE_TOKEN || authorization !== `Bearer ${env.SERVICE_TOKEN}`) {
      return Response.json({ error: "Unauthorized." }, { status: 401 });
    }

    const body = await request.json<SendRequest>().catch(() => null);
    const to = cleanString(body?.to).toLowerCase();
    const replyTo = cleanString(body?.replyTo).toLowerCase();
    const subject = cleanString(body?.subject);
    const html = typeof body?.html === "string" ? body.html : "";
    const text = typeof body?.text === "string" ? body.text : "";

    if (!isEmail(to) || !subject || (!html && !text)) {
      return Response.json({ error: "A recipient, subject, and email body are required." }, { status: 400 });
    }
    if (replyTo && !isEmail(replyTo)) {
      return Response.json({ error: "The reply-to address is invalid." }, { status: 400 });
    }

    try {
      const result = await env.EMAIL.send({
        to,
        from: { email: env.FROM_ADDRESS, name: env.FROM_NAME },
        replyTo: replyTo || undefined,
        subject: subject.slice(0, 998),
        html: html || undefined,
        text: text || undefined,
      });
      return Response.json({ ok: true, messageId: result.messageId });
    } catch (caught) {
      const error = caught as Error & { code?: string };
      console.error("Email send failed", { code: error.code, message: error.message });
      return Response.json(
        { error: "Email delivery failed.", code: error.code ?? "E_DELIVERY_FAILED" },
        { status: retryableEmailError(error.code) ? 503 : 400 }
      );
    }
  },
} satisfies ExportedHandler<WorkerEnv>;

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function retryableEmailError(code: string | undefined) {
  return ["E_RATE_LIMIT_EXCEEDED", "E_DELIVERY_FAILED", "E_INTERNAL_SERVER_ERROR"].includes(code ?? "");
}
