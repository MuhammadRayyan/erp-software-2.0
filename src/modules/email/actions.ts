"use server";

import { z } from "zod";
import { requireApiAuth } from "@/core/auth/api-auth";
import { getDocumentPdfModule } from "@/core/permissions/document-pdf-access";
import { defaultSender } from "./email-template";
import { parseRecipientList, sendEmail } from "./email-service";
import { generateDocumentPdf } from "@/modules/document-templates/pdf-service";

export type SendDocumentEmailResult =
  | { ok: true; emailId: string; status: "sent" | "failed"; errorMessage?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const sendDocumentEmailSchema = z.object({
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
 * Server action invoked by the "Email" modal on the document view. Validates
 * the form, generates the PDF attachment (if requested), composes the email,
 * and hands off to `sendEmail` for persistence + driver dispatch.
 */
export async function sendDocumentEmailAction(
  businessId: string,
  documentType: string,
  documentId: string,
  documentNumber: string,
  input: unknown,
): Promise<SendDocumentEmailResult> {
  const requiredModule = getDocumentPdfModule(documentType);
  if (!requiredModule) {
    return { ok: false, error: "Unsupported document type" };
  }

  // Use requireApiAuth to resolve and verify access for the specific document's module
  // Since server actions run on POST, we pass a dummy Request object.
  const req = new Request("http://localhost/api/dummy", { method: "POST" });
  const { session, access, error: authError } = await requireApiAuth(req, {
    businessId,
    module: requiredModule,
  });
  if (authError || !session || !access) {
    return { ok: false, error: "Unauthorized" };
  }

  const parsed = sendDocumentEmailSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Check the highlighted fields.",
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
    };
  }

  const to = parseRecipientList(parsed.data.to);
  const cc = parsed.data.cc ? parseRecipientList(parsed.data.cc) : [];

  let attachment:
    | { filename: string; data: Buffer; contentType: string; }
    | undefined;
    
  if (parsed.data.attachPdf) {
    try {
      const { pdf, filename } = await generateDocumentPdf(
        businessId,
        session.user.id,
        access.business.name,
        access.business.currency,
        documentType,
        documentId
      );
      attachment = {
        filename,
        data: pdf,
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

  // Determine entity type for the email relationship (replace ALL hyphens so
  // e.g. "sales-credit-note" → "sales_credit_note", not "sales_credit-note").
  const entityType = documentType.replaceAll("-", "_") as any;

  try {
    const result = await sendEmail(businessId, session.user.id, {
      from: defaultSender(access.business.name),
      to,
      cc,
      subject: parsed.data.subject,
      bodyHtml: parsed.data.bodyHtml,
      bodyText: parsed.data.bodyText || undefined,
      attachments: attachment ? [attachment] : undefined,
      relatedEntityType: entityType,
      relatedEntityId: documentId,
      relatedDocumentNumber: documentNumber,
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

export async function saveEmailTemplateAction(
  businessId: string,
  templateType: string,
  subject: string,
  body: string
) {
  const { requireModule } = await import("@/core/permissions/require-module");
  const { revalidatePath } = await import("next/cache");
  const { saveEmailTemplate } = await import("./email-template-service");

  await requireModule(businessId, "settings");
  try {
    const template = saveEmailTemplate(businessId, templateType, { subject, body });
    revalidatePath(`/b/${businessId}/settings/email-templates`);
    return { data: template };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to save email template." };
  }
}

export async function resetEmailTemplateAction(businessId: string, templateType: string) {
  const { requireModule } = await import("@/core/permissions/require-module");
  const { revalidatePath } = await import("next/cache");
  const { resetEmailTemplate } = await import("./email-template-service");

  await requireModule(businessId, "settings");
  try {
    const template = resetEmailTemplate(businessId, templateType);
    revalidatePath(`/b/${businessId}/settings/email-templates`);
    return { data: template };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to reset email template." };
  }
}

export type BatchEmailResult = {
  sentCount: number;
  skippedCount: number;
  failedCount: number;
  errors: { id: string; number?: string; error: string }[];
};

export async function batchSendDocumentEmailsAction(
  businessId: string,
  documentType: "sales-invoice",
  documentIds: string[],
  options?: {
    customNote?: string;
    attachPdf?: boolean;
  }
): Promise<BatchEmailResult> {
  const { getInvoice } = await import("@/modules/sales-invoices/invoice-service");
  const { buildDocumentEmailContext, buildDocumentEmailDefaults } = await import("./email-defaults");

  const req = new Request("http://localhost/api/dummy", { method: "POST" });
  const { session, access, error: authError } = await requireApiAuth(req, {
    businessId,
    module: "sales",
  });
  if (authError || !session || !access) {
    throw new Error("Unauthorized");
  }

  const result: BatchEmailResult = { sentCount: 0, skippedCount: 0, failedCount: 0, errors: [] };
  const attachPdf = options?.attachPdf ?? true;

  for (const documentId of documentIds) {
    try {
      const record = getInvoice(businessId, session.user.id, documentId);
      if (!record) {
        result.failedCount++;
        result.errors.push({ id: documentId, error: "Invoice not found" });
        continue;
      }

      const email = record.customer.email?.trim();
      if (!email) {
        result.skippedCount++;
        result.errors.push({ id: documentId, number: record.invoice.invoiceNumber, error: "Customer has no email address" });
        continue;
      }

      const context = buildDocumentEmailContext(
        access.business.name,
        "Invoice",
        {
          currencyCode: record.invoice.currencyCode,
          documentNumber: record.invoice.invoiceNumber,
          documentDate: record.invoice.invoiceDate,
          dueDate: record.invoice.dueDate,
          partyName: record.customer.name,
          totalMinor: record.invoice.totalMinor,
          documentStatus: record.invoice.documentStatus,
          balanceMinor: record.balanceMinor,
        },
        email
      );

      const defaults = buildDocumentEmailDefaults(context, email);
      const subject = defaults.subject;
      const bodyHtml = options?.customNote
        ? `${defaults.bodyHtml}<p style="margin-top: 16px; padding: 12px; background: #f4f4f5; border-radius: 6px;"><em>${options.customNote}</em></p>`
        : defaults.bodyHtml;

      const res = await sendDocumentEmailAction(
        businessId,
        documentType,
        documentId,
        record.invoice.invoiceNumber,
        {
          to: email,
          subject,
          bodyHtml,
          bodyText: defaults.bodyText,
          attachPdf,
        }
      );

      if (res.ok && res.status === "sent") {
        result.sentCount++;
      } else {
        result.failedCount++;
        result.errors.push({
          id: documentId,
          number: record.invoice.invoiceNumber,
          error: res.ok ? (res.errorMessage || "Send failed") : res.error,
        });
      }
    } catch (err) {
      result.failedCount++;
      result.errors.push({
        id: documentId,
        error: err instanceof Error ? err.message : "Failed to send email",
      });
    }
  }

  return result;
}

