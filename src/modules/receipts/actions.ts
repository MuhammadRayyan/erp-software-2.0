"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireModule } from "@/core/permissions/require-module";
import { receiptInputSchema } from "./receipt-input";
import { createReceipt, voidReceipt } from "./receipt-service";
import { revalidatePath } from "next/cache";

export type ReceiptActionResult = { error?: string; fieldErrors?: Record<string, string[]> };

export async function createReceiptAction(
  businessId: string,
  input: unknown,
): Promise<ReceiptActionResult> {
  const { user } = await requireModule(businessId, "sales");
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
  redirect(`/b/${businessId}/sales/invoices/${result.invoiceId}?notice=Receipt posted`);
}

export async function voidReceiptAction(businessId: string, receiptId: string) {
  const { user } = await requireModule(businessId, "sales");
  try {
    voidReceipt(businessId, user.id, receiptId);
    revalidatePath(`/b/${businessId}/sales/receipts`);
    revalidatePath(`/b/${businessId}/sales/receipts/${receiptId}`);
    return {};
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The Receipt could not be reversed." };
  }
}
