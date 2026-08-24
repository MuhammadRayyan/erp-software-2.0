"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireModule } from "@/core/permissions/require-module";
import { createCustomer, updateCustomer } from "./customer-service";
import { customerInputSchema } from "./customer-input";

export type CustomerActionResult = { error?: string; fieldErrors?: Record<string, string[]> };

// Custom field values arrive as definitionId → raw string ("true"/"false" for
// checkboxes, typed strings otherwise). Shape is validated loosely here; the
// custom field service validates each value against its definition.
const customFieldValuesSchema = z.record(z.string(), z.string()).optional();

export async function createCustomerAction(
  businessId: string,
  input: unknown,
  customFieldValues?: unknown,
): Promise<CustomerActionResult> {
  const { user } = await requireModule(businessId, "sales");
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
  redirect(`/b/${businessId}/customers/${customerId}?notice=Customer saved`);
}

export async function updateCustomerAction(
  businessId: string,
  customerId: string,
  input: unknown,
  customFieldValues?: unknown,
): Promise<CustomerActionResult> {
  const { user } = await requireModule(businessId, "sales");
  const parsed = customerInputSchema.safeParse(input);
  if (!parsed.success) return { error: "Check the highlighted fields.", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const parsedCustomFields = customFieldValuesSchema.safeParse(customFieldValues);
  if (!parsedCustomFields.success) return { error: "Check the highlighted fields." };
  try {
    updateCustomer(businessId, user.id, customerId, parsed.data, parsedCustomFields.data);
  } catch {
    return { error: "The customer could not be updated. Your entries are still here." };
  }
  redirect(`/b/${businessId}/customers/${customerId}?notice=Customer updated`);
}
