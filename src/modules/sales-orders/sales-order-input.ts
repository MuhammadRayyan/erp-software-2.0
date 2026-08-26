import { z } from "zod";
import { exchangeRateInputShape } from "@/modules/currency/currency-input";
import {
  itemIdField,
  moneySchema,
  projectIdField,
  quantitySchema,
amountsIncludeTaxSchema, discountTypeSchema, discountValueSchema } from "@/core/validation/document-schemas";

export const salesOrderLineSchema = z.object({
  itemId: itemIdField,
  description: z.string().trim().min(1, "Enter a description").max(300),
  quantity: quantitySchema,
  discountType: discountTypeSchema,
  discountValue: discountValueSchema,
  unitPrice: moneySchema,
  salesAccountId: z.string().optional().default(""),
  taxCodeId: z.string().min(1, "Choose a tax code"),
  projectId: projectIdField,
});

export const salesOrderInputSchema = z.object({
  ...exchangeRateInputShape,
  customerId: z.string().uuid("Choose a customer"),
  projectId: projectIdField,
  amountsIncludeTax: amountsIncludeTaxSchema,
  date: z.iso.date("Enter a valid order date"),
  expectedDate: z.union([z.literal(""), z.iso.date("Enter a valid expected date")]).optional().default(""),
  reference: z.string().trim().max(100).optional().default(""),
  salesQuoteId: z.string().uuid().optional().nullable(),
  notes: z.string().trim().max(1_000).optional().default(""),
  lines: z.array(salesOrderLineSchema).min(1, "Add at least one line").max(100),
});

export type SalesOrderInput = z.input<typeof salesOrderInputSchema>;
