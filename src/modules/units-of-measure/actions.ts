"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/core/permissions/require-module";
import { createUnitOfMeasure, deleteUnitOfMeasure, toggleUnitOfMeasure } from "./uom-service";

export async function createUnitOfMeasureAction(businessId: string, code: string, name: string) {
  const { user } = await requirePermission(businessId, "settings", "edit");
  try {
    createUnitOfMeasure(businessId, user.id, code, name);
    revalidatePath(`/b/${businessId}/settings/units-of-measure`);
    return {};
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unit of measure could not be created." };
  }
}

export async function deleteUnitOfMeasureAction(businessId: string, id: string) {
  const { user } = await requirePermission(businessId, "settings", "edit");
  try {
    deleteUnitOfMeasure(businessId, user.id, id);
    revalidatePath(`/b/${businessId}/settings/units-of-measure`);
    return {};
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unit of measure could not be deleted." };
  }
}

export async function toggleUnitOfMeasureAction(businessId: string, id: string, isActive: boolean) {
  const { user } = await requirePermission(businessId, "settings", "edit");
  try {
    toggleUnitOfMeasure(businessId, user.id, id, isActive);
    revalidatePath(`/b/${businessId}/settings/units-of-measure`);
    return {};
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unit status could not be changed." };
  }
}
