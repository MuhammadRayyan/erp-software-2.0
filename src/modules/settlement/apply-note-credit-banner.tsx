"use client";

import { ApplyAdvanceCreditDialog } from "@/components/documents/apply-advance-credit-dialog";
import { applyCreditNoteCreditAction, applyDebitNoteCreditAction } from "./party-credit-actions";

export type NoteCreditItem = {
  noteId: string;
  number: string;
  date: string;
  currencyCode: string;
  unallocatedMinor: number;
};

/** Offers unallocated credit/debit-note credit on an open invoice or bill. */
export function ApplyNoteCreditBanner({
  businessId,
  side,
  documentId,
  documentNumber,
  balanceMinor,
  currencyCode,
  minorUnit,
  credits,
}: {
  businessId: string;
  side: "customer" | "supplier";
  documentId: string;
  documentNumber: string;
  balanceMinor: number;
  currencyCode: string;
  minorUnit: number;
  credits: NoteCreditItem[];
}) {
  const customer = side === "customer";
  return (
    <ApplyAdvanceCreditDialog
      balanceMinor={balanceMinor}
      currencyCode={currencyCode}
      minorUnit={minorUnit}
      items={credits.map((credit) => ({
        id: credit.noteId,
        number: credit.number,
        date: credit.date,
        currencyCode: credit.currencyCode,
        unallocatedAmountMinor: credit.unallocatedMinor,
      }))}
      labels={{
        bannerTitle: customer ? "Credit Note Credit Available" : "Debit Note Credit Available",
        bannerDescription: (formattedPool) => (
          <>
            This {side} holds <strong className="font-semibold text-foreground">{formattedPool}</strong> of unallocated {customer ? "credit-note" : "debit-note"} credit. Use it to settle this {customer ? "invoice" : "bill"}.
          </>
        ),
        triggerLabel: customer ? "Apply Credit Note" : "Apply Debit Note",
        dialogTitle: `Apply ${customer ? "Credit Note" : "Debit Note"} to ${documentNumber}`,
        dialogDescription: customer
          ? "Settle this invoice from credit left on an earlier credit note."
          : "Settle this bill from credit left on an earlier debit note.",
        selectLabel: customer ? "Select Credit Note" : "Select Debit Note",
        missingSelectionError: customer ? "Please select a credit note." : "Please select a debit note.",
        openBalanceLabel: customer ? "Invoice Open Balance:" : "Bill Open Balance:",
        exceedOpenBalanceLabel: customer ? "invoice open balance" : "bill open balance",
        unallocatedCreditLabel: "Unallocated Credit:",
        exceedAvailableCreditLabel: "available credit",
        submitLabel: "Apply Credit",
      }}
      onApply={(noteId, amount) =>
        (customer ? applyCreditNoteCreditAction : applyDebitNoteCreditAction)(businessId, { noteId, documentId, amount })
      }
    />
  );
}
