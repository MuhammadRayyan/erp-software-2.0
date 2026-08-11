"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireModule } from "@/core/permissions/require-module";
import { createCustomer, updateCustomer } from "./customer-service";
import { customerInputSchema } from "./customer-input";

export type CustomerActionResult = { error?: string; fieldErrors?: Record<string, string[]> };

export async function createCustomerAction(businessId: string, input: unknown): Promise<CustomerActionResult> {
  const { user } = await requireModule(businessId, "sales");
  const parsed = customerInputSchema.safeParse(input);
  if (!parsed.success) return { error: "Check the highlighted fields.", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  let customerId: string;
  try {
    customerId = createCustomer(businessId, user.id, parsed.data);
  } catch {
    return { error: "The customer could not be saved. Your entries are still here." };
  }
  redirect(`/b/${businessId}/customers/${customerId}?notice=Customer saved`);
}

export async function updateCustomerAction(businessId: string, customerId: string, input: unknown): Promise<CustomerActionResult> {
  const { user } = await requireModule(businessId, "sales");
  const parsed = customerInputSchema.safeParse(input);
  if (!parsed.success) return { error: "Check the highlighted fields.", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  try {
    updateCustomer(businessId, user.id, customerId, parsed.data);
  } catch {
    return { error: "The customer could not be updated. Your entries are still here." };
  }
  redirect(`/b/${businessId}/customers/${customerId}?notice=Customer updated`);
}
