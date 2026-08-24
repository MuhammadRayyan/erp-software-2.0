import { randomUUID } from "node:crypto";
import type { EmailDriver, EmailRecipient, SendEmailInput } from "./email-types";

/**
 * Format an `EmailRecipient` as an RFC-5322 mailbox: `Name <email@example.com>`
 * when a name is provided, or just the bare email otherwise. Used both for
 * the audit table (CSV storage) and the From/To/Cc headers when wired to a
 * real SMTP driver.
 */
export function formatMailbox(recipient: EmailRecipient): string {
  const email = recipient.email.trim().toLowerCase();
  if (!email) return "";
  const name = recipient.name?.trim();
  return name ? `${name} <${email}>` : email;
}

/**
 * Join a list of recipients into a comma-separated display string. Empty
 * values (no email) are filtered out so we don't get stray commas in the
 * audit log.
 */
export function joinMailboxes(recipients: readonly EmailRecipient[]): string {
  return recipients
    .map(formatMailbox)
    .filter(Boolean)
    .join(", ");
}

/**
 * Split a comma-separated mailbox string back into EmailRecipient entries.
 * Tolerates `"Name <email>"` and bare email addresses; ignored values are
 * skipped. Used when reading the audit log back from the DB.
 */
export function parseMailboxes(value: string): EmailRecipient[] {
  if (!value) return [];
  const out: EmailRecipient[] = [];
  // Split on commas NOT inside <>. Cheap and good enough for display.
  const parts = value.split(/,(?![^<>]*>)/);
  for (const raw of parts) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const match = /^(.*?)\s*<([^>]+)>$/.exec(trimmed);
    if (match) {
      const name = match[1].trim().replace(/^["']|["']$/g, "");
      out.push({ name: name || undefined, email: match[2].trim().toLowerCase() });
    } else if (/^[^@\s]+@[^@\s]+$/.test(trimmed)) {
      out.push({ email: trimmed.toLowerCase() });
    }
  }
  return out;
}

/**
 * Default driver for the demo environment: no transport is wired in. The
 * driver records the email to the audit table via the caller (the service
 * writes the row), and returns success immediately. This is the same shape
 * a real SMTP driver would return — services don't care which driver is
 * active, they just persist the result.
 *
 * When SMTP credentials are configured later, this default can be replaced
 * in `getEmailDriver()` with a Nodemailer-backed driver that opens a
 * transport pool and pipes the same `SendEmailInput` into it.
 */
export const logDriver: EmailDriver = {
  name: "log",
  async send(input: SendEmailInput) {
    // The log driver has no transport — it persists the audit row and returns
    // success so the UI shows a green check. The `input` reference is kept
    // here so future logging (e.g. writing to disk for debugging) can read
    // from it without re-architecting the call signature. For now we just
    // touch it via `void` to satisfy the unused-vars rule when there is no
    // log target wired.
    void input;
    return { ok: true, messageId: randomUUID() };
  },
};

/**
 * Resolves the active email driver. Currently always returns the log driver;
 * a future PR can read SMTP env vars (e.g. SMTP_HOST/SMTP_PORT/SMTP_USER) and
 * return a real Nodemailer-backed driver here.
 */
export function getEmailDriver(): EmailDriver {
  return logDriver;
}
