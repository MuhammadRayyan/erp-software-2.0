"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireApiAuth } from "@/core/auth/api-auth";
import {
  saveEmailSettings,
  verifyAndSendTestEmail,
  sanitizeEmailSettingsForClient,
} from "./email-settings-service";

const saveEmailSettingsSchema = z.object({
  senderName: z.string().max(100).optional().nullable(),
  senderEmail: z
    .string()
    .trim()
    .email("Enter a valid sender email address.")
    .optional()
    .nullable()
    .or(z.literal("")),
  replyToEmail: z
    .string()
    .trim()
    .email("Enter a valid reply-to email address.")
    .optional()
    .nullable()
    .or(z.literal("")),
  smtpHost: z.string().max(255).optional().nullable(),
  smtpPort: z.coerce.number().int().min(1).max(65535).optional().nullable(),
  smtpSecure: z.boolean().default(false),
  smtpUser: z.string().max(255).optional().nullable(),
  smtpPass: z.string().optional().nullable(),
  isActive: z.boolean().default(false),
});

const sendTestEmailSchema = z.object({
  recipient: z.string().trim().email("Enter a valid recipient email address."),
  senderName: z.string().max(100).optional().nullable(),
  senderEmail: z.string().trim().optional().nullable().or(z.literal("")),
  smtpHost: z.string().max(255).optional().nullable(),
  smtpPort: z.coerce.number().int().min(1).max(65535).optional().nullable(),
  smtpSecure: z.boolean().default(false),
  smtpUser: z.string().max(255).optional().nullable(),
  smtpPass: z.string().optional().nullable(),
});

export async function saveEmailSettingsAction(businessId: string, input: unknown) {
  const req = new Request("http://localhost/api/dummy", { method: "POST" });
  const { session, access, error: authError } = await requireApiAuth(req, {
    businessId,
    module: "settings",
  });
  if (authError || !session || !access || access.membership.role !== "administrator") {
    return { ok: false, error: "Unauthorized: Administrator permissions required." };
  }

  const parsed = saveEmailSettingsSchema.safeParse(input);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]?.message || "Validation failed";
    return { ok: false, error: firstIssue };
  }

  try {
    const updated = saveEmailSettings(businessId, session.user.id, {
      ...parsed.data,
      senderEmail: parsed.data.senderEmail || null,
      replyToEmail: parsed.data.replyToEmail || null,
      smtpHost: parsed.data.smtpHost || null,
      smtpUser: parsed.data.smtpUser || null,
      smtpPass: parsed.data.smtpPass ?? undefined,
    });

    revalidatePath(`/b/${businessId}/settings/email`);
    return { ok: true, settings: sanitizeEmailSettingsForClient(updated) };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to save email settings.",
    };
  }
}

export async function sendTestEmailAction(businessId: string, input: unknown) {
  const req = new Request("http://localhost/api/dummy", { method: "POST" });
  const { session, access, error: authError } = await requireApiAuth(req, {
    businessId,
    module: "settings",
  });
  if (authError || !session || !access || access.membership.role !== "administrator") {
    return { ok: false, error: "Unauthorized: Administrator permissions required." };
  }

  const parsed = sendTestEmailSchema.safeParse(input);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]?.message || "Validation failed";
    return { ok: false, error: firstIssue };
  }

  try {
    const result = await verifyAndSendTestEmail(businessId, session.user.id, {
      ...parsed.data,
      senderEmail: parsed.data.senderEmail || null,
      smtpHost: parsed.data.smtpHost || null,
      smtpUser: parsed.data.smtpUser || null,
      smtpPass: parsed.data.smtpPass ?? undefined,
    });

    revalidatePath(`/b/${businessId}/settings/email`);
    return result.success
      ? { ok: true, message: result.message || "Test email delivered successfully.", settings: result.settings }
      : { ok: false, error: result.error || "Test email delivery failed.", settings: result.settings };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to execute SMTP test.",
    };
  }
}
