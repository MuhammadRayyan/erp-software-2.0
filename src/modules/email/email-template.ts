import { formatMoney } from "@/core/format";
import type { EmailRecipient } from "./email-types";

/**
 * Default sender identity for outbound business emails. We deliberately do
 * not invent a fake domain — the local-part is `no-reply` and the domain is
 * `example.com` so audit-log viewers can tell this is a demo send. A real
 * deploy wires the business's configured sender identity in here.
 */
export function defaultSender(businessName: string): EmailRecipient {
  return { name: businessName, email: "no-reply@example.com" };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface InvoiceEmailContext {
  businessName: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  customerName: string;
  total: string;
  balance: string | null;
  currency: string;
  /** True when a PDF is attached; controls the "attached" note in the body. */
  hasPdfAttachment: boolean;
}

/**
 * Default email subject for a sales invoice send. Format:
 * "Invoice INV-00009 from <Business Name>".
 */
export function defaultInvoiceSubject(ctx: InvoiceEmailContext): string {
  return `Invoice ${ctx.invoiceNumber} from ${ctx.businessName}`;
}

/**
 * Render the default email body for a sales invoice. The body is a clean,
 * responsive HTML email with a header card, a summary table, and a footer
 * note explaining the attachment (if any). Inline styles are used so the
 * rendered preview in the audit log looks the same in any email client.
 */
export function renderInvoiceEmailBody(ctx: InvoiceEmailContext): string {
  const totalLabel = "Total";
  const balanceRow = ctx.balance != null
    ? `<tr><td style="padding:6px 12px;color:#475569;">Balance due</td><td style="padding:6px 12px;text-align:right;font-weight:600;">${escapeHtml(ctx.balance)}</td></tr>`
    : "";
  const attachmentNote = ctx.hasPdfAttachment
    ? `<p style="margin:0 0 12px;font-size:13px;color:#475569;">A copy of <strong>${escapeHtml(ctx.invoiceNumber)}.pdf</strong> is attached for your records.</p>`
    : "";
  return `<!doctype html>
<html lang="en">
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:#0f172a;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f8fafc;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" width="560" style="max-width:560px;background:#ffffff;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;">
        <tr><td style="padding:20px 28px;background:#0f172a;color:#ffffff;">
          <p style="margin:0;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#94a3b8;">Invoice</p>
          <p style="margin:4px 0 0;font-size:20px;font-weight:600;">${escapeHtml(ctx.invoiceNumber)}</p>
          <p style="margin:4px 0 0;font-size:13px;color:#cbd5e1;">From ${escapeHtml(ctx.businessName)}</p>
        </td></tr>
        <tr><td style="padding:24px 28px;">
          <p style="margin:0 0 16px;font-size:15px;line-height:1.5;color:#334155;">Hello ${escapeHtml(ctx.customerName)},</p>
          <p style="margin:0 0 16px;font-size:15px;line-height:1.5;color:#334155;">Please find your invoice below. Payment is due by <strong>${escapeHtml(ctx.dueDate)}</strong>.</p>
          ${attachmentNote}
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;font-size:14px;">
            <tr><td style="padding:6px 12px;background:#f8fafc;color:#475569;">Invoice date</td><td style="padding:6px 12px;text-align:right;">${escapeHtml(ctx.invoiceDate)}</td></tr>
            <tr><td style="padding:6px 12px;background:#f8fafc;color:#475569;">Due date</td><td style="padding:6px 12px;text-align:right;">${escapeHtml(ctx.dueDate)}</td></tr>
            <tr><td style="padding:8px 12px;background:#f8fafc;color:#0f172a;font-weight:600;">${totalLabel}</td><td style="padding:8px 12px;text-align:right;font-weight:700;">${escapeHtml(ctx.total)}</td></tr>
            ${balanceRow}
          </table>
          <p style="margin:18px 0 0;font-size:13px;color:#64748b;">If you have already paid, please disregard this message.</p>
        </td></tr>
        <tr><td style="padding:16px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;">
          <p style="margin:0;font-size:12px;color:#94a3b8;">This is an automated message from ${escapeHtml(ctx.businessName)}. Reply to contact the business directly.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/**
 * Cheap plain-text fallback body. Strips the HTML tags + collapses whitespace.
 * Adequate for clients that don't render HTML — most modern clients do.
 */
export function renderInvoiceEmailText(ctx: InvoiceEmailContext): string {
  const lines = [
    `Invoice ${ctx.invoiceNumber} from ${ctx.businessName}`,
    ``,
    `Hello ${ctx.customerName},`,
    ``,
    `Please find your invoice below. Payment is due by ${ctx.dueDate}.`,
    ctx.hasPdfAttachment ? `A copy of ${ctx.invoiceNumber}.pdf is attached.` : ``,
    ``,
    `Invoice date: ${ctx.invoiceDate}`,
    `Due date: ${ctx.dueDate}`,
    `Total: ${ctx.total}`,
    ctx.balance != null ? `Balance due: ${ctx.balance}` : ``,
    ``,
    `If you have already paid, please disregard this message.`,
  ].filter(Boolean);
  return lines.join("\n");
}

/**
 * Format money for an email body. Wraps `formatMoney` so the email body uses
 * the same currency rendering as the rest of the app — keeps the demo
 * consistent and avoids drift if formatMoney ever changes.
 */
export function emailMoney(minor: number, currency: string): string {
  return formatMoney(minor, currency);
}
