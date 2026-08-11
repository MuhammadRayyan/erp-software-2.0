import { z } from "zod";
import { exchangeRateInputShape } from "@/modules/currency/currency-input";

const quantitySchema = z.string().trim().regex(/^\d{1,8}(?:\.\d{1,4})?$/, "Enter a quantity with up to 4 decimals").refine((value) => Number(value) > 0, "Quantity must be greater than zero");
const moneySchema = z.string().trim().regex(/^\d{1,10}(?:\.\d{1,6})?$/, "Enter an amount with up to 6 decimals");

export const purchaseOrderLineSchema = z.object({
  itemId: z.union([z.literal(""), z.string().uuid("Choose a valid inventory item")]).optional().default(""),
  description: z.string().trim().min(1, "Enter a description").max(300),
  quantity: quantitySchema,
  unitPrice: moneySchema,
  expenseAccountId: z.string().optional().default(""),
  taxCodeId: z.string().min(1, "Choose a tax code"),
  projectId: z.union([z.literal(""), z.string().uuid("Choose a valid project")]).optional().default(""),
});

export const purchaseOrderInputSchema = z.object({
  ...exchangeRateInputShape,
  supplierId: z.string().uuid("Choose a supplier"),
  projectId: z.union([z.literal(""), z.string().uuid("Choose a valid project")]).optional().default(""),
  date: z.iso.date("Enter a valid order date"),
  expectedDate: z.union([z.literal(""), z.iso.date("Enter a valid expected date")]).optional().default(""),
  reference: z.string().trim().max(100).optional().default(""),
  notes: z.string().trim().max(1_000).optional().default(""),
  lines: z.array(purchaseOrderLineSchema).min(1, "Add at least one line").max(100),
});

export type PurchaseOrderInput = z.input<typeof purchaseOrderInputSchema>;
