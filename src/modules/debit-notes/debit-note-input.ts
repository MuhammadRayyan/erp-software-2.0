import { z } from "zod";
import { exchangeRateInputShape } from "@/modules/currency/currency-input";
import {
  moneySchema,
  projectIdField,
  quantitySchema,
  amountsIncludeTaxSchema, 
  discountTypeSchema, 
  discountValueSchema 
} from "@/core/validation/document-schemas";

export const debitNoteLineSchema = z.object({
  description: z.string().trim().min(1, "Enter a description").max(300),
  quantity: quantitySchema,
  discountType: discountTypeSchema,
  discountValue: discountValueSchema,
  unitPrice: moneySchema,
  expenseAccountId: z.string().min(1, "Choose an expense account"),
  taxCodeId: z.string().min(1, "Choose a tax code"),
  projectId: projectIdField,
});

export const debitNoteInputSchema = z.object({
  ...exchangeRateInputShape,
  supplierId: z.string().uuid("Choose a supplier"),
  projectId: projectIdField,
  purchaseInvoiceId: z.string().uuid("Choose a posted invoice").optional().nullable(),
  amountsIncludeTax: amountsIncludeTaxSchema,
  date: z.iso.date("Enter a valid debit note date"),
  taxDate: z.union([z.literal(""), z.iso.date("Enter a valid VAT tax date")]).optional().default(""),
  reference: z.string().trim().max(100).optional().default(""),
  lines: z.array(debitNoteLineSchema).min(1, "Add at least one line").max(100),
});

export type DebitNoteInput = z.input<typeof debitNoteInputSchema>;
