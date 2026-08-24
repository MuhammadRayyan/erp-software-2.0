import { z } from "zod";
import { exchangeRateInputShape } from "@/modules/currency/currency-input";
import { positiveMoneySchema } from "@/core/validation/document-schemas";

export const supplierPaymentInputSchema = z.object({
  ...exchangeRateInputShape,
  supplierId: z.string().uuid("Choose a supplier"),
  purchaseInvoiceId: z.string().uuid("Choose a purchase invoice"),
  date: z.iso.date("Enter a valid payment date"),
  bankAccountId: z.string().min(1, "Choose a Bank or Cash account"),
  amount: positiveMoneySchema,
  reference: z.string().trim().max(100).optional().default(""),
  description: z.string().trim().max(300).optional().default(""),
});

export type SupplierPaymentInput = z.input<typeof supplierPaymentInputSchema>;
