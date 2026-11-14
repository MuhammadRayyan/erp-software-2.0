"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission, requireSavePermission } from "@/core/permissions/require-module";
import { invoiceInputSchema } from "./invoice-input";
import {
  createInvoice,
  deleteInvoice,
  duplicateInvoice,
  getInvoice,
  postInvoice,
  updateInvoice,
  voidInvoice,
  batchPostInvoices,
  batchVoidInvoices,
  batchDeleteInvoices,
  type InvoiceSaveIntent,
  type BatchActionResult,
} from "./invoice-service";

export type InvoiceActionResult = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
  documentStatus?: "draft" | "pending_approval" | "posted" | "void";
};

import { formatZodFieldErrors } from "@/lib/zod-errors";
const customFieldValuesSchema = z.record(z.string(), z.string()).optional();


export async function createInvoiceAction(
  businessId: string,
  input: unknown,
  intent: InvoiceSaveIntent,
  customFieldValues?: unknown,
): Promise<InvoiceActionResult> {
  const { user } = await requireSavePermission(businessId, "sales", undefined, intent);
  const parsed = invoiceInputSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Check the invoice fields and line items.", fieldErrors: formatZodFieldErrors(parsed.error) };
  }
  const parsedCustomFields = customFieldValuesSchema.safeParse(customFieldValues);
  if (!parsedCustomFields.success) return { error: "Check the highlighted fields." };
  let invoiceId: string;
  try {
    invoiceId = createInvoice(businessId, user.id, parsed.data, intent, parsedCustomFields.data);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The invoice could not be saved. Your entries are still here." };
  }
  const created = getInvoice(businessId, user.id, invoiceId);
  const status = created?.invoice.documentStatus;
  const notice =
    status === "pending_approval"
      ? "Submitted for approval"
      : status === "posted"
        ? parsed.data.applyAvailableCredit
          ? "Invoice posted & advance credit applied"
          : "Invoice posted"
        : "Draft saved";
  revalidatePath(`/b/${businessId}/sales/invoices`);
  revalidatePath(`/b/${businessId}/sales/invoices/${invoiceId}`);
  revalidatePath(`/b/${businessId}/approvals`);
  revalidatePath(`/b/${businessId}/overview`);
  redirect(`/b/${businessId}/sales/invoices/${invoiceId}?notice=${encodeURIComponent(notice)}`);
}

export async function updateInvoiceAction(
  businessId: string,
  invoiceId: string,
  input: unknown,
  intent: InvoiceSaveIntent,
  customFieldValues?: unknown,
): Promise<InvoiceActionResult> {
  const { user } = await requireSavePermission(businessId, "sales", invoiceId, intent);
  const parsed = invoiceInputSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Check the invoice fields and line items.", fieldErrors: formatZodFieldErrors(parsed.error) };
  }
  const parsedCustomFields = customFieldValuesSchema.safeParse(customFieldValues);
  if (!parsedCustomFields.success) return { error: "Check the highlighted fields." };
  try {
    updateInvoice(businessId, user.id, invoiceId, parsed.data, intent, parsedCustomFields.data);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The invoice could not be updated. Your entries are still here." };
  }
  const updated = getInvoice(businessId, user.id, invoiceId);
  const status = updated?.invoice.documentStatus;
  const notice =
    status === "pending_approval"
      ? "Submitted for approval"
      : status === "posted"
        ? "Invoice posting updated"
        : "Draft updated";
  revalidatePath(`/b/${businessId}/sales/invoices`);
  revalidatePath(`/b/${businessId}/sales/invoices/${invoiceId}`);
  revalidatePath(`/b/${businessId}/approvals`);
  revalidatePath(`/b/${businessId}/overview`);
  redirect(`/b/${businessId}/sales/invoices/${invoiceId}?notice=${encodeURIComponent(notice)}`);
}

export async function postInvoiceAction(
  businessId: string,
  invoiceId: string,
  intent: "post" | "submit_approval" = "post",
): Promise<InvoiceActionResult> {
  try {
    const { user, access } = await requirePermission(businessId, "sales", "edit");
    if (intent !== "submit_approval" && !access.requiresApproval) {
      await requirePermission(businessId, "sales", "post");
    }
    const documentStatus = postInvoice(businessId, user.id, invoiceId, intent);
    revalidatePath(`/b/${businessId}/sales/invoices`);
    revalidatePath(`/b/${businessId}/sales/invoices/${invoiceId}`);
    revalidatePath(`/b/${businessId}/approvals`);
    revalidatePath(`/b/${businessId}/overview`);
    return { documentStatus };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The invoice could not be posted." };
  }
}

export async function deleteInvoiceAction(businessId: string, invoiceId: string) {
  try {
    const { user } = await requirePermission(businessId, "sales", "delete");
    deleteInvoice(businessId, user.id, invoiceId);
    revalidatePath(`/b/${businessId}/sales/invoices`);
    return {};
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The invoice could not be deleted." };
  }
}

export async function duplicateInvoiceAction(businessId: string, invoiceId: string) {
  const { user } = await requirePermission(businessId, "sales", "create");
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
  const { user } = await requirePermission(businessId, "sales", "delete");
  try {
    voidInvoice(businessId, user.id, invoiceId);
    revalidatePath(`/b/${businessId}/sales/invoices/${invoiceId}`);
    return {};
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The invoice could not be voided." };
  }
}

export async function batchPostInvoicesAction(
  businessId: string,
  invoiceIds: string[],
  intent: "post" | "submit_approval" = "post",
): Promise<BatchActionResult> {
  const { user, access } = await requirePermission(businessId, "sales", "edit");
  if (intent !== "submit_approval" && !access.requiresApproval) {
    await requirePermission(businessId, "sales", "post");
  }
  const result = batchPostInvoices(businessId, user.id, invoiceIds, intent);
  revalidatePath(`/b/${businessId}/sales/invoices`);
  revalidatePath(`/b/${businessId}/approvals`);
  revalidatePath(`/b/${businessId}/overview`);
  return result;
}

export async function batchVoidInvoicesAction(businessId: string, invoiceIds: string[]): Promise<BatchActionResult> {
  const { user } = await requirePermission(businessId, "sales", "delete");
  const result = batchVoidInvoices(businessId, user.id, invoiceIds);
  revalidatePath(`/b/${businessId}/sales/invoices`);
  return result;
}

export async function batchDeleteInvoicesAction(businessId: string, invoiceIds: string[]): Promise<BatchActionResult> {
  const { user } = await requirePermission(businessId, "sales", "delete");
  const result = batchDeleteInvoices(businessId, user.id, invoiceIds);
  revalidatePath(`/b/${businessId}/sales/invoices`);
  return result;
}
