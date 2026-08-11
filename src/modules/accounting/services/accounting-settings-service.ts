import { eq } from "drizzle-orm";
import { getBusinessDb } from "@/core/db/business";
import { accountingSettings } from "@/core/db/business-schema";
import {
  invoiceNumberingInputSchema,
  type InvoiceNumberingInput,
} from "../numbering-input";

export function getAccountingSettings(businessId: string, userId: string) {
  const settings = getBusinessDb(businessId, userId).db
    .select()
    .from(accountingSettings)
    .where(eq(accountingSettings.id, "default"))
    .get();
  if (!settings) throw new Error("Accounting settings are not configured for this business.");
  return settings;
}

export function updateInvoiceNumbering(
  businessId: string,
  userId: string,
  input: InvoiceNumberingInput,
) {
  const data = invoiceNumberingInputSchema.parse(input);
  getBusinessDb(businessId, userId).db
    .update(accountingSettings)
    .set({
      invoicePrefix: data.prefix,
      invoiceNextNumber: data.nextNumber,
      invoicePadding: data.padding,
      creditNotePrefix: data.creditNotePrefix,
      creditNoteNextNumber: data.creditNoteNextNumber,
      purchaseOrderPrefix: data.purchaseOrderPrefix,
      purchaseOrderNextNumber: data.purchaseOrderNextNumber,
      purchaseInvoicePrefix: data.purchaseInvoicePrefix,
      purchaseInvoiceNextNumber: data.purchaseInvoiceNextNumber,
      supplierPaymentPrefix: data.supplierPaymentPrefix,
      supplierPaymentNextNumber: data.supplierPaymentNextNumber,
      projectPrefix: data.projectPrefix,
      projectNextNumber: data.projectNextNumber,
      goodsReceiptPrefix: data.goodsReceiptPrefix,
      goodsReceiptNextNumber: data.goodsReceiptNextNumber,
      deliveryNotePrefix: data.deliveryNotePrefix,
      deliveryNoteNextNumber: data.deliveryNoteNextNumber,
      stockAdjustmentPrefix: data.stockAdjustmentPrefix,
      stockAdjustmentNextNumber: data.stockAdjustmentNextNumber,
      bankTransactionPrefix: data.bankTransactionPrefix,
      bankTransactionNextNumber: data.bankTransactionNextNumber,
      bankTransferPrefix: data.bankTransferPrefix,
      bankTransferNextNumber: data.bankTransferNextNumber,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(accountingSettings.id, "default"))
    .run();
}
