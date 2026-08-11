"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireModule } from "@/core/permissions/require-module";
import { prepareEInvoice, submitEInvoice } from "./einvoice-service";
import { eInvoiceSettingsInputSchema } from "./settings-input";
import { updateEInvoiceSettings } from "./settings-service";

export type EInvoiceActionResult = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
  documentId?: string;
  status?: string;
};

function message(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export async function prepareEInvoiceAction(
  businessId: string,
  sourceType: "sales_invoice" | "sales_credit_note",
  sourceId: string,
): Promise<EInvoiceActionResult> {
  try {
    const { user } = await requireModule(businessId, "sales");
    const document = prepareEInvoice(businessId, user.id, sourceType, sourceId);
    revalidatePath(`/b/${businessId}/einvoicing`);
    revalidatePath(`/b/${businessId}/sales/invoices/${sourceId}`);
    revalidatePath(`/b/${businessId}/sales/credit-notes/${sourceId}`);
    return { documentId: document.id, status: document.status };
  } catch (error) {
    return { error: message(error, "The eInvoice could not be prepared.") };
  }
}

export async function submitEInvoiceAction(
  businessId: string,
  documentId: string,
  scenario: string,
): Promise<EInvoiceActionResult> {
  try {
    const { user } = await requireModule(businessId, "sales");
    const document = await submitEInvoice(businessId, user.id, documentId, scenario);
    revalidatePath(`/b/${businessId}/einvoicing`);
    revalidatePath(`/b/${businessId}/einvoicing/${documentId}`);
    revalidatePath(`/b/${businessId}/sales/invoices/${document.sourceId}`);
    revalidatePath(`/b/${businessId}/sales/credit-notes/${document.sourceId}`);
    return { documentId: document.id, status: document.status };
  } catch (error) {
    return { error: message(error, "The eInvoice could not be submitted.") };
  }
}

export async function saveEInvoiceSettingsAction(businessId: string, input: unknown): Promise<EInvoiceActionResult> {
  try {
    const { user, access } = await requireModule(businessId, "settings");
    if (access.membership.role !== "administrator") throw new Error("Only a business Administrator can change Electronic Invoicing settings.");
    const parsed = eInvoiceSettingsInputSchema.safeParse(input);
    if (!parsed.success) {
      return { error: "Check the Electronic Invoicing settings.", fieldErrors: z.flattenError(parsed.error).fieldErrors };
    }
    updateEInvoiceSettings(businessId, user.id, parsed.data);
    revalidatePath(`/b/${businessId}/settings/einvoicing`);
    revalidatePath(`/b/${businessId}/einvoicing`);
    return {};
  } catch (error) {
    return { error: message(error, "Electronic Invoicing settings could not be saved.") };
  }
}
