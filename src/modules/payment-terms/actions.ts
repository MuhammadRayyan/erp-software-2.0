"use server";

import { revalidatePath } from "next/cache";
import { requireModule } from "@/core/permissions/require-module";
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
  await requireModule(businessId, "settings");
  try {
    const term = createPaymentTerm(businessId, input);
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
  await requireModule(businessId, "settings");
  try {
    const term = updatePaymentTerm(businessId, id, input);
    revalidatePath(`/b/${businessId}/settings/payment-terms`);
    return { data: term };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Payment term could not be updated." };
  }
}

export async function deletePaymentTermAction(businessId: string, id: string) {
  await requireModule(businessId, "settings");
  try {
    deletePaymentTerm(businessId, id);
    revalidatePath(`/b/${businessId}/settings/payment-terms`);
    return {};
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Payment term could not be deleted." };
  }
}

export async function setDefaultPaymentTermAction(businessId: string, id: string) {
  await requireModule(businessId, "settings");
  try {
    setDefaultPaymentTerm(businessId, id);
    revalidatePath(`/b/${businessId}/settings/payment-terms`);
    return {};
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not set default payment term." };
  }
}
