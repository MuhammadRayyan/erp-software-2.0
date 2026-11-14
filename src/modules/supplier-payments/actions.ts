"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/core/permissions/require-module";
import { supplierPaymentInputSchema, applySupplierPaymentCreditInputSchema } from "./supplier-payment-input";
import { createSupplierPayment, voidSupplierPayment, applySupplierPaymentCredit, submitOrPostDraftSupplierPayment, deleteDraftSupplierPayment } from "./supplier-payment-service";
import { revalidatePath } from "next/cache";

export type SupplierPaymentActionResult = { error?: string; fieldErrors?: Record<string, string[]> };

export async function createSupplierPaymentAction(businessId: string, input: unknown): Promise<SupplierPaymentActionResult> {
  const { user } = await requirePermission(businessId, "purchases", "create");
  const parsed = supplierPaymentInputSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Check the payment fields.", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }
  let result: ReturnType<typeof createSupplierPayment>;
  try {
    result = createSupplierPayment(businessId, user.id, parsed.data);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The supplier payment could not be posted." };
  }
  revalidatePath(`/b/${businessId}/purchases/payments`);
  revalidatePath(`/b/${businessId}/purchases/invoices`);
  revalidatePath(`/b/${businessId}/approvals`);
  revalidatePath(`/b/${businessId}/overview`);
  const notice = result.documentStatus === "pending_approval" ? "Payment submitted for approval" : "Supplier payment posted";
  redirect(`/b/${businessId}/purchases/payments/${result.id}?notice=${encodeURIComponent(notice)}`);
}

export async function applySupplierPaymentCreditAction(
  businessId: string,
  input: unknown,
) {
  const { user } = await requirePermission(businessId, "purchases", "post");
  const parsed = applySupplierPaymentCreditInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      error: "Check the credit allocation fields.",
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
    };
  }
  try {
    applySupplierPaymentCredit(businessId, user.id, parsed.data);
    revalidatePath(`/b/${businessId}/purchases/invoices/${parsed.data.invoiceId}`);
    revalidatePath(`/b/${businessId}/purchases/payments/${parsed.data.paymentId}`);
    revalidatePath(`/b/${businessId}/purchases/invoices`);
    return { ok: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The credit could not be applied." };
  }
}

export async function voidSupplierPaymentAction(businessId: string, paymentId: string) {
  const { user } = await requirePermission(businessId, "purchases", "delete");
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

export async function submitOrPostDraftSupplierPaymentAction(
  businessId: string,
  paymentId: string,
  intent: "post" | "submit_approval" = "post",
) {
  const { user, access } = await requirePermission(businessId, "purchases", "edit");
  if (intent !== "submit_approval" && !access.requiresApproval) {
    await requirePermission(businessId, "purchases", "post");
  }
  try {
    const result = submitOrPostDraftSupplierPayment(businessId, user.id, paymentId, intent);
    revalidatePath(`/b/${businessId}/purchases/payments`);
    revalidatePath(`/b/${businessId}/purchases/payments/${paymentId}`);
    revalidatePath(`/b/${businessId}/purchases/invoices`);
    revalidatePath(`/b/${businessId}/approvals`);
    revalidatePath(`/b/${businessId}/overview`);
    return { ok: true, documentStatus: result.documentStatus };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "The Supplier Payment could not be submitted.",
    };
  }
}

export async function deleteDraftSupplierPaymentAction(businessId: string, paymentId: string) {
  const { user } = await requirePermission(businessId, "purchases", "delete");
  try {
    deleteDraftSupplierPayment(businessId, user.id, paymentId);
    revalidatePath(`/b/${businessId}/purchases/payments`);
    revalidatePath(`/b/${businessId}/approvals`);
    revalidatePath(`/b/${businessId}/overview`);
    return { ok: true };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "The draft supplier payment could not be deleted.",
    };
  }
}
