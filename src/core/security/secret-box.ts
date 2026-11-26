import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { resolveBetterAuthSecret } from "@/core/auth/auth-config";

/**
 * Encryption at rest for stored credentials (e.g. a business's SMTP password).
 *
 * AES-256-GCM with a key derived (HKDF-SHA256) from BETTER_AUTH_SECRET, so no
 * new secret has to be provisioned. Stored form: `enc:v1:<base64 iv|tag|data>`.
 * Values without the prefix are legacy plaintext and are returned as-is so
 * existing rows keep working until they are re-saved.
 *
 * If BETTER_AUTH_SECRET changes (or a backup is restored on an instance with a
 * different secret), stored values can no longer be decrypted: `openSecret`
 * returns null and the user re-enters the credential.
 */
const PREFIX = "enc:v1:";
const IV_BYTES = 12;
const TAG_BYTES = 16;

let cachedKey: { secret: string; key: Buffer } | null = null;

function encryptionKey() {
  const secret = resolveBetterAuthSecret();
  if (cachedKey?.secret !== secret) {
    const key = Buffer.from(hkdfSync("sha256", secret, "modern-erp", "stored-credentials:v1", 32));
    cachedKey = { secret, key };
  }
  return cachedKey.key;
}

export function isSealedSecret(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(PREFIX);
}

/** Encrypts a credential for storage. Null/empty stays null; already-sealed values are kept. */
export function sealSecret(plaintext: string | null | undefined): string | null {
  if (plaintext === null || plaintext === undefined || plaintext === "") return null;
  if (isSealedSecret(plaintext)) return plaintext;
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const data = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64");
}

/** Decrypts a stored credential. Legacy plaintext passes through; undecryptable values return null. */
export function openSecret(stored: string | null | undefined): string | null {
  if (stored === null || stored === undefined || stored === "") return null;
  if (!isSealedSecret(stored)) return stored;
  try {
    const raw = Buffer.from(stored.slice(PREFIX.length), "base64");
    const iv = raw.subarray(0, IV_BYTES);
    const tag = raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(raw.subarray(IV_BYTES + TAG_BYTES)), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
