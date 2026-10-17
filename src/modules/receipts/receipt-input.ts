import { z } from "zod";
import { exchangeRateInputShape } from "@/modules/currency/currency-input";
import { positiveMoneySchema } from "@/core/validation/document-schemas";

export const receiptAllocationInputSchema = z.object({
  invoiceId: z.string().uuid("Choose an invoice"),
  amount: positiveMoneySchema,
});

export type ReceiptAllocationInput = z.input<typeof receiptAllocationInputSchema>;
export type ReceiptAllocationData = z.output<typeof receiptAllocationInputSchema>;

export const receiptInputSchema = z
  .object({
    ...exchangeRateInputShape,
    customerId: z.string().uuid("Choose a customer"),
    invoiceId: z.union([z.string().uuid(), z.literal(""), z.null()]).optional(),
    date: z.iso.date("Enter a valid receipt date"),
    bankAccountId: z.string().min(1, "Choose a Bank or Cash account"),
    amount: positiveMoneySchema,
    reference: z.string().trim().max(100).optional().default(""),
    description: z.string().trim().max(300).optional().default(""),
    allocations: z.array(receiptAllocationInputSchema).optional().default([]),
  })
  .transform((data) => {
    let allocations = data.allocations ? [...data.allocations] : [];
    if (data.invoiceId && data.invoiceId.trim() !== "" && allocations.length === 0) {
      allocations = [{ invoiceId: data.invoiceId, amount: data.amount }];
    }
    return {
      ...data,
      invoiceId: data.invoiceId && data.invoiceId.trim() !== "" ? data.invoiceId : (allocations.length === 1 ? allocations[0].invoiceId : undefined),
      allocations,
    };
  });

export type ReceiptInput = z.input<typeof receiptInputSchema>;
export type ReceiptData = z.output<typeof receiptInputSchema>;

export const applyReceiptCreditInputSchema = z.object({
  receiptId: z.string().uuid("Choose a receipt"),
  invoiceId: z.string().uuid("Choose an invoice"),
  amount: positiveMoneySchema,
});

export type ApplyReceiptCreditInput = z.input<typeof applyReceiptCreditInputSchema>;
export type ApplyReceiptCreditData = z.output<typeof applyReceiptCreditInputSchema>;
