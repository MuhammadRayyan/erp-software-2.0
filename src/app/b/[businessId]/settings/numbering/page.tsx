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
        purchaseOrderPrefix: settings.purchaseOrderPrefix,
        purchaseOrderNextNumber: settings.purchaseOrderNextNumber,
        purchaseInvoicePrefix: settings.purchaseInvoicePrefix,
        purchaseInvoiceNextNumber: settings.purchaseInvoiceNextNumber,
        supplierPaymentPrefix: settings.supplierPaymentPrefix,
        supplierPaymentNextNumber: settings.supplierPaymentNextNumber,
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
      }} />
    </SettingsShell>
  );
}
