"use client";

import { ApplyAdvanceCreditDialog } from "@/components/documents/apply-advance-credit-dialog";
import { applySupplierPaymentCreditAction } from "@/modules/supplier-payments/actions";

export type AvailablePrepayment = {
  paymentId: string;
  paymentNumber: string;
  date: string;
  currencyCode: string;
  unallocatedAmountMinor: number;
};

export function ApplyPrepaymentModal({
  businessId,
  invoiceId,
  invoiceNumber,
  balanceMinor,
  currencyCode,
  minorUnit,
  availablePrepayments,
}: {
  businessId: string;
  invoiceId: string;
  invoiceNumber: string;
  balanceMinor: number;
  currencyCode: string;
  minorUnit: number;
  availablePrepayments: AvailablePrepayment[];
}) {
  return (
    <ApplyAdvanceCreditDialog
      balanceMinor={balanceMinor}
      currencyCode={currencyCode}
      minorUnit={minorUnit}
      items={availablePrepayments.map((p) => ({
        id: p.paymentId,
        number: p.paymentNumber,
        date: p.date,
        currencyCode: p.currencyCode,
        unallocatedAmountMinor: p.unallocatedAmountMinor,
      }))}
      labels={{
        bannerTitle: "Vendor Prepayment Credit Available",
        bannerDescription: (formattedPool) => (
          <>
            You hold <strong className="font-semibold text-foreground">{formattedPool}</strong> in unallocated vendor prepayments with this supplier. Settle this purchase bill directly from available prepayment deposits without recording a new payment.
          </>
        ),
        triggerLabel: "Apply Available Prepayment",
        dialogTitle: `Apply Prepayment to ${invoiceNumber}`,
        dialogDescription:
          "Draw down existing vendor prepayments to settle or reduce this purchase invoice balance.",
        selectLabel: "Select Vendor Prepayment",
        missingSelectionError: "Please select a prepayment record.",
        openBalanceLabel: "Purchase Bill Open Balance:",
        exceedOpenBalanceLabel: "bill open balance",
        unallocatedCreditLabel: "Payment Unallocated Credit:",
        exceedAvailableCreditLabel: "available prepayment",
        submitLabel: "Apply Prepayment",
      }}
      onApply={(selectedId, amountStr) =>
        applySupplierPaymentCreditAction(businessId, {
          paymentId: selectedId,
          invoiceId,
          amount: amountStr,
        })
      }
    />
  );
}
