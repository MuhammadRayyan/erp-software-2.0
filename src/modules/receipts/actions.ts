"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/core/permissions/require-module";
import { receiptInputSchema, applyReceiptCreditInputSchema } from "./receipt-input";
import { createReceipt, voidReceipt, applyReceiptCredit, submitOrPostDraftReceipt, deleteDraftReceipt } from "./receipt-service";
import { revalidatePath } from "next/cache";

export type ReceiptActionResult = { error?: string; fieldErrors?: Record<string, string[]> };

export async function createReceiptAction(
  businessId: string,
  input: unknown,
): Promise<ReceiptActionResult> {
  const { user } = await requirePermission(businessId, "sales", "create");
  const parsed = receiptInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      error: "Check the receipt fields.",
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
    };
  }
  let result: ReturnType<typeof createReceipt>;
  try {
    result = createReceipt(businessId, user.id, parsed.data);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The receipt could not be posted." };
  }
  revalidatePath(`/b/${businessId}/sales/receipts`);
  revalidatePath(`/b/${businessId}/sales/invoices`);
  revalidatePath(`/b/${businessId}/approvals`);
  revalidatePath(`/b/${businessId}/overview`);
  const notice = result.documentStatus === "pending_approval" ? "Receipt submitted for approval" : "Receipt posted";
  redirect(`/b/${businessId}/sales/receipts/${result.id}?notice=${encodeURIComponent(notice)}`);
}

export async function applyReceiptCreditAction(
  businessId: string,
  input: unknown,
) {
  const { user } = await requirePermission(businessId, "sales", "post");
  const parsed = applyReceiptCreditInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      error: "Check the credit allocation fields.",
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
    };
  }
  try {
    applyReceiptCredit(businessId, user.id, parsed.data);
    revalidatePath(`/b/${businessId}/sales/invoices/${parsed.data.invoiceId}`);
    revalidatePath(`/b/${businessId}/sales/receipts/${parsed.data.receiptId}`);
    revalidatePath(`/b/${businessId}/sales/invoices`);
    return { ok: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The credit could not be applied." };
  }
}

export async function voidReceiptAction(businessId: string, receiptId: string) {
  const { user } = await requirePermission(businessId, "sales", "delete");
  try {
    voidReceipt(businessId, user.id, receiptId);
    revalidatePath(`/b/${businessId}/sales/receipts`);
    revalidatePath(`/b/${businessId}/sales/receipts/${receiptId}`);
    return {};
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The Receipt could not be reversed." };
  }
}

export async function submitOrPostDraftReceiptAction(
  businessId: string,
  receiptId: string,
  intent: "post" | "submit_approval" = "post",
) {
  const { user, access } = await requirePermission(businessId, "sales", "edit");
  if (intent !== "submit_approval" && !access.requiresApproval) {
    await requirePermission(businessId, "sales", "post");
  }
  try {
    const result = submitOrPostDraftReceipt(businessId, user.id, receiptId, intent);
    revalidatePath(`/b/${businessId}/sales/receipts`);
    revalidatePath(`/b/${businessId}/sales/receipts/${receiptId}`);
    revalidatePath(`/b/${businessId}/sales/invoices`);
    revalidatePath(`/b/${businessId}/approvals`);
    revalidatePath(`/b/${businessId}/overview`);
    return { ok: true, documentStatus: result.documentStatus };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The Receipt could not be submitted." };
  }
}

export async function deleteDraftReceiptAction(businessId: string, receiptId: string) {
  const { user } = await requirePermission(businessId, "sales", "delete");
  try {
    deleteDraftReceipt(businessId, user.id, receiptId);
    revalidatePath(`/b/${businessId}/sales/receipts`);
    revalidatePath(`/b/${businessId}/approvals`);
    revalidatePath(`/b/${businessId}/overview`);
    return { ok: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The draft receipt could not be deleted." };
  }
}
