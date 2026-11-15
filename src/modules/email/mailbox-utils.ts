import type { EmailRecipient } from "./email-types";

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
