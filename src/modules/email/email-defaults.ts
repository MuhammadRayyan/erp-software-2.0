import { formatDate, formatMoney } from "@/core/format";
import type { getInvoice } from "@/modules/sales-invoices/invoice-service";
import {
  defaultDocumentSubject,
  renderDocumentEmailBody,
  renderDocumentEmailText,
  type DocumentEmailContext,
} from "./email-template";

export type InvoiceRecord = NonNullable<Awaited<ReturnType<typeof getInvoice>>>;

export function buildDocumentEmailContext(
  businessName: string,
  documentName: string,
  record: any,
  toEmail: string
): DocumentEmailContext & { to: string; balance: string | null } {
  const currency = record.invoice?.currencyCode || record.quote?.currencyCode || record.order?.currencyCode || record.note?.currencyCode || "AED";
  const documentNumber = record.invoice?.invoiceNumber || record.quote?.quoteNumber || record.order?.orderNumber || record.note?.creditNoteNumber || record.invoice?.internalNumber || "";
  const documentDate = record.invoice?.invoiceDate || record.quote?.quoteDate || record.order?.date || record.order?.orderDate || record.note?.date || "";
  const dueDate = record.invoice?.dueDate || record.quote?.expiryDate || record.order?.expectedDate || record.order?.deliveryDate || "-";
  const customerName = record.customer?.name || record.supplier?.name || "";
  const totalMinor = record.invoice?.totalMinor ?? record.quote?.totalMinor ?? record.order?.totalMinor ?? record.note?.totalMinor ?? 0;
  const balance = record.invoice?.documentStatus === "posted" ? formatMoney(record.balanceMinor, currency) : null;

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

export function buildDocumentEmailDefaults(ctx: DocumentEmailContext, toEmail: string) {
  return {
    to: toEmail,
    subject: defaultDocumentSubject(ctx),
    bodyHtml: renderDocumentEmailBody(ctx),
    bodyText: renderDocumentEmailText(ctx),
  };
}
