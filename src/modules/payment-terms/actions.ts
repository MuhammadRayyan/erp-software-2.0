"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/core/permissions/require-module";
import {
  createPaymentTerm,
  updatePaymentTerm,
  deletePaymentTerm,
  setDefaultPaymentTerm,
} from "./payment-terms-service";

export async function createPaymentTermAction(
  businessId: string,
  input: {
    name: string;
    days_count?: number;
    term_type?: "days_after_invoice" | "end_of_month";
    is_default?: boolean;
  }
) {
  const { user } = await requirePermission(businessId, "settings", "edit");
  try {
    const term = createPaymentTerm(businessId, user.id, input);
    revalidatePath(`/b/${businessId}/settings/payment-terms`);
    return { data: term };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Payment term could not be created." };
  }
}

export async function updatePaymentTermAction(
  businessId: string,
  id: string,
  input: {
    name: string;
    days_count?: number;
    term_type?: "days_after_invoice" | "end_of_month";
    is_default?: boolean;
  }
) {
  const { user } = await requirePermission(businessId, "settings", "edit");
  try {
    const term = updatePaymentTerm(businessId, user.id, id, input);
    revalidatePath(`/b/${businessId}/settings/payment-terms`);
    return { data: term };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Payment term could not be updated." };
  }
}

export async function deletePaymentTermAction(businessId: string, id: string) {
  const { user } = await requirePermission(businessId, "settings", "edit");
  try {
    deletePaymentTerm(businessId, user.id, id);
    revalidatePath(`/b/${businessId}/settings/payment-terms`);
    return {};
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Payment term could not be deleted." };
  }
}

export async function setDefaultPaymentTermAction(businessId: string, id: string) {
  const { user } = await requirePermission(businessId, "settings", "edit");
  try {
    setDefaultPaymentTerm(businessId, user.id, id);
    revalidatePath(`/b/${businessId}/settings/payment-terms`);
    return {};
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not set default payment term." };
  }
}
