import { z } from "zod";
import { exchangeRateInputShape } from "@/modules/currency/currency-input";
import { positiveMoneySchema } from "@/core/validation/document-schemas";

export const supplierPaymentAllocationInputSchema = z.object({
  invoiceId: z.string().trim().min(1, "Purchase invoice ID is required"),
  amount: positiveMoneySchema,
});

export type SupplierPaymentAllocationInput = z.infer<typeof supplierPaymentAllocationInputSchema>;

export const supplierPaymentInputSchema = z.object({
  ...exchangeRateInputShape,
  supplierId: z.string().uuid("Choose a supplier"),
  purchaseInvoiceId: z.string().trim().optional(),
  invoiceId: z.string().trim().optional(),
  date: z.iso.date("Enter a valid payment date"),
  bankAccountId: z.string().min(1, "Choose a Bank or Cash account"),
  amount: positiveMoneySchema,
  reference: z.string().trim().max(100).optional().default(""),
  description: z.string().trim().max(300).optional().default(""),
  allocations: z.array(supplierPaymentAllocationInputSchema).optional(),
});

export type SupplierPaymentInput = z.input<typeof supplierPaymentInputSchema>;

export const applySupplierPaymentCreditInputSchema = z.object({
  paymentId: z.string().trim().min(1, "Supplier payment ID is required"),
  invoiceId: z.string().trim().min(1, "Purchase invoice ID is required"),
  amount: positiveMoneySchema,
});

export type ApplySupplierPaymentCreditInput = z.infer<typeof applySupplierPaymentCreditInputSchema>;
