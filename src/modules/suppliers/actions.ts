"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireModule } from "@/core/permissions/require-module";
import { supplierInputSchema } from "./supplier-input";
import { createSupplier, updateSupplier } from "./supplier-service";

export type SupplierActionResult = { error?: string; fieldErrors?: Record<string, string[]> };

// Custom field values arrive as definitionId → raw string ("true"/"false" for
// checkboxes, typed strings otherwise). Shape is validated loosely here; the
// custom field service validates each value against its definition.
const customFieldValuesSchema = z.record(z.string(), z.string()).optional();

export async function createSupplierAction(
  businessId: string,
  input: unknown,
  customFieldValues?: unknown,
): Promise<SupplierActionResult> {
  const { user } = await requireModule(businessId, "purchases");
  const parsed = supplierInputSchema.safeParse(input);
  if (!parsed.success) return { error: "Check the supplier fields.", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const parsedCustomFields = customFieldValuesSchema.safeParse(customFieldValues);
  if (!parsedCustomFields.success) return { error: "Check the supplier fields." };
  let supplierId: string;
  try { supplierId = createSupplier(businessId, user.id, parsed.data, parsedCustomFields.data); }
  catch (error) { return { error: error instanceof Error ? error.message : "The supplier could not be created." }; }
  redirect(`/b/${businessId}/suppliers/${supplierId}?notice=Supplier created`);
}

export async function updateSupplierAction(
  businessId: string,
  supplierId: string,
  input: unknown,
  customFieldValues?: unknown,
): Promise<SupplierActionResult> {
  const { user } = await requireModule(businessId, "purchases");
  const parsed = supplierInputSchema.safeParse(input);
  if (!parsed.success) return { error: "Check the supplier fields.", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const parsedCustomFields = customFieldValuesSchema.safeParse(customFieldValues);
  if (!parsedCustomFields.success) return { error: "Check the supplier fields." };
  try { updateSupplier(businessId, user.id, supplierId, parsed.data, parsedCustomFields.data); }
  catch (error) { return { error: error instanceof Error ? error.message : "The supplier could not be updated." }; }
  redirect(`/b/${businessId}/suppliers/${supplierId}?notice=Supplier updated`);
}
