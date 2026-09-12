import { z } from "zod";
import { exchangeRateInputShape } from "@/modules/currency/currency-input";
import {
  itemIdField,
  moneySchema,
  projectIdField,
  quantitySchema,
  amountsIncludeTaxSchema,
  discountTypeSchema,
  discountValueSchema,
} from "@/core/validation/document-schemas";

export const purchaseQuoteLineSchema = z.object({
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

export const purchaseQuoteInputSchema = z.object({
  ...exchangeRateInputShape,
  supplierId: z.string().uuid("Choose a supplier"),
  projectId: projectIdField,
  amountsIncludeTax: amountsIncludeTaxSchema,
  date: z.iso.date("Enter a valid quote date"),
  expiryDate: z.union([z.literal(""), z.iso.date("Enter a valid expiry date")]).optional().default(""),
  reference: z.string().trim().max(100).optional().default(""),
  notes: z.string().trim().max(1_000).optional().default(""),
  terms: z.string().trim().max(1_000).optional().default(""),
  lines: z.array(purchaseQuoteLineSchema).min(1, "Add at least one line").max(100),
});

export type PurchaseQuoteInput = z.input<typeof purchaseQuoteInputSchema>;
