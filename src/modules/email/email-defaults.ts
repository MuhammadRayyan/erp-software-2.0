import { formatDate, formatMoney } from "@/core/format";
import type { getInvoice } from "@/modules/sales-invoices/invoice-service";
import {
  defaultInvoiceSubject,
  renderInvoiceEmailBody,
  renderInvoiceEmailText,
  type InvoiceEmailContext,
} from "./email-template";

/** The non-null return shape of `getInvoice`. */
export type InvoiceRecord = NonNullable<Awaited<ReturnType<typeof getInvoice>>>;

/**
 * Build the default email context used to prefill the modal. Computed at
 * render time by the page server component so the modal opens instantly
 * with prefilled To/Subject/Body — no need to round-trip to a server
 * action just to compute the defaults.
 *
 * The email body displays document-currency totals only (no base-currency
 * snapshot). The base currency lives on `access.business.currency` in the
 * page; we don't take it here. If the body later needs to show base totals,
 * add a base-currency param here and use it.
 */
export function buildInvoiceEmailContext(
  businessName: string,
  record: InvoiceRecord,
): InvoiceEmailContext & { to: string; balance: string | null } {
  const { invoice, customer } = record;
  const currency = invoice.currencyCode;
  const balance =
    invoice.documentStatus === "posted"
      ? formatMoney(record.balanceMinor, currency)
      : null;
  return {
    businessName,
    invoiceNumber: invoice.invoiceNumber,
    invoiceDate: formatDate(invoice.invoiceDate),
    dueDate: formatDate(invoice.dueDate),
    customerName: customer.name,
    total: formatMoney(invoice.totalMinor, currency),
    balance,
    currency,
    hasPdfAttachment: true,
    to: customer.email ?? "",
  };
}

/**
 * Build the default email fields (subject + body HTML + body text) from the
 * invoice email context. Used by the page to prefill the modal.
 */
export function buildInvoiceEmailDefaults(ctx: InvoiceEmailContext, toEmail: string) {
  return {
    to: toEmail,
    subject: defaultInvoiceSubject(ctx),
    bodyHtml: renderInvoiceEmailBody(ctx),
    bodyText: renderInvoiceEmailText(ctx),
  };
}
