"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireModule } from "@/core/permissions/require-module";
import { supplierInputSchema } from "./supplier-input";
import { createSupplier, updateSupplier } from "./supplier-service";

export type SupplierActionResult = { error?: string; fieldErrors?: Record<string, string[]> };

export async function createSupplierAction(businessId: string, input: unknown): Promise<SupplierActionResult> {
  const { user } = await requireModule(businessId, "purchases");
  const parsed = supplierInputSchema.safeParse(input);
  if (!parsed.success) return { error: "Check the supplier fields.", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  let supplierId: string;
  try { supplierId = createSupplier(businessId, user.id, parsed.data); }
  catch (error) { return { error: error instanceof Error ? error.message : "The supplier could not be created." }; }
  redirect(`/b/${businessId}/suppliers/${supplierId}?notice=Supplier created`);
}

export async function updateSupplierAction(businessId: string, supplierId: string, input: unknown): Promise<SupplierActionResult> {
  const { user } = await requireModule(businessId, "purchases");
  const parsed = supplierInputSchema.safeParse(input);
  if (!parsed.success) return { error: "Check the supplier fields.", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  try { updateSupplier(businessId, user.id, supplierId, parsed.data); }
  catch (error) { return { error: error instanceof Error ? error.message : "The supplier could not be updated." }; }
  redirect(`/b/${businessId}/suppliers/${supplierId}?notice=Supplier updated`);
}
