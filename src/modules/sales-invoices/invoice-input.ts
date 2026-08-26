import { z } from "zod";
import { emirates } from "@/modules/tax/uae-vat-config";
import { exchangeRateInputShape } from "@/modules/currency/currency-input";
import {
  eInvoiceTransactionFlagsSchema,
  itemIdField,
  moneySchema,
  projectIdField,
  quantitySchema,
amountsIncludeTaxSchema, discountTypeSchema, discountValueSchema } from "@/core/validation/document-schemas";

export const invoiceLineSchema = z.object({
  itemId: itemIdField,
  description: z.string().trim().min(1, "Enter a description").max(300),
  quantity: quantitySchema,
  discountType: discountTypeSchema,
  discountValue: discountValueSchema,
  unitPrice: moneySchema,
  salesAccountId: z.string().min(1, "Choose a sales account"),
  taxCodeId: z.string().min(1, "Choose a tax code"),
  projectId: projectIdField,
});

export const invoiceInputSchema = z.object({
  ...exchangeRateInputShape,
  customerId: z.string().uuid("Choose a customer"),
  projectId: projectIdField,
  invoiceDate: z.iso.date("Enter a valid invoice date"),
  taxDate: z.union([z.literal(""), z.iso.date("Enter a valid VAT tax date")]).optional().default(""),
  supplyEmirate: z.union([z.literal(""), z.enum(emirates)]).optional().default(""),
  amountsIncludeTax: amountsIncludeTaxSchema,
  dueDate: z.iso.date("Enter a valid due date"),
  reference: z.string().trim().max(100).optional().default(""),
  eInvoiceTransactionFlags: eInvoiceTransactionFlagsSchema,
  lines: z.array(invoiceLineSchema).min(1, "Add at least one line").max(100),
});

export type InvoiceInput = z.input<typeof invoiceInputSchema>;
export type InvoiceData = z.output<typeof invoiceInputSchema>;
