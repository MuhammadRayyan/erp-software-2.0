"use server";

import { z } from "zod";
import { requireModule } from "@/core/permissions/require-module";
import { formatDate, formatMoney } from "@/core/format";
import { quantityMicrosToInput } from "@/modules/accounting/calculations/money";
import { getInvoice } from "@/modules/sales-invoices/invoice-service";
import { renderInvoicePdf } from "@/modules/document-templates/template-registry";
import { getCustomFieldPairsForEntity } from "@/modules/custom-fields/custom-field-service";
import { defaultSender } from "./email-template";
import { parseRecipientList, sendEmail } from "./email-service";
import type { InvoiceRecord } from "./email-defaults";

// NOTE: `buildInvoiceEmailContext` + `buildInvoiceEmailDefaults` are sync
// helpers that live in `./email-defaults.ts` — DO NOT re-export them from
// this "use server" module. Next.js forbids non-async exports from "use
// server" files (even re-exports). Import them directly from email-defaults.

export type SendInvoiceEmailResult =
  | { ok: true; emailId: string; status: "sent" | "failed"; errorMessage?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const sendInvoiceEmailSchema = z.object({
  to: z
    .string()
    .trim()
    .min(1, "Enter at least one recipient.")
    .refine((raw) => {
      const recipients = parseRecipientList(raw);
      return recipients.length > 0 && recipients.every((r) => EMAIL_PATTERN.test(r.email));
    }, "Enter valid email addresses separated by commas."),
  cc: z
    .string()
    .trim()
    .optional()
    .default("")
    .refine((raw) => {
      if (!raw) return true;
      return parseRecipientList(raw).every((r) => EMAIL_PATTERN.test(r.email));
    }, "Enter valid CC addresses separated by commas."),
  subject: z.string().trim().min(1, "Subject is required.").max(200, "Subject is too long."),
  bodyHtml: z.string().min(1, "Email body is required."),
  bodyText: z.string().optional().default(""),
  attachPdf: z.boolean().default(true),
});

/**
 * Server action invoked by the "Email" modal on the invoice view. Validates
 * the form, generates the PDF attachment (if requested), composes the email,
 * and hands off to `sendEmail` for persistence + driver dispatch.
 *
 * Returns the email id so the client can show a "Sent" toast with a link to
 * the audit-log row.
 */
export async function sendInvoiceEmailAction(
  businessId: string,
  invoiceId: string,
  input: unknown,
): Promise<SendInvoiceEmailResult> {
  const { user, access } = await requireModule(businessId, "sales");
  const record = getInvoice(businessId, user.id, invoiceId);
  if (!record) return { ok: false, error: "Invoice not found." };

  const parsed = sendInvoiceEmailSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Check the highlighted fields.",
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
    };
  }

  const { invoice } = record;
  const to = parseRecipientList(parsed.data.to);
  const cc = parsed.data.cc ? parseRecipientList(parsed.data.cc) : [];

  let attachment:
    | { filename: string; data: Buffer; contentType: string; }
    | undefined;
  if (parsed.data.attachPdf) {
    try {
      const data = await buildInvoicePdfAttachment(
        businessId,
        user.id,
        record,
        access.business.name,
        access.business.currency,
      );
      attachment = {
        filename: `${invoice.invoiceNumber}.pdf`,
        data,
        contentType: "application/pdf",
      };
    } catch (error) {
      return {
        ok: false,
        error:
          error instanceof Error
            ? `PDF generation failed: ${error.message}`
            : "PDF generation failed.",
      };
    }
  }

  try {
    const result = await sendEmail(businessId, user.id, {
      from: defaultSender(access.business.name),
      to,
      cc,
      subject: parsed.data.subject,
      bodyHtml: parsed.data.bodyHtml,
      bodyText: parsed.data.bodyText || undefined,
      attachments: attachment ? [attachment] : undefined,
      relatedEntityType: "sales_invoice",
      relatedEntityId: invoice.id,
      relatedDocumentNumber: invoice.invoiceNumber,
    });
    const status: "sent" | "failed" = result.status === "sent" || result.status === "delivered" ? "sent" : "failed";
    return {
      ok: true,
      emailId: result.id,
      status,
      errorMessage: result.errorMessage,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to send email.",
    };
  }
}

/**
 * Build the PDF bytes for an invoice email attachment. Mirrors the API PDF
 * route's data shape so the attachment matches what the user would download.
 */
async function buildInvoicePdfAttachment(
  businessId: string,
  userId: string,
  record: InvoiceRecord,
  businessName: string,
  baseCurrency: string,
): Promise<Buffer> {
  const { invoice, customer, lines } = record;
  const currency = invoice.currencyCode;
  const foreignDetail =
    currency === baseCurrency
      ? ""
      : `Rate 1 ${currency} = ${invoice.exchangeRateToBase} ${baseCurrency} (${invoice.exchangeRateSource}, ${invoice.exchangeRateDate}) · Base ${formatMoney(invoice.baseTotalMinor, baseCurrency)} · ${baseCurrency} VAT ${formatMoney(invoice.baseTaxMinor, baseCurrency)}`;
  const customFields = getCustomFieldPairsForEntity(
    businessId,
    userId,
    "sales_invoice",
    invoice.id,
  );
  const data = {
    companyName: businessName,
    invoiceNumber: invoice.invoiceNumber,
    invoiceDate: formatDate(invoice.invoiceDate),
    dueDate: formatDate(invoice.dueDate),
    customerName: customer.name,
    customerAddress:
      customer.billingAddress ||
      [customer.addressLine1, customer.city, customer.countrySubdivision]
        .filter(Boolean)
        .join(", ") ||
      undefined,
    customerTrn: customer.taxReference || undefined,
    lines: lines.map((line) => ({
      description: line.description,
      quantity: quantityMicrosToInput(line.quantityMicros),
      unitPrice: formatMoney(line.unitPriceMinor, currency),
      amount: formatMoney(line.grossAmountMinor, currency),
    })),
    subtotal: formatMoney(invoice.subtotalMinor, currency),
    tax: formatMoney(invoice.taxMinor, currency),
    total: formatMoney(invoice.totalMinor, currency),
    foreignDetail: foreignDetail || undefined,
    customFields,
  };
  return renderInvoicePdf(businessId, userId, data);
}
