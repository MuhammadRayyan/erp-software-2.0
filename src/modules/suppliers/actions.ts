"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/core/permissions/require-module";
import { supplierInputSchema } from "./supplier-input";
import { createSupplier, updateSupplier } from "./supplier-service";
import { setSuppliersActive } from "./supplier-service";
import type { BatchActionResult } from "@/modules/shared/batch";

export type SupplierActionResult = { error?: string; fieldErrors?: Record<string, string[]> };

// Custom field values arrive as definitionId → raw string ("true"/"false" for
// checkboxes, typed strings otherwise). Shape is validated loosely here; the
// custom field service validates each value against its definition.
const customFieldValuesSchema = z.record(z.string(), z.string()).optional();

export type QuickCreateSupplierResult = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
  supplier?: {
    id: string;
    name: string;
    defaultCurrencyCode: string;
    paymentTermsDays: number;
  };
};

export async function quickCreateSupplierAction(
  businessId: string,
  input: { name: string; email?: string; phone?: string; trn?: string; defaultCurrencyCode?: string },
): Promise<QuickCreateSupplierResult> {
  const { user, access } = await requirePermission(businessId, "purchases", "create");
  const parsed = supplierInputSchema.safeParse({
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
      error: "Check the supplier fields.",
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
    };
  }
  let supplierId: string;
  try {
    supplierId = createSupplier(businessId, user.id, parsed.data);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The supplier could not be created." };
  }
  revalidatePath(`/b/${businessId}/suppliers`);
  return {
    supplier: {
      id: supplierId,
      name: parsed.data.name,
      defaultCurrencyCode: parsed.data.defaultCurrencyCode,
      paymentTermsDays: parsed.data.paymentTermsDays,
    },
  };
}

export async function createSupplierAction(
  businessId: string,
  input: unknown,
  customFieldValues?: unknown,
): Promise<SupplierActionResult> {
  const { user } = await requirePermission(businessId, "purchases", "create");
  const parsed = supplierInputSchema.safeParse(input);
  if (!parsed.success) return { error: "Check the supplier fields.", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const parsedCustomFields = customFieldValuesSchema.safeParse(customFieldValues);
  if (!parsedCustomFields.success) return { error: "Check the supplier fields." };
  let supplierId: string;
  try { supplierId = createSupplier(businessId, user.id, parsed.data, parsedCustomFields.data); }
  catch (error) { return { error: error instanceof Error ? error.message : "The supplier could not be created." }; }
  revalidatePath(`/b/${businessId}/suppliers`);
  revalidatePath(`/b/${businessId}/suppliers/${supplierId}`);
  redirect(`/b/${businessId}/suppliers/${supplierId}?notice=Supplier created`);
}

export async function updateSupplierAction(
  businessId: string,
  supplierId: string,
  input: unknown,
  customFieldValues?: unknown,
): Promise<SupplierActionResult> {
  const { user } = await requirePermission(businessId, "purchases", "edit");
  const parsed = supplierInputSchema.safeParse(input);
  if (!parsed.success) return { error: "Check the supplier fields.", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const parsedCustomFields = customFieldValuesSchema.safeParse(customFieldValues);
  if (!parsedCustomFields.success) return { error: "Check the supplier fields." };
  try { updateSupplier(businessId, user.id, supplierId, parsed.data, parsedCustomFields.data); }
  catch (error) { return { error: error instanceof Error ? error.message : "The supplier could not be updated." }; }
  revalidatePath(`/b/${businessId}/suppliers`);
  revalidatePath(`/b/${businessId}/suppliers/${supplierId}`);
  redirect(`/b/${businessId}/suppliers/${supplierId}?notice=Supplier updated`);
}

export async function batchSetSuppliersActiveAction(businessId: string, ids: string[], active: boolean): Promise<BatchActionResult> {
  const { user } = await requirePermission(businessId, "purchases", "edit");
  const result = setSuppliersActive(businessId, user.id, ids, active);
  revalidatePath(`/b/${businessId}/suppliers`);
  return result;
}
