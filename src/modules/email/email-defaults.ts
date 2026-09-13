import { formatDate, formatMoney } from "@/core/format";
import type { getInvoice } from "@/modules/sales-invoices/invoice-service";
import {
  defaultDocumentSubject,
  renderDocumentEmailBody,
  renderDocumentEmailText,
  type DocumentEmailContext,
} from "./email-template";

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

export function buildDocumentEmailDefaults(ctx: DocumentEmailContext, toEmail: string) {
  return {
    to: toEmail,
    subject: defaultDocumentSubject(ctx),
    bodyHtml: renderDocumentEmailBody(ctx),
    bodyText: renderDocumentEmailText(ctx),
  };
}
