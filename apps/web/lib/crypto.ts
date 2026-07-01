import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

type EncryptedSecret = {
  alg: "aes-256-gcm";
  iv: string;
  tag: string;
  value: string;
};

function encryptionKey() {
  const source =
    process.env.ENTRATA_SECRET_ENCRYPTION_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!source) {
    throw new Error("Missing ENTRATA_SECRET_ENCRYPTION_KEY or SUPABASE_SERVICE_ROLE_KEY.");
  }

  return createHash("sha256").update(source).digest();
}

export function encryptSecret(value: string): EncryptedSecret {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    alg: "aes-256-gcm",
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    value: encrypted.toString("base64"),
  };
}

export function decryptSecret(secret: unknown): string {
  if (!secret || typeof secret !== "object") {
    throw new Error("Missing encrypted secret.");
  }

  const payload = secret as Partial<EncryptedSecret>;
  if (payload.alg !== "aes-256-gcm" || !payload.iv || !payload.tag || !payload.value) {
    throw new Error("Invalid encrypted secret payload.");
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(payload.iv, "base64")
  );
  decipher.setAuthTag(Buffer.from(payload.tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(payload.value, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
