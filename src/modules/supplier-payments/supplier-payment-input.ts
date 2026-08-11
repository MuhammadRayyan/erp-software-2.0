import { z } from "zod";
import { exchangeRateInputShape } from "@/modules/currency/currency-input";

export const supplierPaymentInputSchema = z.object({
  ...exchangeRateInputShape,
  supplierId: z.string().uuid("Choose a supplier"),
  purchaseInvoiceId: z.string().uuid("Choose a purchase invoice"),
  date: z.iso.date("Enter a valid payment date"),
  bankAccountId: z.string().min(1, "Choose a Bank or Cash account"),
  amount: z.string().trim().regex(/^\d{1,10}(?:\.\d{1,6})?$/, "Enter an amount with up to 6 decimals").refine((value) => Number(value) > 0, "Amount must be greater than zero"),
  reference: z.string().trim().max(100).optional().default(""),
  description: z.string().trim().max(300).optional().default(""),
});

export type SupplierPaymentInput = z.input<typeof supplierPaymentInputSchema>;
