"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/core/permissions/require-module";
import { receiptInputSchema, applyReceiptCreditInputSchema } from "./receipt-input";
import { createReceipt, voidReceipt, applyReceiptCredit } from "./receipt-service";
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
  if (result.allocations && result.allocations.length === 1 && result.allocations[0]?.invoiceId && result.unallocatedMinor === 0) {
    redirect(`/b/${businessId}/sales/invoices/${result.allocations[0].invoiceId}?notice=Receipt posted`);
  } else {
    redirect(`/b/${businessId}/sales/receipts/${result.id}?notice=Receipt posted`);
  }
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
