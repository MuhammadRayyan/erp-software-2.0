import { SettingsShell } from "@/components/settings-shell";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireModule } from "@/core/permissions/require-module";
import { NumberingForm } from "@/modules/accounting/components/numbering-form";
import { getAccountingSettings } from "@/modules/accounting/services/accounting-settings-service";

export default async function NumberingPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const { user } = await requireModule(businessId, "settings");
  const settings = getAccountingSettings(businessId, user.id);
  return (
    <SettingsShell businessId={businessId} title="Numbering" description="Business-specific document numbering controlled on the server.">
      <NumberingForm businessId={businessId} initial={{
        prefix: settings.invoicePrefix,
        nextNumber: settings.invoiceNextNumber,
        padding: settings.invoicePadding,
        creditNotePrefix: settings.creditNotePrefix,
        creditNoteNextNumber: settings.creditNoteNextNumber,
        creditNotePadding: settings.creditNotePadding ?? 4,
        salesQuotePrefix: settings.salesQuotePrefix ?? "SQ-",
        salesQuoteNextNumber: settings.salesQuoteNextNumber ?? 1,
        salesQuotePadding: settings.salesQuotePadding ?? 4,
        salesOrderPrefix: settings.salesOrderPrefix ?? "SO-",
        salesOrderNextNumber: settings.salesOrderNextNumber ?? 1,
        salesOrderPadding: settings.salesOrderPadding ?? 4,
        receiptPrefix: settings.receiptPrefix ?? "REC-",
        receiptNextNumber: settings.receiptNextNumber ?? 1,
        receiptPadding: settings.receiptPadding ?? 4,
        purchaseQuotePrefix: settings.purchaseQuotePrefix ?? "PQ-",
        purchaseQuoteNextNumber: settings.purchaseQuoteNextNumber ?? 1,
        purchaseQuotePadding: settings.purchaseQuotePadding ?? 4,
        purchaseOrderPrefix: settings.purchaseOrderPrefix,
        purchaseOrderNextNumber: settings.purchaseOrderNextNumber,
        purchaseOrderPadding: settings.purchaseOrderPadding ?? 4,
        purchaseInvoicePrefix: settings.purchaseInvoicePrefix,
        purchaseInvoiceNextNumber: settings.purchaseInvoiceNextNumber,
        purchaseInvoicePadding: settings.purchaseInvoicePadding ?? 4,
        supplierPaymentPrefix: settings.supplierPaymentPrefix,
        supplierPaymentNextNumber: settings.supplierPaymentNextNumber,
        supplierPaymentPadding: settings.supplierPaymentPadding ?? 4,
        debitNotePrefix: settings.debitNotePrefix ?? "DN-",
        debitNoteNextNumber: settings.debitNoteNextNumber ?? 1,
        debitNotePadding: settings.debitNotePadding ?? 4,
        projectPrefix: settings.projectPrefix,
        projectNextNumber: settings.projectNextNumber,
        projectPadding: settings.projectPadding,
        goodsReceiptPrefix: settings.goodsReceiptPrefix,
        goodsReceiptNextNumber: settings.goodsReceiptNextNumber,
        goodsReceiptPadding: settings.goodsReceiptPadding,
        deliveryNotePrefix: settings.deliveryNotePrefix,
        deliveryNoteNextNumber: settings.deliveryNoteNextNumber,
        deliveryNotePadding: settings.deliveryNotePadding,
        stockAdjustmentPrefix: settings.stockAdjustmentPrefix,
        stockAdjustmentNextNumber: settings.stockAdjustmentNextNumber,
        stockAdjustmentPadding: settings.stockAdjustmentPadding,
        bankTransactionPrefix: settings.bankTransactionPrefix,
        bankTransactionNextNumber: settings.bankTransactionNextNumber,
        bankTransactionPadding: settings.bankTransactionPadding,
        bankTransferPrefix: settings.bankTransferPrefix,
        bankTransferNextNumber: settings.bankTransferNextNumber,
        bankTransferPadding: settings.bankTransferPadding,
        journalPrefix: settings.journalPrefix ?? "JRN-",
        journalNextNumber: settings.journalNextNumber ?? 1,
        journalPadding: settings.journalPadding ?? 4,
      }} />
    </SettingsShell>
  );
}
