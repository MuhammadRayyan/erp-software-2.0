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
  postInvoice,
  updateInvoice,
  voidInvoice,
  batchPostInvoices,
  batchVoidInvoices,
  batchDeleteInvoices,
  type InvoiceSaveIntent,
  type BatchActionResult,
} from "./invoice-service";

export type InvoiceActionResult = { error?: string; fieldErrors?: Record<string, string[]> };

const customFieldValuesSchema = z.record(z.string(), z.string()).optional();

export async function createInvoiceAction(
  businessId: string,
  input: unknown,
  intent: InvoiceSaveIntent,
  customFieldValues?: unknown,
): Promise<InvoiceActionResult> {
  const { user } = await requireModule(businessId, "sales");
  const parsed = invoiceInputSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Check the invoice fields and line items.", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }
  const parsedCustomFields = customFieldValuesSchema.safeParse(customFieldValues);
  if (!parsedCustomFields.success) return { error: "Check the highlighted fields." };
  let invoiceId: string;
  try {
    invoiceId = createInvoice(businessId, user.id, parsed.data, intent, parsedCustomFields.data);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The invoice could not be saved. Your entries are still here." };
  }
  const notice =
    intent === "post"
      ? parsed.data.applyAvailableCredit
        ? "Invoice posted & advance credit applied"
        : "Invoice posted"
      : "Draft saved";
  revalidatePath(`/b/${businessId}/sales/invoices`);
  revalidatePath(`/b/${businessId}/sales/invoices/${invoiceId}`);
  redirect(`/b/${businessId}/sales/invoices/${invoiceId}?notice=${encodeURIComponent(notice)}`);
}

export async function updateInvoiceAction(
  businessId: string,
  invoiceId: string,
  input: unknown,
  intent: InvoiceSaveIntent,
  customFieldValues?: unknown,
): Promise<InvoiceActionResult> {
  const { user } = await requireModule(businessId, "sales");
  const parsed = invoiceInputSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Check the invoice fields and line items.", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }
  const parsedCustomFields = customFieldValuesSchema.safeParse(customFieldValues);
  if (!parsedCustomFields.success) return { error: "Check the highlighted fields." };
  try {
    updateInvoice(businessId, user.id, invoiceId, parsed.data, intent, parsedCustomFields.data);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The invoice could not be updated. Your entries are still here." };
  }
  revalidatePath(`/b/${businessId}/sales/invoices`);
  revalidatePath(`/b/${businessId}/sales/invoices/${invoiceId}`);
  redirect(`/b/${businessId}/sales/invoices/${invoiceId}?notice=${encodeURIComponent(intent === "post" ? "Invoice posting updated" : "Draft updated")}`);
}

export async function postInvoiceAction(businessId: string, invoiceId: string): Promise<InvoiceActionResult> {
  const { user } = await requireModule(businessId, "sales");
  try {
    postInvoice(businessId, user.id, invoiceId);
    revalidatePath(`/b/${businessId}/sales/invoices`);
    revalidatePath(`/b/${businessId}/sales/invoices/${invoiceId}`);
    return {};
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The invoice could not be posted." };
  }
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
  revalidatePath(`/b/${businessId}/sales/invoices`);
  revalidatePath(`/b/${businessId}/sales/invoices/${duplicateId}`);
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

export async function batchPostInvoicesAction(businessId: string, invoiceIds: string[]): Promise<BatchActionResult> {
  const { user } = await requireModule(businessId, "sales");
  const result = batchPostInvoices(businessId, user.id, invoiceIds);
  revalidatePath(`/b/${businessId}/sales/invoices`);
  return result;
}

export async function batchVoidInvoicesAction(businessId: string, invoiceIds: string[]): Promise<BatchActionResult> {
  const { user } = await requireModule(businessId, "sales");
  const result = batchVoidInvoices(businessId, user.id, invoiceIds);
  revalidatePath(`/b/${businessId}/sales/invoices`);
  return result;
}

export async function batchDeleteInvoicesAction(businessId: string, invoiceIds: string[]): Promise<BatchActionResult> {
  const { user } = await requireModule(businessId, "sales");
  const result = batchDeleteInvoices(businessId, user.id, invoiceIds);
  revalidatePath(`/b/${businessId}/sales/invoices`);
  return result;
}
