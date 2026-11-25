"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/core/permissions/require-module";
import { createCustomer, updateCustomer } from "./customer-service";
import { customerInputSchema } from "./customer-input";
import { setCustomersActive } from "./customer-service";
import type { BatchActionResult } from "@/modules/shared/batch";

export type CustomerActionResult = { error?: string; fieldErrors?: Record<string, string[]> };

// Custom field values arrive as definitionId → raw string ("true"/"false" for
// checkboxes, typed strings otherwise). Shape is validated loosely here; the
// custom field service validates each value against its definition.
const customFieldValuesSchema = z.record(z.string(), z.string()).optional();

export type QuickCreateCustomerResult = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
  customer?: {
    id: string;
    name: string;
    defaultCurrencyCode: string;
    paymentTermsDays: number;
  };
};

export async function quickCreateCustomerAction(
  businessId: string,
  input: { name: string; email?: string; phone?: string; trn?: string; defaultCurrencyCode?: string },
): Promise<QuickCreateCustomerResult> {
  const { user, access } = await requirePermission(businessId, "sales", "create");
  const parsed = customerInputSchema.safeParse({
    name: input.name,
    email: input.email ?? "",
    phone: input.phone ?? "",
    trn: input.trn ?? "",
    taxReference: input.trn ?? "",
    defaultCurrencyCode: input.defaultCurrencyCode || access.business.currency,
    isActive: true,
  });
  if (!parsed.success) {
    return {
      error: "Check the highlighted fields.",
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
    };
  }
  let customerId: string;
  try {
    customerId = createCustomer(businessId, user.id, parsed.data);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The customer could not be created." };
  }
  revalidatePath(`/b/${businessId}/customers`);
  return {
    customer: {
      id: customerId,
      name: parsed.data.name,
      defaultCurrencyCode: parsed.data.defaultCurrencyCode,
      paymentTermsDays: parsed.data.paymentTermsDays,
    },
  };
}

export async function createCustomerAction(
  businessId: string,
  input: unknown,
  customFieldValues?: unknown,
): Promise<CustomerActionResult> {
  const { user } = await requirePermission(businessId, "sales", "create");
  const parsed = customerInputSchema.safeParse(input);
  if (!parsed.success) return { error: "Check the highlighted fields.", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const parsedCustomFields = customFieldValuesSchema.safeParse(customFieldValues);
  if (!parsedCustomFields.success) return { error: "Check the highlighted fields." };
  let customerId: string;
  try {
    customerId = createCustomer(businessId, user.id, parsed.data, parsedCustomFields.data);
  } catch {
    return { error: "The customer could not be saved. Your entries are still here." };
  }
  revalidatePath(`/b/${businessId}/customers`);
  revalidatePath(`/b/${businessId}/customers/${customerId}`);
  redirect(`/b/${businessId}/customers/${customerId}?notice=Customer saved`);
}

export async function updateCustomerAction(
  businessId: string,
  customerId: string,
  input: unknown,
  customFieldValues?: unknown,
): Promise<CustomerActionResult> {
  const { user } = await requirePermission(businessId, "sales", "edit");
  const parsed = customerInputSchema.safeParse(input);
  if (!parsed.success) return { error: "Check the highlighted fields.", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const parsedCustomFields = customFieldValuesSchema.safeParse(customFieldValues);
  if (!parsedCustomFields.success) return { error: "Check the highlighted fields." };
  try {
    updateCustomer(businessId, user.id, customerId, parsed.data, parsedCustomFields.data);
  } catch {
    return { error: "The customer could not be updated. Your entries are still here." };
  }
  revalidatePath(`/b/${businessId}/customers`);
  revalidatePath(`/b/${businessId}/customers/${customerId}`);
  redirect(`/b/${businessId}/customers/${customerId}?notice=Customer updated`);
}

export async function batchSetCustomersActiveAction(businessId: string, ids: string[], active: boolean): Promise<BatchActionResult> {
  const { user } = await requirePermission(businessId, "sales", "edit");
  const result = setCustomersActive(businessId, user.id, ids, active);
  revalidatePath(`/b/${businessId}/customers`);
  return result;
}
