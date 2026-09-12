"use server";

import { z } from "zod";
import { requireApiAuth } from "@/core/auth/api-auth";
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
  // Use requireApiAuth to easily resolve access for any document type without manually mapping
  // the documentType to a specific module name (e.g., "sales" vs "purchases").
  // Since server actions run on POST, we pass a dummy Request object.
  const req = new Request("http://localhost/api/dummy", { method: "POST" });
  const { session, access } = await requireApiAuth(req, { businessId });
  if (!session || !access) {
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

  // Determine entity type for the email relationship
  const entityType = documentType.replace("-", "_") as any;

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
