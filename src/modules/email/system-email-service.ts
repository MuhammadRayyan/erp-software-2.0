import { getAppBaseUrl, getAppDomain } from "@/core/config/app-url";
import { getEmailDriver, type SmtpTransportConfig } from "./email-driver";
import { getEmailSettings } from "./email-settings-service";

export interface SendSystemEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
  actionUrl: string;
}

/**
 * Resolve the best available SMTP configuration:
 * 1. Active business-level custom SMTP
 * 2. Active global environment SMTP
 * 3. Fallback log driver
 */
function resolveEmailTransport(businessId?: string) {
  let customSettings: SmtpTransportConfig | null = null;
  let senderName = "Ledgerly ERP";
  let senderEmail = `noreply@${getAppDomain().split(":")[0]}`;

  if (businessId) {
    try {
      const settings = getEmailSettings(businessId);
      if (settings.isActive && settings.smtpHost && settings.smtpPort) {
        customSettings = settings;
      }
      if (settings.senderName) senderName = settings.senderName;
      if (settings.senderEmail) senderEmail = settings.senderEmail;
    } catch {
      // Business settings table not accessible, fallback to global
    }
  }

  const driver = getEmailDriver(customSettings);
  return { driver, senderName, senderEmail };
}

/**
 * Dispatch an invitation email to a new team member with their setup link.
 */
export async function sendInvitationEmail(options: {
  to: string;
  businessId: string;
  businessName: string;
  inviterName?: string;
  inviteToken: string;
}): Promise<SendSystemEmailResult> {
  const baseUrl = getAppBaseUrl();
  const actionUrl = `${baseUrl}/accept-invite?token=${encodeURIComponent(options.inviteToken)}`;
  const { driver, senderName, senderEmail } = resolveEmailTransport(options.businessId);

  const subject = `You're invited to join ${options.businessName} on Ledgerly ERP`;
  const from = { name: senderName, email: senderEmail };
  const to = [{ email: options.to.trim().toLowerCase() }];

  const inviterText = options.inviterName ? `${options.inviterName} has invited you` : "You have been invited";

  const bodyHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${subject}</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #1e293b;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8fafc; padding: 32px 16px;">
        <tr>
          <td align="center">
            <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 560px; background-color: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
              <tr>
                <td style="padding: 32px 32px 24px; text-align: left; border-bottom: 1px solid #f1f5f9;">
                  <div style="font-size: 20px; font-weight: 700; color: #0f172a; letter-spacing: -0.02em;">
                    Ledgerly ERP
                  </div>
                </td>
              </tr>
              <tr>
                <td style="padding: 32px;">
                  <h1 style="margin: 0 0 16px; font-size: 22px; font-weight: 600; color: #0f172a; line-height: 1.3;">
                    You've been invited to join ${options.businessName}
                  </h1>
                  <p style="margin: 0 0 20px; font-size: 15px; line-height: 1.6; color: #475569;">
                    ${inviterText} to collaborate on <strong>${options.businessName}</strong> using Ledgerly ERP.
                  </p>
                  <p style="margin: 0 0 28px; font-size: 15px; line-height: 1.6; color: #475569;">
                    Please click the button below to set up your account username and choose your password.
                  </p>
                  <div style="text-align: center; margin: 32px 0;">
                    <a href="${actionUrl}" style="display: inline-block; background-color: #0f172a; color: #ffffff; padding: 14px 28px; font-size: 14px; font-weight: 600; text-decoration: none; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                      Accept Invitation & Set Up Account
                    </a>
                  </div>
                  <p style="margin: 28px 0 8px; font-size: 13px; color: #64748b; line-height: 1.5;">
                    If the button doesn't work, copy and paste this link into your browser:
                  </p>
                  <p style="margin: 0; font-size: 12px; color: #3b82f6; word-break: break-all;">
                    <a href="${actionUrl}" style="color: #3b82f6; text-decoration: underline;">${actionUrl}</a>
                  </p>
                  <p style="margin: 24px 0 0; font-size: 12px; color: #94a3b8;">
                    This invitation link will expire in 7 days. If you weren't expecting this invitation, you can safely ignore this email.
                  </p>
                </td>
              </tr>
              <tr>
                <td style="padding: 20px 32px; background-color: #f8fafc; border-top: 1px solid #f1f5f9; text-align: center; font-size: 12px; color: #94a3b8;">
                  Ledgerly ERP · Fast, reliable accounting for growing teams
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;

  const bodyText = `
You've been invited to join ${options.businessName} on Ledgerly ERP.

${inviterText} to collaborate on ${options.businessName}.

To complete your registration, choose your username and password by visiting the following link:
${actionUrl}

This invitation link will expire in 7 days.
  `.trim();

  try {
    const result = await driver.send({
      from,
      to,
      subject,
      bodyHtml,
      bodyText,
    });

    if (driver.name === "log") {
      console.log("[System Email] Development email driver used; delivery was simulated.");
    }

    return {
      success: result.ok,
      messageId: result.ok ? result.messageId : undefined,
      error: !result.ok ? result.error : undefined,
      actionUrl,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error("[System Email: Invitation] Failed to send:", error);
    return {
      success: false,
      error,
      actionUrl,
    };
  }
}

/**
 * Dispatch a password reset email to a user who forgot their password.
 */
export async function sendPasswordResetEmail(options: {
  to: string;
  userName?: string;
  resetToken: string;
  businessId?: string;
}): Promise<SendSystemEmailResult> {
  const baseUrl = getAppBaseUrl();
  const actionUrl = `${baseUrl}/reset-password?token=${encodeURIComponent(options.resetToken)}`;
  const { driver, senderName, senderEmail } = resolveEmailTransport(options.businessId);

  const subject = "Reset your password for Ledgerly ERP";
  const from = { name: senderName, email: senderEmail };
  const to = [{ email: options.to.trim().toLowerCase() }];
  const greeting = options.userName ? `Hello ${options.userName},` : "Hello,";

  const bodyHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${subject}</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #1e293b;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8fafc; padding: 32px 16px;">
        <tr>
          <td align="center">
            <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 560px; background-color: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
              <tr>
                <td style="padding: 32px 32px 24px; text-align: left; border-bottom: 1px solid #f1f5f9;">
                  <div style="font-size: 20px; font-weight: 700; color: #0f172a; letter-spacing: -0.02em;">
                    Ledgerly ERP
                  </div>
                </td>
              </tr>
              <tr>
                <td style="padding: 32px;">
                  <h1 style="margin: 0 0 16px; font-size: 22px; font-weight: 600; color: #0f172a; line-height: 1.3;">
                    Reset your password
                  </h1>
                  <p style="margin: 0 0 16px; font-size: 15px; line-height: 1.6; color: #475569;">
                    ${greeting}
                  </p>
                  <p style="margin: 0 0 28px; font-size: 15px; line-height: 1.6; color: #475569;">
                    A request was made to reset the password for your Ledgerly ERP account (<strong>${options.to}</strong>). Click the button below to choose a new password.
                  </p>
                  <div style="text-align: center; margin: 32px 0;">
                    <a href="${actionUrl}" style="display: inline-block; background-color: #0f172a; color: #ffffff; padding: 14px 28px; font-size: 14px; font-weight: 600; text-decoration: none; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                      Reset Password
                    </a>
                  </div>
                  <p style="margin: 28px 0 8px; font-size: 13px; color: #64748b; line-height: 1.5;">
                    If the button doesn't work, copy and paste this link into your browser:
                  </p>
                  <p style="margin: 0; font-size: 12px; color: #3b82f6; word-break: break-all;">
                    <a href="${actionUrl}" style="color: #3b82f6; text-decoration: underline;">${actionUrl}</a>
                  </p>
                  <p style="margin: 24px 0 0; font-size: 12px; color: #94a3b8;">
                    This link will expire in 24 hours. If you did not request this password reset, please ignore this email or notify your system administrator.
                  </p>
                </td>
              </tr>
              <tr>
                <td style="padding: 20px 32px; background-color: #f8fafc; border-top: 1px solid #f1f5f9; text-align: center; font-size: 12px; color: #94a3b8;">
                  Ledgerly ERP · Security Notification
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;

  const bodyText = `
${greeting}

A request was made to reset the password for your Ledgerly ERP account (${options.to}).

To reset your password, visit the following link:
${actionUrl}

This link is valid for 24 hours. If you did not request a password reset, you can safely ignore this email.
  `.trim();

  try {
    const result = await driver.send({
      from,
      to,
      subject,
      bodyHtml,
      bodyText,
    });

    if (driver.name === "log") {
      console.log("[System Email] Development email driver used; delivery was simulated.");
    }

    return {
      success: result.ok,
      messageId: result.ok ? result.messageId : undefined,
      error: !result.ok ? result.error : undefined,
      actionUrl,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error("[System Email: Password Reset] Failed to send:", error);
    return {
      success: false,
      error,
      actionUrl,
    };
  }
}

/**
 * Dispatch an access granted notification to an existing registered user.
 */
export async function sendAccessGrantedEmail(options: {
  to: string;
  userName: string;
  businessId: string;
  businessName: string;
  role: string;
}): Promise<SendSystemEmailResult> {
  const baseUrl = getAppBaseUrl();
  const actionUrl = `${baseUrl}/b/${options.businessId}/overview`;
  const { driver, senderName, senderEmail } = resolveEmailTransport(options.businessId);

  const subject = `You've been added to ${options.businessName} on Ledgerly ERP`;
  const from = { name: senderName, email: senderEmail };
  const to = [{ email: options.to.trim().toLowerCase() }];

  const bodyHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>${subject}</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #1e293b;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8fafc; padding: 32px 16px;">
        <tr>
          <td align="center">
            <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 560px; background-color: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden;">
              <tr>
                <td style="padding: 32px;">
                  <h1 style="margin: 0 0 16px; font-size: 22px; font-weight: 600; color: #0f172a;">
                    Access granted to ${options.businessName}
                  </h1>
                  <p style="margin: 0 0 20px; font-size: 15px; line-height: 1.6; color: #475569;">
                    Hello ${options.userName}, your account has been granted access to <strong>${options.businessName}</strong> with the <strong>${options.role}</strong> role.
                  </p>
                  <div style="text-align: center; margin: 32px 0;">
                    <a href="${actionUrl}" style="display: inline-block; background-color: #0f172a; color: #ffffff; padding: 14px 28px; font-size: 14px; font-weight: 600; text-decoration: none; border-radius: 8px;">
                      Open Business Workspace
                    </a>
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;

  const bodyText = `
Hello ${options.userName},

You have been granted access to ${options.businessName} with role '${options.role}'.

Access your workspace directly at:
${actionUrl}
  `.trim();

  try {
    const result = await driver.send({ from, to, subject, bodyHtml, bodyText });
    return {
      success: result.ok,
      messageId: result.ok ? result.messageId : undefined,
      error: !result.ok ? result.error : undefined,
      actionUrl,
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err), actionUrl };
  }
}
