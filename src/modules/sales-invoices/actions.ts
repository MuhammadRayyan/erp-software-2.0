"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireModule } from "@/core/permissions/require-module";
import { invoiceInputSchema } from "./invoice-input";
import {
  createInvoice,
  deleteInvoice,
  duplicateInvoice,
  updateInvoice,
  voidInvoice,
  type InvoiceSaveIntent,
} from "./invoice-service";

export type InvoiceActionResult = { error?: string; fieldErrors?: Record<string, string[]> };

export async function createInvoiceAction(
  businessId: string,
  input: unknown,
  intent: InvoiceSaveIntent,
): Promise<InvoiceActionResult> {
  const { user } = await requireModule(businessId, "sales");
  const parsed = invoiceInputSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Check the invoice fields and line items.", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }
  let invoiceId: string;
  try {
    invoiceId = createInvoice(businessId, user.id, parsed.data, intent);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The invoice could not be saved. Your entries are still here." };
  }
  const notice = intent === "post" ? "Invoice posted" : "Draft saved";
  redirect(`/b/${businessId}/sales/invoices/${invoiceId}?notice=${encodeURIComponent(notice)}`);
}

export async function updateInvoiceAction(
  businessId: string,
  invoiceId: string,
  input: unknown,
  intent: InvoiceSaveIntent,
): Promise<InvoiceActionResult> {
  const { user } = await requireModule(businessId, "sales");
  const parsed = invoiceInputSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Check the invoice fields and line items.", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }
  try {
    updateInvoice(businessId, user.id, invoiceId, parsed.data, intent);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The invoice could not be updated. Your entries are still here." };
  }
  redirect(`/b/${businessId}/sales/invoices/${invoiceId}?notice=${encodeURIComponent(intent === "post" ? "Invoice posting updated" : "Draft updated")}`);
}

export async function deleteInvoiceAction(businessId: string, invoiceId: string) {
  const { user } = await requireModule(businessId, "sales");
  try {
    deleteInvoice(businessId, user.id, invoiceId);
    revalidatePath(`/b/${businessId}/sales/invoices`);
    return {};
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The invoice could not be deleted." };
  }
}

export async function duplicateInvoiceAction(businessId: string, invoiceId: string) {
  const { user } = await requireModule(businessId, "sales");
  let duplicateId: string;
  try {
    duplicateId = duplicateInvoice(businessId, user.id, invoiceId);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The invoice could not be duplicated." };
  }
  redirect(`/b/${businessId}/sales/invoices/${duplicateId}?notice=${encodeURIComponent("Invoice duplicated as draft")}`);
}

export async function voidInvoiceAction(businessId: string, invoiceId: string) {
  const { user } = await requireModule(businessId, "sales");
  try {
    voidInvoice(businessId, user.id, invoiceId);
    revalidatePath(`/b/${businessId}/sales/invoices/${invoiceId}`);
    return {};
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The invoice could not be voided." };
  }
}
