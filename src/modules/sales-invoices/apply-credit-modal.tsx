"use client";

import { ApplyAdvanceCreditDialog } from "@/components/documents/apply-advance-credit-dialog";
import { applyReceiptCreditAction } from "@/modules/receipts/actions";

export type AvailableCredit = {
  receiptId: string;
  receiptNumber: string;
  date: string;
  currencyCode: string;
  unallocatedAmountMinor: number;
};

export function ApplyCreditModal({
  businessId,
  invoiceId,
  invoiceNumber,
  balanceMinor,
  currencyCode,
  minorUnit,
  availableCredits,
}: {
  businessId: string;
  invoiceId: string;
  invoiceNumber: string;
  balanceMinor: number;
  currencyCode: string;
  minorUnit: number;
  availableCredits: AvailableCredit[];
}) {
  return (
    <ApplyAdvanceCreditDialog
      balanceMinor={balanceMinor}
      currencyCode={currencyCode}
      minorUnit={minorUnit}
      items={availableCredits.map((credit) => ({
        id: credit.receiptId,
        number: credit.receiptNumber,
        date: credit.date,
        currencyCode: credit.currencyCode,
        unallocatedAmountMinor: credit.unallocatedAmountMinor,
      }))}
      labels={{
        bannerTitle: "Customer Advance Credit Available",
        bannerDescription: (formattedPool) => (
          <>
            This customer holds <strong className="font-semibold text-foreground">{formattedPool}</strong> in unallocated advance deposits. Settle this invoice directly from available credit without recording a new payment.
          </>
        ),
        triggerLabel: "Apply Available Credit",
        dialogTitle: `Apply Advance Credit to ${invoiceNumber}`,
        dialogDescription:
          "Draw down customer advance deposits to reduce or settle this invoice balance.",
        selectLabel: "Select Advance Deposit Receipt",
        missingSelectionError: "Please select a credit receipt.",
        openBalanceLabel: "Invoice Open Balance:",
        exceedOpenBalanceLabel: "invoice open balance",
        unallocatedCreditLabel: "Receipt Unallocated Credit:",
        exceedAvailableCreditLabel: "available credit",
        submitLabel: "Apply Credit",
      }}
      onApply={(selectedId, amountStr) =>
        applyReceiptCreditAction(businessId, {
          receiptId: selectedId,
          invoiceId,
          amount: amountStr,
        })
      }
    />
  );
}
