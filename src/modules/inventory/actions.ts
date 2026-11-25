"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission, requireSavePermission } from "@/core/permissions/require-module";
import { getBusinessDb } from "@/core/db/business";
import { getBaseCurrency } from "@/modules/currency/currency";
import { parseCurrencyAmountToMinor } from "@/modules/currency/conversion";
import { getAccountingSettings } from "@/modules/accounting/services/accounting-settings-service";
import { getAssetAccountOptions, getExpenseAccountOptions, getSalesAccountOptions } from "@/modules/accounting/services/account-service";
import { inventoryItemInputSchema } from "./inventory-item-input";
import { saveInventoryItem } from "./inventory-item-service";
import { inventoryLocationInputSchema } from "./inventory-location-input";
import { saveInventoryLocation } from "./inventory-location-service";
import { inventoryErrorMessage } from "./inventory-error";

export type InventoryActionResult = { error?: string; fieldErrors?: Record<string, string[]> };

export type QuickCreateItemResult = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
  item?: {
    id: string;
    sku: string | null;
    name: string;
    unitName: string;
    salesPriceMinor: number | null;
    purchasePriceMinor: number | null;
    salesAccountId: string;
    inventoryAssetAccountId: string;
    costOfSalesAccountId: string;
  };
};

export async function quickCreateInventoryItemAction(
  businessId: string,
  input: { name: string; sku?: string; unitName?: string; salesPrice?: string; purchasePrice?: string },
): Promise<QuickCreateItemResult> {
  const { user } = await requirePermission(businessId, "inventory", "create");
  const settings = getAccountingSettings(businessId, user.id);
  const salesAccountId = settings.defaultSalesAccountId || getSalesAccountOptions(businessId, user.id)[0]?.id || "";
  const inventoryAssetAccountId = settings.defaultInventoryAssetAccountId || getAssetAccountOptions(businessId, user.id)[0]?.id || "";
  const costOfSalesAccountId = settings.defaultCostOfSalesAccountId || getExpenseAccountOptions(businessId, user.id)[0]?.id || "";
  const parsed = inventoryItemInputSchema.safeParse({
    name: input.name,
    sku: input.sku ?? "",
    unitName: input.unitName?.trim() || "pcs",
    salesPrice: input.salesPrice ?? "",
    purchasePrice: input.purchasePrice ?? "",
    salesAccountId,
    inventoryAssetAccountId,
    costOfSalesAccountId,
    isActive: true,
  });
  if (!parsed.success) {
    return {
      error: "Check the item fields.",
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
    };
  }
  let id: string;
  try {
    id = saveInventoryItem(businessId, user.id, parsed.data);
  } catch (error) {
    return { error: inventoryErrorMessage(error, "The inventory item could not be created.") };
  }
  revalidatePath(`/b/${businessId}/inventory/items`);
  const baseMinorUnit = getBaseCurrency(getBusinessDb(businessId, user.id).sqlite).minor_unit;
  return {
    item: {
      id,
      sku: parsed.data.sku || null,
      name: parsed.data.name,
      unitName: parsed.data.unitName,
      salesPriceMinor: parsed.data.salesPrice ? parseCurrencyAmountToMinor(parsed.data.salesPrice, baseMinorUnit, "Sales price") : null,
      purchasePriceMinor: parsed.data.purchasePrice ? parseCurrencyAmountToMinor(parsed.data.purchasePrice, baseMinorUnit, "Purchase price") : null,
      salesAccountId: parsed.data.salesAccountId,
      inventoryAssetAccountId: parsed.data.inventoryAssetAccountId,
      costOfSalesAccountId: parsed.data.costOfSalesAccountId,
    },
  };
}

export async function saveInventoryItemAction(businessId: string, itemId: string | null, input: unknown): Promise<InventoryActionResult> {
  const { user } = await requireSavePermission(businessId, "inventory", itemId, "draft");
  const parsed = inventoryItemInputSchema.safeParse(input);
  if (!parsed.success) return { error: "Check the item fields.", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  let id: string;
  try { id = saveInventoryItem(businessId, user.id, parsed.data, itemId ?? undefined); }
  catch (error) { return { error: inventoryErrorMessage(error, "The inventory item could not be saved.") }; }
  revalidatePath(`/b/${businessId}/inventory/items`);
  if (itemId) revalidatePath(`/b/${businessId}/inventory/items/${itemId}`);
  revalidatePath(`/b/${businessId}/inventory/items/${id}`);
  redirect(`/b/${businessId}/inventory/items/${id}?notice=${itemId ? "Item updated" : "Item created"}`);
}

export async function saveInventoryLocationAction(businessId: string, locationId: string | null, input: unknown): Promise<InventoryActionResult> {
  const { user } = await requireSavePermission(businessId, "inventory", locationId, "draft");
  const parsed = inventoryLocationInputSchema.safeParse(input);
  if (!parsed.success) return { error: "Check the location fields.", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  let id: string;
  try { id = saveInventoryLocation(businessId, user.id, parsed.data, locationId ?? undefined); }
  catch (error) { return { error: inventoryErrorMessage(error, "The inventory location could not be saved.") }; }
  revalidatePath(`/b/${businessId}/inventory/locations`);
  if (locationId) revalidatePath(`/b/${businessId}/inventory/locations/${locationId}`);
  revalidatePath(`/b/${businessId}/inventory/locations/${id}`);
  redirect(`/b/${businessId}/inventory/locations/${id}?notice=${locationId ? "Location updated" : "Location created"}`);
}
