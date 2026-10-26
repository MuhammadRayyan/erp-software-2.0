import { assertMutationPermission } from "@/core/permissions/mutation-permissions";
import { eq } from "drizzle-orm";
import { cache } from "react";
import { getBusinessDb } from "@/core/db/business";
import { accountingSettings } from "@/core/db/business-schema";
import {
  invoiceNumberingInputSchema,
  type InvoiceNumberingInput,
} from "../numbering-input";

export const getAccountingSettings = cache((businessId: string, userId: string) => {
  const settings = getBusinessDb(businessId, userId).db
    .select()
    .from(accountingSettings)
    .where(eq(accountingSettings.id, "default"))
    .get();
  if (!settings) throw new Error("Accounting settings are not configured for this business.");
  return settings;
});

export function updateInvoiceNumbering(
  businessId: string,
  userId: string,
  input: InvoiceNumberingInput,
) {
  assertMutationPermission(businessId, userId, "settings", "edit");
  const data = invoiceNumberingInputSchema.parse(input);
  getBusinessDb(businessId, userId).db
    .update(accountingSettings)
    .set({
      invoicePrefix: data.prefix,
      invoiceNextNumber: data.nextNumber,
      invoicePadding: data.padding,
      creditNotePrefix: data.creditNotePrefix,
      creditNoteNextNumber: data.creditNoteNextNumber,
      creditNotePadding: data.creditNotePadding,
      salesQuotePrefix: data.salesQuotePrefix,
      salesQuoteNextNumber: data.salesQuoteNextNumber,
      salesQuotePadding: data.salesQuotePadding,
      salesOrderPrefix: data.salesOrderPrefix,
      salesOrderNextNumber: data.salesOrderNextNumber,
      salesOrderPadding: data.salesOrderPadding,
      receiptPrefix: data.receiptPrefix,
      receiptNextNumber: data.receiptNextNumber,
      receiptPadding: data.receiptPadding,
      purchaseQuotePrefix: data.purchaseQuotePrefix,
      purchaseQuoteNextNumber: data.purchaseQuoteNextNumber,
      purchaseQuotePadding: data.purchaseQuotePadding,
      purchaseOrderPrefix: data.purchaseOrderPrefix,
      purchaseOrderNextNumber: data.purchaseOrderNextNumber,
      purchaseOrderPadding: data.purchaseOrderPadding,
      purchaseInvoicePrefix: data.purchaseInvoicePrefix,
      purchaseInvoiceNextNumber: data.purchaseInvoiceNextNumber,
      purchaseInvoicePadding: data.purchaseInvoicePadding,
      supplierPaymentPrefix: data.supplierPaymentPrefix,
      supplierPaymentNextNumber: data.supplierPaymentNextNumber,
      supplierPaymentPadding: data.supplierPaymentPadding,
      debitNotePrefix: data.debitNotePrefix,
      debitNoteNextNumber: data.debitNoteNextNumber,
      debitNotePadding: data.debitNotePadding,
      projectPrefix: data.projectPrefix,
      projectNextNumber: data.projectNextNumber,
      projectPadding: data.projectPadding,
      goodsReceiptPrefix: data.goodsReceiptPrefix,
      goodsReceiptNextNumber: data.goodsReceiptNextNumber,
      goodsReceiptPadding: data.goodsReceiptPadding,
      deliveryNotePrefix: data.deliveryNotePrefix,
      deliveryNoteNextNumber: data.deliveryNoteNextNumber,
      deliveryNotePadding: data.deliveryNotePadding,
      stockAdjustmentPrefix: data.stockAdjustmentPrefix,
      stockAdjustmentNextNumber: data.stockAdjustmentNextNumber,
      stockAdjustmentPadding: data.stockAdjustmentPadding,
      bankTransactionPrefix: data.bankTransactionPrefix,
      bankTransactionNextNumber: data.bankTransactionNextNumber,
      bankTransactionPadding: data.bankTransactionPadding,
      bankTransferPrefix: data.bankTransferPrefix,
      bankTransferNextNumber: data.bankTransferNextNumber,
      bankTransferPadding: data.bankTransferPadding,
      journalPrefix: data.journalPrefix,
      journalNextNumber: data.journalNextNumber,
      journalPadding: data.journalPadding,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(accountingSettings.id, "default"))
    .run();
}
