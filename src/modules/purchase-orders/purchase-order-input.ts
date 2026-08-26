import { z } from "zod";
import { exchangeRateInputShape } from "@/modules/currency/currency-input";
import {
  itemIdField,
  moneySchema,
  projectIdField,
  quantitySchema,
amountsIncludeTaxSchema, discountTypeSchema, discountValueSchema } from "@/core/validation/document-schemas";

export const purchaseOrderLineSchema = z.object({
  itemId: itemIdField,
  description: z.string().trim().min(1, "Enter a description").max(300),
  quantity: quantitySchema,
  discountType: discountTypeSchema,
  discountValue: discountValueSchema,
  unitPrice: moneySchema,
  expenseAccountId: z.string().optional().default(""),
  taxCodeId: z.string().min(1, "Choose a tax code"),
  projectId: projectIdField,
});

export const purchaseOrderInputSchema = z.object({
  ...exchangeRateInputShape,
  supplierId: z.string().uuid("Choose a supplier"),
  projectId: projectIdField,
  amountsIncludeTax: amountsIncludeTaxSchema,
  date: z.iso.date("Enter a valid order date"),
  expectedDate: z.union([z.literal(""), z.iso.date("Enter a valid expected date")]).optional().default(""),
  reference: z.string().trim().max(100).optional().default(""),
  notes: z.string().trim().max(1_000).optional().default(""),
  lines: z.array(purchaseOrderLineSchema).min(1, "Add at least one line").max(100),
});

export type PurchaseOrderInput = z.input<typeof purchaseOrderInputSchema>;
