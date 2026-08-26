import { z } from "zod";
import { exchangeRateInputShape } from "@/modules/currency/currency-input";
import { creditNoteReasonCodeValues } from "@/modules/einvoicing/einvoice-types";
import { emirates } from "@/modules/tax/uae-vat-config";
import {
  eInvoiceTransactionFlagsSchema,
  moneySchema,
  projectIdField,
  quantitySchema,
amountsIncludeTaxSchema, discountTypeSchema, discountValueSchema } from "@/core/validation/document-schemas";

export const creditNoteLineSchema = z.object({
  description: z.string().trim().min(1, "Enter a description").max(300),
  quantity: quantitySchema,
  discountType: discountTypeSchema,
  discountValue: discountValueSchema,
  unitPrice: moneySchema,
  salesAccountId: z.string().min(1, "Choose a sales account"),
  taxCodeId: z.string().min(1, "Choose a tax code"),
  projectId: projectIdField,
});

export const creditNoteInputSchema = z.object({
  ...exchangeRateInputShape,
  customerId: z.string().uuid("Choose a customer"),
  projectId: projectIdField,
  sourceInvoiceId: z.string().uuid("Choose a posted invoice"),
  amountsIncludeTax: amountsIncludeTaxSchema,
  date: z.iso.date("Enter a valid credit note date"),
  taxDate: z.union([z.literal(""), z.iso.date("Enter a valid VAT tax date")]).optional().default(""),
  supplyEmirate: z.union([z.literal(""), z.enum(emirates)]).optional().default(""),
  reference: z.string().trim().max(100).optional().default(""),
  reason: z.string().trim().max(500).optional().default(""),
  eInvoiceReasonCode: z.union([z.literal(""), z.enum(creditNoteReasonCodeValues)]).optional().default(""),
  eInvoiceTransactionFlags: eInvoiceTransactionFlagsSchema,
  lines: z.array(creditNoteLineSchema).min(1, "Add at least one line").max(100),
});

export type CreditNoteInput = z.input<typeof creditNoteInputSchema>;
