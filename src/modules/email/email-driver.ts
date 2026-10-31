import { randomUUID } from "node:crypto";
import nodemailer from "nodemailer";
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

export const logDriver: EmailDriver = {
  name: "log",
  async send(input: SendEmailInput) {
    void input;
    console.log("[logDriver] Pretending to send email to", joinMailboxes(input.to));
    return { ok: true, messageId: randomUUID() };
  },
};

export interface SmtpTransportConfig {
  smtpHost?: string | null;
  smtpPort?: number | null;
  smtpSecure?: boolean | null;
  smtpUser?: string | null;
  smtpPass?: string | null;
  isActive?: boolean | null;
}

export function createNodemailerTransporter(config: SmtpTransportConfig) {
  return nodemailer.createTransport({
    host: config.smtpHost || undefined,
    port: config.smtpPort ? Number(config.smtpPort) : undefined,
    secure: Boolean(config.smtpSecure),
    auth:
      config.smtpUser && config.smtpPass
        ? {
            user: config.smtpUser,
            pass: config.smtpPass,
          }
        : undefined,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });
}

async function dispatchNodemailerMail(
  transporter: ReturnType<typeof createNodemailerTransporter>,
  input: SendEmailInput,
  driverLabel: "Business SMTP" | "SMTP",
): Promise<{ ok: true; messageId: string } | { ok: false; error: string }> {
  try {
    const info = await transporter.sendMail({
      from: formatMailbox(input.from),
      to: joinMailboxes(input.to),
      cc: input.cc ? joinMailboxes(input.cc) : undefined,
      replyTo: input.replyTo
        ? typeof input.replyTo === "string"
          ? input.replyTo
          : formatMailbox(input.replyTo)
        : undefined,
      subject: input.subject,
      text: input.bodyText,
      html: input.bodyHtml,
      attachments: input.attachments?.map((att) => ({
        filename: att.filename,
        content: Buffer.from(att.data),
        contentType: att.contentType,
      })),
    });
    return { ok: true, messageId: (info as { messageId?: string }).messageId || randomUUID() };
  } catch (error) {
    if (driverLabel === "Business SMTP") {
      console.error("[Business SMTP] send error:", error);
    } else {
      console.error("SMTP send error:", error);
    }
    return { ok: false, error: error instanceof Error ? error.message : "Unknown SMTP error" };
  }
}

export interface GlobalEmailConfigStatus {
  configured: boolean;
  driverName: "smtp" | "log" | "disabled";
  host: string | null;
  port: number | null;
  secure: boolean;
  hasAuth: boolean;
}

export function getGlobalEmailConfigStatus(): GlobalEmailConfigStatus {
  const host = process.env.SMTP_HOST || null;
  const port = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : null;
  const configured = Boolean(host && port);
  const secure = process.env.SMTP_SECURE === "true";
  const hasAuth = Boolean(process.env.SMTP_USER && process.env.SMTP_PASS);
  const driverName = configured
    ? "smtp"
    : process.env.NODE_ENV === "production"
      ? "disabled"
      : "log";

  return {
    configured,
    driverName,
    host,
    port,
    secure,
    hasAuth,
  };
}

export function getEmailDriver(customSettings?: SmtpTransportConfig | null): EmailDriver {
  // 1. Business custom SMTP settings (if active and host/port provided)
  if (customSettings && customSettings.isActive && customSettings.smtpHost && customSettings.smtpPort) {
    const transporter = createNodemailerTransporter(customSettings);
    return {
      name: "business-smtp",
      send: (input) => dispatchNodemailerMail(transporter, input, "Business SMTP"),
    };
  }

  // 2. Global environment SMTP settings fallback
  if (process.env.SMTP_HOST && process.env.SMTP_PORT) {
    const transporter = createNodemailerTransporter({
      smtpHost: process.env.SMTP_HOST,
      smtpPort: Number(process.env.SMTP_PORT),
      smtpSecure: process.env.SMTP_SECURE === "true",
      smtpUser: process.env.SMTP_USER,
      smtpPass: process.env.SMTP_PASS,
    });

    return {
      name: "smtp",
      send: (input) => dispatchNodemailerMail(transporter, input, "SMTP"),
    };
  }

  if (process.env.NODE_ENV === "production") {
    return {
      name: "disabled",
      async send() {
        return {
          ok: false,
          error: "Email delivery is not configured. Ask an administrator to configure and test SMTP settings.",
        };
      },
    };
  }
  return logDriver;
}
