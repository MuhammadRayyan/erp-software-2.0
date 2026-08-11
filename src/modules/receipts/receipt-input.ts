import { z } from "zod";
import { exchangeRateInputShape } from "@/modules/currency/currency-input";

export const receiptInputSchema = z.object({
  ...exchangeRateInputShape,
  customerId: z.string().uuid("Choose a customer"),
  invoiceId: z.string().uuid("Choose an invoice"),
  date: z.iso.date("Enter a valid receipt date"),
  bankAccountId: z.string().min(1, "Choose a Bank or Cash account"),
  amount: z
    .string()
    .trim()
    .regex(/^\d{1,10}(?:\.\d{1,6})?$/, "Enter an amount with up to 6 decimals")
    .refine((value) => Number(value) > 0, "Amount must be greater than zero"),
  reference: z.string().trim().max(100).optional().default(""),
  description: z.string().trim().max(300).optional().default(""),
});

export type ReceiptInput = z.input<typeof receiptInputSchema>;
