import { z } from "zod";

export const invoiceNumberingInputSchema = z.object({
  prefix: z.string().trim().min(1, "Enter a prefix").max(12),
  nextNumber: z.coerce.number().int().positive("Next number must be positive").max(999_999_999),
  padding: z.coerce.number().int().min(1).max(10),
  creditNotePrefix: z.string().trim().min(1, "Enter a credit note prefix").max(12),
  creditNoteNextNumber: z.coerce.number().int().positive().max(999_999_999),
  purchaseOrderPrefix: z.string().trim().min(1, "Enter a purchase order prefix").max(12),
  purchaseOrderNextNumber: z.coerce.number().int().positive().max(999_999_999),
  purchaseInvoicePrefix: z.string().trim().min(1, "Enter a purchase invoice prefix").max(12),
  purchaseInvoiceNextNumber: z.coerce.number().int().positive().max(999_999_999),
  supplierPaymentPrefix: z.string().trim().min(1, "Enter a supplier payment prefix").max(12),
  supplierPaymentNextNumber: z.coerce.number().int().positive().max(999_999_999),
  projectPrefix: z.string().trim().min(1, "Enter a project prefix").max(12),
  projectNextNumber: z.coerce.number().int().positive().max(999_999_999),
  goodsReceiptPrefix: z.string().trim().min(1, "Enter a goods receipt prefix").max(12),
  goodsReceiptNextNumber: z.coerce.number().int().positive().max(999_999_999),
  deliveryNotePrefix: z.string().trim().min(1, "Enter a delivery note prefix").max(12),
  deliveryNoteNextNumber: z.coerce.number().int().positive().max(999_999_999),
  stockAdjustmentPrefix: z.string().trim().min(1, "Enter a stock adjustment prefix").max(12),
  stockAdjustmentNextNumber: z.coerce.number().int().positive().max(999_999_999),
  bankTransactionPrefix: z.string().trim().min(1, "Enter a bank transaction prefix").max(12),
  bankTransactionNextNumber: z.coerce.number().int().positive().max(999_999_999),
  bankTransferPrefix: z.string().trim().min(1, "Enter a bank transfer prefix").max(12),
  bankTransferNextNumber: z.coerce.number().int().positive().max(999_999_999),
});

export type InvoiceNumberingInput = z.output<typeof invoiceNumberingInputSchema>;
