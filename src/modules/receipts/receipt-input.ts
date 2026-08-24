import { z } from "zod";
import { exchangeRateInputShape } from "@/modules/currency/currency-input";
import { positiveMoneySchema } from "@/core/validation/document-schemas";

export const receiptInputSchema = z.object({
  ...exchangeRateInputShape,
  customerId: z.string().uuid("Choose a customer"),
  invoiceId: z.string().uuid("Choose an invoice"),
  date: z.iso.date("Enter a valid receipt date"),
  bankAccountId: z.string().min(1, "Choose a Bank or Cash account"),
  amount: positiveMoneySchema,
  reference: z.string().trim().max(100).optional().default(""),
  description: z.string().trim().max(300).optional().default(""),
});

export type ReceiptInput = z.input<typeof receiptInputSchema>;
