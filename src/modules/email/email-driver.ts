import { randomUUID } from "node:crypto";
import nodemailer from "nodemailer";
import { getAppDomain } from "@/core/config/app-url";
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

export async function dispatchNodemailerMail(
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
  fromEmail: string | null;
}

export function getGlobalEmailConfigStatus(): GlobalEmailConfigStatus {
  const host = process.env.SMTP_HOST || null;
  const port = process.env.SMTP_PORT
    ? Number(process.env.SMTP_PORT)
    : host
      ? (process.env.SMTP_SECURE === "true" ? 465 : 587)
      : null;
  const configured = Boolean(host && port);
  const secure = process.env.SMTP_SECURE === "true";
  const hasAuth = Boolean(process.env.SMTP_USER && process.env.SMTP_PASS);
  const fromEmail = process.env.SMTP_FROM || process.env.SMTP_USER || null;
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
    fromEmail,
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
  if (process.env.SMTP_HOST) {
    const port = process.env.SMTP_PORT
      ? Number(process.env.SMTP_PORT)
      : (process.env.SMTP_SECURE === "true" ? 465 : 587);
    const transporter = createNodemailerTransporter({
      smtpHost: process.env.SMTP_HOST,
      smtpPort: port,
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

/**
 * Verify network connectivity and credentials with the globally configured SMTP server.
 */
export async function verifyGlobalEmailConnection(): Promise<{
  ok: boolean;
  message: string;
  driver: string;
  host?: string | null;
  port?: number | null;
}> {
  const status = getGlobalEmailConfigStatus();
  if (!status.configured) {
    if (status.driverName === "log") {
      return {
        ok: true,
        message: "Development log driver active (delivery is simulated in console).",
        driver: status.driverName,
      };
    }
    return {
      ok: false,
      message: "SMTP is not configured in environment (SMTP_HOST is missing in runtime.env).",
      driver: status.driverName,
    };
  }

  const transporter = createNodemailerTransporter({
    smtpHost: status.host,
    smtpPort: status.port,
    smtpSecure: status.secure,
    smtpUser: process.env.SMTP_USER,
    smtpPass: process.env.SMTP_PASS,
  });

  try {
    if (typeof transporter.verify === "function") {
      await transporter.verify();
    }
    return {
      ok: true,
      message: `Successfully connected to SMTP server ${status.host}:${status.port}.`,
      driver: status.driverName,
      host: status.host,
      port: status.port,
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Failed to verify SMTP connection.",
      driver: status.driverName,
      host: status.host,
      port: status.port,
    };
  }
}

/**
 * Dispatch a live platform test verification email using active global email driver.
 */
export async function sendGlobalTestEmail(recipientEmail: string): Promise<{
  ok: boolean;
  message: string;
  messageId?: string;
}> {
  const recipient = recipientEmail.trim().toLowerCase();
  if (!recipient || !recipient.includes("@")) {
    return { ok: false, message: "A valid recipient email address is required." };
  }

  const status = getGlobalEmailConfigStatus();
  const driver = getEmailDriver();

  if (driver.name === "disabled") {
    return {
      ok: false,
      message: "Cannot send test email: SMTP is unconfigured and email delivery is disabled in production.",
    };
  }

  const senderEmail = status.fromEmail || `noreply@${getAppDomain().split(":")[0]}`;
  const now = new Date().toISOString();

  const result = await driver.send({
    from: { name: "UAE Manager Platform", email: senderEmail },
    to: [{ email: recipient }],
    subject: `[Test] UAE Manager Platform Email Verification (${now.slice(0, 10)})`,
    bodyText: `Hello,\n\nThis is a platform test email from UAE Manager Engine Diagnostics.\n\nDriver: ${driver.name}\nHost: ${status.host || "Local"}\nPort: ${status.port || "N/A"}\nTimestamp: ${now}\n\nPlatform transactional delivery is operational.\n\nRegards,\nUAE Manager Super-Admin Console`,
    bodyHtml: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 540px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
        <h2 style="color: #0f172a; margin-top: 0; font-size: 20px;">✓ Platform Outbound Email Verified</h2>
        <p style="color: #475569; font-size: 14px; line-height: 1.6;">
          This verification email was initiated from the <strong>Engine Health & Telemetry</strong> dashboard in UAE Manager.
        </p>
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; margin: 18px 0; font-size: 13px; color: #334155;">
          <div><strong>Active Driver:</strong> ${driver.name.toUpperCase()}</div>
          <div style="margin-top: 4px;"><strong>SMTP Server:</strong> ${status.host || "Local Dev"} ${status.port ? `(Port ${status.port})` : ""}</div>
          <div style="margin-top: 4px;"><strong>Sender:</strong> ${senderEmail}</div>
          <div style="margin-top: 4px;"><strong>Recipient:</strong> ${recipient}</div>
          <div style="margin-top: 4px;"><strong>Timestamp:</strong> ${now}</div>
        </div>
        <p style="color: #64748b; font-size: 12px; margin-bottom: 0;">
          UAE Manager Platform Diagnostic Subsystem
        </p>
      </div>
    `,
  });

  if (result.ok) {
    return {
      ok: true,
      message: `Test email dispatched successfully${result.messageId ? ` (Message-ID: ${result.messageId})` : ""}.`,
      messageId: result.messageId,
    };
  } else {
    return {
      ok: false,
      message: result.error || "Failed to dispatch test email.",
    };
  }
}
