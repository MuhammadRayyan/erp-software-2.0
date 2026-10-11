import { formatDate, formatMoney } from "@/core/format";
import type { getInvoice } from "@/modules/sales-invoices/invoice-service";
import {
  defaultDocumentSubject,
  renderDocumentEmailBody,
  renderDocumentEmailText,
  type DocumentEmailContext,
} from "./email-template";
import { getEmailTemplate, interpolateEmailTemplate } from "./email-template-service";

export type InvoiceRecord = NonNullable<Awaited<ReturnType<typeof getInvoice>>>;

export type DocumentEmailSourceData = {
  currencyCode: string;
  documentNumber: string;
  documentDate: string;
  dueDate: string;
  partyName: string;
  totalMinor: number;
  balanceMinor?: number; // Used for invoices if posted
  documentStatus?: string; // Used for invoices
};

export function buildDocumentEmailContext(
  businessName: string,
  documentName: string,
  source: DocumentEmailSourceData,
  toEmail: string
): DocumentEmailContext & { to: string; balance: string | null } {
  const currency = source.currencyCode;
  const documentNumber = source.documentNumber;
  const documentDate = source.documentDate;
  const dueDate = source.dueDate;
  const customerName = source.partyName;
  const totalMinor = source.totalMinor;
  const balance = source.documentStatus === "posted" ? formatMoney(source.balanceMinor ?? 0, currency) : null;

  const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

  return {
    businessName,
    documentName,
    documentNumber,
    documentDate: documentDate ? formatDate(documentDate) : "-",
    // Only call formatDate if the raw value looks like an ISO date (YYYY-MM-DD).
    // If it's already a human label like "Expiry Date: 2026-08-15" just pass through.
    dueDate: dueDate !== "-" ? (ISO_DATE_RE.test(dueDate) ? formatDate(dueDate) : dueDate) : "-",
    customerName,
    total: formatMoney(totalMinor, currency),
    balance,
    currency,
    hasPdfAttachment: true,
    to: toEmail,
  };
}

function resolveTemplateType(documentName: string): string {
  const norm = documentName.toLowerCase();
  if (norm.includes("quote")) return "sales-quote";
  if (norm.includes("order")) return norm.includes("purchase") ? "purchase-order" : "sales-order";
  if (norm.includes("delivery")) return "delivery-note";
  if (norm.includes("statement")) return "customer-statement";
  if (norm.includes("receipt")) return "receipt";
  if (norm.includes("invoice")) return "sales-invoice";
  return "sales-invoice";
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildDocumentEmailDefaults(
  ctx: DocumentEmailContext,
  toEmail: string,
  businessId?: string,
  templateType?: string
) {
  if (businessId) {
    try {
      const type = templateType || resolveTemplateType(ctx.documentName);
      if (type) {
        const template = getEmailTemplate(businessId, type);
        if (template) {
          const interpolated = interpolateEmailTemplate(template, {
            customerName: ctx.customerName,
            documentNumber: ctx.documentNumber,
            businessName: ctx.businessName,
            total: ctx.total,
            balance: ctx.balance,
            documentDate: ctx.documentDate,
            dueDate: ctx.dueDate,
            currency: ctx.currency,
          });
          return {
            to: toEmail,
            subject: interpolated.subject,
            bodyHtml: `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;color:#0f172a;white-space:pre-wrap;">${escapeHtml(interpolated.body)}</div>`,
            bodyText: interpolated.body,
          };
        }
      }
    } catch {
      // Fallback to default template
    }
  }

  return {
    to: toEmail,
    subject: defaultDocumentSubject(ctx),
    bodyHtml: renderDocumentEmailBody(ctx),
    bodyText: renderDocumentEmailText(ctx),
  };
}
