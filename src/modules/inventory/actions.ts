"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireModule } from "@/core/permissions/require-module";
import { inventoryItemInputSchema } from "./inventory-item-input";
import { saveInventoryItem } from "./inventory-item-service";
import { inventoryLocationInputSchema } from "./inventory-location-input";
import { saveInventoryLocation } from "./inventory-location-service";
import { inventoryErrorMessage } from "./inventory-error";

export type InventoryActionResult = { error?: string; fieldErrors?: Record<string, string[]> };

export async function saveInventoryItemAction(businessId: string, itemId: string | null, input: unknown): Promise<InventoryActionResult> {
  const { user } = await requireModule(businessId, "inventory");
  const parsed = inventoryItemInputSchema.safeParse(input);
  if (!parsed.success) return { error: "Check the item fields.", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  let id: string;
  try { id = saveInventoryItem(businessId, user.id, parsed.data, itemId ?? undefined); }
  catch (error) { return { error: inventoryErrorMessage(error, "The inventory item could not be saved.") }; }
  redirect(`/b/${businessId}/inventory/items/${id}?notice=${itemId ? "Item updated" : "Item created"}`);
}

export async function saveInventoryLocationAction(businessId: string, locationId: string | null, input: unknown): Promise<InventoryActionResult> {
  const { user } = await requireModule(businessId, "inventory");
  const parsed = inventoryLocationInputSchema.safeParse(input);
  if (!parsed.success) return { error: "Check the location fields.", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  let id: string;
  try { id = saveInventoryLocation(businessId, user.id, parsed.data, locationId ?? undefined); }
  catch (error) { return { error: inventoryErrorMessage(error, "The inventory location could not be saved.") }; }
  revalidatePath(`/b/${businessId}/inventory/locations`);
  redirect(`/b/${businessId}/inventory/locations/${id}?notice=${locationId ? "Location updated" : "Location created"}`);
}
