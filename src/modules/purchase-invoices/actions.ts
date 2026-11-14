"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSavePermission, requirePermission } from "@/core/permissions/require-module";
import { purchaseInvoiceInputSchema } from "./purchase-invoice-input";
import {
  deletePurchaseInvoice,
  duplicatePurchaseInvoice,
  getPurchaseInvoice,
  postPurchaseInvoiceDoc,
  savePurchaseInvoice,
  voidPurchaseInvoice,
  batchPostPurchaseInvoices,
  batchVoidPurchaseInvoices,
  batchDeletePurchaseInvoices,
  type PurchaseInvoiceIntent,
  type BatchPurchaseActionResult,
} from "./purchase-invoice-service";

import { formatZodFieldErrors } from "@/lib/zod-errors";

export type PurchaseInvoiceActionResult = { error?: string; fieldErrors?: Record<string, string[]> };

export async function savePurchaseInvoiceAction(businessId: string, invoiceId: string | null, input: unknown, intent: PurchaseInvoiceIntent): Promise<PurchaseInvoiceActionResult> {
  const { user } = await requireSavePermission(businessId, "purchases", invoiceId, intent);
  const parsed = purchaseInvoiceInputSchema.safeParse(input);
  if (!parsed.success) return { error: "Check the purchase invoice fields and lines.", fieldErrors: formatZodFieldErrors(parsed.error) };
  let id: string;
  try { id = savePurchaseInvoice(businessId, user.id, parsed.data, intent, invoiceId ?? undefined); }
  catch (error) { return { error: error instanceof Error ? error.message : "The purchase invoice could not be saved." }; }
  const saved = getPurchaseInvoice(businessId, user.id, id);
  const status = saved?.invoice.documentStatus;
  const notice =
    status === "pending_approval"
      ? "Submitted for approval"
      : status === "posted"
        ? parsed.data.applyAvailablePrepayment
          ? "Purchase invoice posted & prepayment applied"
          : "Purchase invoice posted"
        : "Draft saved";
  revalidatePath(`/b/${businessId}/purchases/invoices`);
  revalidatePath(`/b/${businessId}/purchases/invoices/${id}`);
  revalidatePath(`/b/${businessId}/approvals`);
  revalidatePath(`/b/${businessId}/overview`);
  redirect(`/b/${businessId}/purchases/invoices/${id}?notice=${encodeURIComponent(notice)}`);
}

export async function duplicatePurchaseInvoiceAction(businessId: string, invoiceId: string) {
  const { user } = await requirePermission(businessId, "purchases", "create");
  try {
    const id = duplicatePurchaseInvoice(businessId, user.id, invoiceId);
    revalidatePath(`/b/${businessId}/purchases/invoices`);
    revalidatePath(`/b/${businessId}/purchases/invoices/${id}`);
    redirect(`/b/${businessId}/purchases/invoices/${id}?notice=Purchase invoice duplicated as draft`);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The purchase invoice could not be duplicated." };
  }
}
export async function deletePurchaseInvoiceAction(businessId: string, invoiceId: string) { const { user } = await requirePermission(businessId, "purchases", "delete"); try { deletePurchaseInvoice(businessId, user.id, invoiceId); revalidatePath(`/b/${businessId}/purchases/invoices`); return {}; } catch (error) { return { error: error instanceof Error ? error.message : "The purchase invoice could not be deleted." }; } }
export async function voidPurchaseInvoiceAction(businessId: string, invoiceId: string) { const { user } = await requirePermission(businessId, "purchases", "delete"); try { voidPurchaseInvoice(businessId, user.id, invoiceId); revalidatePath(`/b/${businessId}/purchases/invoices/${invoiceId}`); return {}; } catch (error) { return { error: error instanceof Error ? error.message : "The purchase invoice could not be voided." }; } }

export async function postPurchaseInvoiceAction(
  businessId: string,
  invoiceId: string,
  intent: "post" | "submit_approval" = "post",
): Promise<{ error?: string; documentStatus?: "draft" | "pending_approval" | "posted" | "void" }> {
  const { user, access } = await requirePermission(businessId, "purchases", "edit");
  if (intent !== "submit_approval" && !access.requiresApproval) {
    await requirePermission(businessId, "purchases", "post");
  }
  try {
    const documentStatus = postPurchaseInvoiceDoc(businessId, user.id, invoiceId, intent);
    revalidatePath(`/b/${businessId}/purchases/invoices`);
    revalidatePath(`/b/${businessId}/purchases/invoices/${invoiceId}`);
    revalidatePath(`/b/${businessId}/approvals`);
    revalidatePath(`/b/${businessId}/overview`);
    return { documentStatus };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The purchase bill could not be posted." };
  }
}

export async function batchPostPurchaseInvoicesAction(
  businessId: string,
  invoiceIds: string[],
  intent: "post" | "submit_approval" = "post",
): Promise<BatchPurchaseActionResult> {
  const { user, access } = await requirePermission(businessId, "purchases", "edit");
  if (intent !== "submit_approval" && !access.requiresApproval) {
    await requirePermission(businessId, "purchases", "post");
  }
  const result = batchPostPurchaseInvoices(businessId, user.id, invoiceIds, intent);
  revalidatePath(`/b/${businessId}/purchases/invoices`);
  revalidatePath(`/b/${businessId}/approvals`);
  revalidatePath(`/b/${businessId}/overview`);
  return result;
}

export async function batchVoidPurchaseInvoicesAction(businessId: string, invoiceIds: string[]): Promise<BatchPurchaseActionResult> {
  const { user } = await requirePermission(businessId, "purchases", "delete");
  const result = batchVoidPurchaseInvoices(businessId, user.id, invoiceIds);
  revalidatePath(`/b/${businessId}/purchases/invoices`);
  return result;
}

export async function batchDeletePurchaseInvoicesAction(businessId: string, invoiceIds: string[]): Promise<BatchPurchaseActionResult> {
  const { user } = await requirePermission(businessId, "purchases", "delete");
  const result = batchDeletePurchaseInvoices(businessId, user.id, invoiceIds);
  revalidatePath(`/b/${businessId}/purchases/invoices`);
  return result;
}
