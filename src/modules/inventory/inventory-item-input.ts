import { z } from "zod";

const optionalMoney = z.union([
  z.literal(""),
  z.string().trim().regex(/^\d{1,10}(?:\.\d{1,2})?$/, "Enter an amount with up to 2 decimals"),
]).optional().default("");

export const inventoryItemInputSchema = z.object({
  sku: z.string().trim().max(60).optional().default(""),
  name: z.string().trim().min(1, "Enter an item name").max(160),
  description: z.string().trim().max(1_000).optional().default(""),
  unitName: z.string().trim().min(1, "Enter a unit").max(30),
  salesPrice: optionalMoney,
  purchasePrice: optionalMoney,
  salesAccountId: z.string().min(1, "Choose a sales account"),
  inventoryAssetAccountId: z.string().min(1, "Choose an Inventory Asset account"),
  costOfSalesAccountId: z.string().min(1, "Choose a Cost of Sales account"),
  isActive: z.boolean().default(true),
});

export type InventoryItemInput = z.input<typeof inventoryItemInputSchema>;
