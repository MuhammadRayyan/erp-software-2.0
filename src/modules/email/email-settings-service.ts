import { getBusinessDb } from "@/core/db/business";
import { createNodemailerTransporter, formatMailbox } from "./email-driver";
import type {
  BusinessEmailSettings,
  SaveEmailSettingsInput,
  TestEmailInput,
} from "./email-types";

type EmailSettingsRow = {
  id: string;
  sender_name: string | null;
  sender_email: string | null;
  reply_to_email: string | null;
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_secure: number;
  smtp_user: string | null;
  smtp_pass: string | null;
  is_active: number;
  last_tested_at: string | null;
  last_test_status: string | null;
  last_test_error: string | null;
  created_at: string;
  updated_at: string;
};

function mapRow(row: EmailSettingsRow): BusinessEmailSettings {
  return {
    id: row.id,
    senderName: row.sender_name,
    senderEmail: row.sender_email,
    replyToEmail: row.reply_to_email,
    smtpHost: row.smtp_host,
    smtpPort: row.smtp_port,
    smtpSecure: Boolean(row.smtp_secure),
    smtpUser: row.smtp_user,
    smtpPass: row.smtp_pass,
    isActive: Boolean(row.is_active),
    lastTestedAt: row.last_tested_at,
    lastTestStatus: (row.last_test_status as BusinessEmailSettings["lastTestStatus"]) ?? null,
    lastTestError: row.last_test_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Retrieve current email & SMTP settings for a business.
 * Returns default settings object if none has been configured yet.
 */
export function getEmailSettings(businessId: string, userId?: string): BusinessEmailSettings {
  const { sqlite } = getBusinessDb(businessId, userId);
  const now = new Date().toISOString();

  let row: EmailSettingsRow | undefined;
  try {
    row = sqlite
      .prepare(
        `SELECT id, sender_name, sender_email, reply_to_email, smtp_host, smtp_port,
                smtp_secure, smtp_user, smtp_pass, is_active, last_tested_at,
                last_test_status, last_test_error, created_at, updated_at
         FROM email_settings
         WHERE id = 'default'
         LIMIT 1`,
      )
      .get() as EmailSettingsRow | undefined;
  } catch {
    // If table does not exist
  }

  if (row) {
    return mapRow(row);
  }

  return {
    id: "default",
    senderName: null,
    senderEmail: null,
    replyToEmail: null,
    smtpHost: null,
    smtpPort: 587,
    smtpSecure: false,
    smtpUser: null,
    smtpPass: null,
    isActive: false,
    lastTestedAt: null,
    lastTestStatus: null,
    lastTestError: null,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Persist or update email & SMTP settings for a business.
 */
export function saveEmailSettings(
  businessId: string,
  userId: string,
  data: SaveEmailSettingsInput,
): BusinessEmailSettings {
  const { sqlite } = getBusinessDb(businessId, userId);
  const existing = getEmailSettings(businessId, userId);
  const now = new Date().toISOString();

  const senderName = data.senderName !== undefined ? data.senderName?.trim() || null : existing.senderName;
  const senderEmail = data.senderEmail !== undefined ? data.senderEmail?.trim()?.toLowerCase() || null : existing.senderEmail;
  const replyToEmail = data.replyToEmail !== undefined ? data.replyToEmail?.trim()?.toLowerCase() || null : existing.replyToEmail;
  const smtpHost = data.smtpHost !== undefined ? data.smtpHost?.trim() || null : existing.smtpHost;
  const smtpPort = data.smtpPort !== undefined ? (data.smtpPort ? Number(data.smtpPort) : null) : existing.smtpPort;
  const smtpSecure = data.smtpSecure !== undefined ? (data.smtpSecure ? 1 : 0) : (existing.smtpSecure ? 1 : 0);
  const smtpUser = data.smtpUser !== undefined ? data.smtpUser?.trim() || null : existing.smtpUser;
  // If user passed empty pass or didn't supply pass, preserve existing password
  const smtpPass = data.smtpPass !== undefined && data.smtpPass !== "" ? data.smtpPass : existing.smtpPass;
  const isActive = data.isActive !== undefined ? (data.isActive ? 1 : 0) : (existing.isActive ? 1 : 0);

  sqlite
    .prepare(
      `INSERT INTO email_settings (
        id, sender_name, sender_email, reply_to_email, smtp_host, smtp_port,
        smtp_secure, smtp_user, smtp_pass, is_active, last_tested_at,
        last_test_status, last_test_error, created_at, updated_at
      ) VALUES ('default', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        sender_name = excluded.sender_name,
        sender_email = excluded.sender_email,
        reply_to_email = excluded.reply_to_email,
        smtp_host = excluded.smtp_host,
        smtp_port = excluded.smtp_port,
        smtp_secure = excluded.smtp_secure,
        smtp_user = excluded.smtp_user,
        smtp_pass = excluded.smtp_pass,
        is_active = excluded.is_active,
        updated_at = excluded.updated_at`,
    )
    .run(
      senderName,
      senderEmail,
      replyToEmail,
      smtpHost,
      smtpPort,
      smtpSecure,
      smtpUser,
      smtpPass,
      isActive,
      existing.lastTestedAt,
      existing.lastTestStatus,
      existing.lastTestError,
      existing.createdAt,
      now,
    );

  return getEmailSettings(businessId, userId);
}

/**
 * Verify SMTP connection and send a live test message.
 * Updates last_test_status, last_tested_at, and last_test_error in the database.
 */
export async function verifyAndSendTestEmail(
  businessId: string,
  userId: string,
  input: TestEmailInput,
): Promise<{ success: boolean; message?: string; error?: string }> {
  const { sqlite } = getBusinessDb(businessId, userId);
  const now = new Date().toISOString();

  const recipient = input.recipient.trim().toLowerCase();
  if (!recipient || !recipient.includes("@")) {
    return { success: false, error: "A valid test recipient email address is required." };
  }

  const existing = getEmailSettings(businessId, userId);
  const host = input.smtpHost?.trim() || existing.smtpHost;
  const port = input.smtpPort ? Number(input.smtpPort) : existing.smtpPort;
  const secure = input.smtpSecure !== undefined ? input.smtpSecure : existing.smtpSecure;
  const user = input.smtpUser?.trim() || existing.smtpUser;
  const pass = (input.smtpPass && input.smtpPass.trim()) || existing.smtpPass;
  const senderEmail = input.senderEmail?.trim() || existing.senderEmail || user;
  const senderName = input.senderName?.trim() || existing.senderName || "Ledgerly ERP";

  if (!host) {
    return { success: false, error: "SMTP Host is required to test email delivery." };
  }
  if (!port) {
    return { success: false, error: "SMTP Port is required to test email delivery." };
  }

  const transporter = createNodemailerTransporter({
    smtpHost: host,
    smtpPort: port,
    smtpSecure: secure,
    smtpUser: user,
    smtpPass: pass,
  });

  try {
    // 1. Test transport connectivity and credentials if driver supports verify()
    if (typeof transporter.verify === "function") {
      await transporter.verify();
    }

    // 2. Dispatch a verification email
    const fromAddress = formatMailbox({
      name: senderName,
      email: senderEmail || user || "erp@local",
    });

    await transporter.sendMail({
      from: fromAddress,
      to: recipient,
      subject: `[Test] Ledgerly ERP Outbound Delivery Test (${now.slice(0, 10)})`,
      text: `Hello,\n\nThis is a verification test email from your Ledgerly ERP workspace.\n\nConnection Details:\n- SMTP Host: ${host}\n- SMTP Port: ${port}\n- Security: ${secure ? "SSL/TLS (Port 465)" : "STARTTLS (Port 587)"}\n- Authenticated User: ${user || "None"}\n- Timestamp: ${now}\n\nYour outbound email service is functioning properly.\n\nRegards,\nLedgerly ERP System`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 580px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
          <h2 style="color: #0f172a; margin-top: 0; font-size: 20px;">✓ Outbound Email Delivery Verified</h2>
          <p style="color: #475569; font-size: 14px; line-height: 1.6;">
            This email confirms that your outgoing SMTP server credentials in <strong>Ledgerly ERP</strong> are successfully configured and active.
          </p>
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 20px 0; font-size: 13px; color: #334155;">
            <div><strong>SMTP Host:</strong> ${host}</div>
            <div style="margin-top: 6px;"><strong>SMTP Port:</strong> ${port} (${secure ? "SSL/TLS" : "STARTTLS"})</div>
            <div style="margin-top: 6px;"><strong>Sender Identity:</strong> ${fromAddress}</div>
            <div style="margin-top: 6px;"><strong>Recipient:</strong> ${recipient}</div>
            <div style="margin-top: 6px;"><strong>Timestamp:</strong> ${now}</div>
          </div>
          <p style="color: #64748b; font-size: 12px; margin-bottom: 0;">
            Sent automatically via Ledgerly ERP Email Configuration.
          </p>
        </div>
      `,
    });

    // Update settings test status in DB
    sqlite
      .prepare(
        `UPDATE email_settings
         SET last_tested_at = ?, last_test_status = 'success', last_test_error = NULL, updated_at = ?
         WHERE id = 'default'`,
      )
      .run(now, now);

    return {
      success: true,
      message: `Test email successfully sent to ${recipient} via ${host}:${port}!`,
    };
  } catch (err) {
    const rawError = err instanceof Error ? err.message : String(err);
    let friendlyError = rawError;

    if (rawError.includes("535") || rawError.toLowerCase().includes("bad username") || rawError.toLowerCase().includes("authentication failed")) {
      friendlyError = `Authentication failed (535): Invalid SMTP username or password for ${user || "server"}.`;
    } else if (rawError.includes("ECONNREFUSED")) {
      friendlyError = `Connection refused: Unable to connect to SMTP host "${host}" on port ${port}. Check host and port.`;
    } else if (rawError.includes("ETIMEDOUT") || rawError.includes("ESOCKETTIMEDOUT")) {
      friendlyError = `Connection timed out: ${host}:${port} did not respond in time. Verify firewall rules or SSL/TLS toggle.`;
    } else if (rawError.includes("ENOTFOUND")) {
      friendlyError = `Host not found: Could not resolve DNS host "${host}". Please verify the hostname.`;
    }

    // Persist failure status in DB
    sqlite
      .prepare(
        `UPDATE email_settings
         SET last_tested_at = ?, last_test_status = 'failed', last_test_error = ?, updated_at = ?
         WHERE id = 'default'`,
      )
      .run(now, friendlyError, now);

    return {
      success: false,
      error: friendlyError,
    };
  }
}
