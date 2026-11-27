"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/core/permissions/require-module";
import { formatZodFieldErrors } from "@/lib/zod-errors";
import { applyNoteCreditInputSchema, partyRefundInputSchema } from "./party-credit-input";
import {
  applyCreditNoteToInvoice,
  applyDebitNoteToPurchaseInvoice,
  createCustomerRefund,
  createSupplierRefund,
  voidCustomerRefund,
  voidSupplierRefund,
} from "./party-credit-service";

export type PartyCreditActionResult = { error?: string; fieldErrors?: Record<string, string[]> };

function revalidateCustomerCredit(businessId: string, noteId?: string) {
  revalidatePath(`/b/${businessId}/sales/credit-notes`);
  if (noteId) revalidatePath(`/b/${businessId}/sales/credit-notes/${noteId}`);
  revalidatePath(`/b/${businessId}/sales/invoices`, "layout");
  revalidatePath(`/b/${businessId}/customers`, "layout");
}

function revalidateSupplierCredit(businessId: string, noteId?: string) {
  revalidatePath(`/b/${businessId}/purchases/debit-notes`);
  if (noteId) revalidatePath(`/b/${businessId}/purchases/debit-notes/${noteId}`);
  revalidatePath(`/b/${businessId}/purchases/invoices`, "layout");
  revalidatePath(`/b/${businessId}/suppliers`, "layout");
}

function failure(error: unknown, fallback: string): PartyCreditActionResult {
  return { error: error instanceof Error ? error.message : fallback };
}

export async function applyCreditNoteCreditAction(businessId: string, input: unknown): Promise<PartyCreditActionResult> {
  const { user } = await requirePermission(businessId, "sales", "post");
  const parsed = applyNoteCreditInputSchema.safeParse(input);
  if (!parsed.success) return { error: "Check the amount and invoice.", fieldErrors: formatZodFieldErrors(parsed.error) };
  try {
    applyCreditNoteToInvoice(businessId, user.id, parsed.data);
  } catch (error) {
    return failure(error, "The credit could not be applied.");
  }
  revalidateCustomerCredit(businessId, parsed.data.noteId);
  return {};
}

export async function applyDebitNoteCreditAction(businessId: string, input: unknown): Promise<PartyCreditActionResult> {
  const { user } = await requirePermission(businessId, "purchases", "post");
  const parsed = applyNoteCreditInputSchema.safeParse(input);
  if (!parsed.success) return { error: "Check the amount and purchase invoice.", fieldErrors: formatZodFieldErrors(parsed.error) };
  try {
    applyDebitNoteToPurchaseInvoice(businessId, user.id, parsed.data);
  } catch (error) {
    return failure(error, "The credit could not be applied.");
  }
  revalidateSupplierCredit(businessId, parsed.data.noteId);
  return {};
}

export async function createCustomerRefundAction(businessId: string, input: unknown): Promise<PartyCreditActionResult> {
  const { user } = await requirePermission(businessId, "sales", "post");
  const parsed = partyRefundInputSchema.safeParse(input);
  if (!parsed.success) return { error: "Check the refund fields.", fieldErrors: formatZodFieldErrors(parsed.error) };
  try {
    createCustomerRefund(businessId, user.id, parsed.data);
  } catch (error) {
    return failure(error, "The refund could not be posted.");
  }
  revalidateCustomerCredit(businessId, parsed.data.noteId);
  revalidatePath(`/b/${businessId}/banking`, "layout");
  return {};
}

export async function createSupplierRefundAction(businessId: string, input: unknown): Promise<PartyCreditActionResult> {
  const { user } = await requirePermission(businessId, "purchases", "post");
  const parsed = partyRefundInputSchema.safeParse(input);
  if (!parsed.success) return { error: "Check the refund fields.", fieldErrors: formatZodFieldErrors(parsed.error) };
  try {
    createSupplierRefund(businessId, user.id, parsed.data);
  } catch (error) {
    return failure(error, "The refund could not be posted.");
  }
  revalidateSupplierCredit(businessId, parsed.data.noteId);
  revalidatePath(`/b/${businessId}/banking`, "layout");
  return {};
}

export async function voidCustomerRefundAction(businessId: string, refundId: string, noteId: string): Promise<PartyCreditActionResult> {
  const { user } = await requirePermission(businessId, "sales", "delete");
  try {
    voidCustomerRefund(businessId, user.id, refundId);
  } catch (error) {
    return failure(error, "The refund could not be voided.");
  }
  revalidateCustomerCredit(businessId, noteId);
  return {};
}

export async function voidSupplierRefundAction(businessId: string, refundId: string, noteId: string): Promise<PartyCreditActionResult> {
  const { user } = await requirePermission(businessId, "purchases", "delete");
  try {
    voidSupplierRefund(businessId, user.id, refundId);
  } catch (error) {
    return failure(error, "The refund could not be voided.");
  }
  revalidateSupplierCredit(businessId, noteId);
  return {};
}
