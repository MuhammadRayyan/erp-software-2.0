"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireModule } from "@/core/permissions/require-module";
import { supplierPaymentInputSchema } from "./supplier-payment-input";
import { createSupplierPayment, voidSupplierPayment } from "./supplier-payment-service";
import { revalidatePath } from "next/cache";

export type SupplierPaymentActionResult = { error?: string; fieldErrors?: Record<string, string[]> };
export async function createSupplierPaymentAction(businessId: string, input: unknown): Promise<SupplierPaymentActionResult> {
  const { user } = await requireModule(businessId, "purchases"); const parsed = supplierPaymentInputSchema.safeParse(input);
  if (!parsed.success) return { error: "Check the payment fields.", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  let result: ReturnType<typeof createSupplierPayment>; try { result = createSupplierPayment(businessId, user.id, parsed.data); } catch (error) { return { error: error instanceof Error ? error.message : "The supplier payment could not be posted." }; }
  redirect(`/b/${businessId}/purchases/invoices/${result.invoiceId}?notice=Supplier payment posted`);
}

export async function voidSupplierPaymentAction(businessId: string, paymentId: string) {
  const { user } = await requireModule(businessId, "purchases");
  try {
    voidSupplierPayment(businessId, user.id, paymentId);
    revalidatePath(`/b/${businessId}/purchases/payments`);
    revalidatePath(`/b/${businessId}/purchases/payments/${paymentId}`);
    return {};
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "The Supplier Payment could not be reversed.",
    };
  }
}
