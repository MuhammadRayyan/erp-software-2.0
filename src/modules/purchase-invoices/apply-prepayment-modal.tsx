"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Coins, LoaderCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectNative } from "@/components/ui/select-native";
import { FormError } from "@/components/form-error";
import {
  DialogRoot,
  DialogTrigger,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog";
import { formatDate, formatMoney } from "@/core/format";
import { minorToCurrencyInput, parseCurrencyAmountToMinor } from "@/modules/currency/conversion";
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
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selectedPaymentId, setSelectedPaymentId] = useState(availablePrepayments[0]?.paymentId ?? "");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  const selectedPrepayment = availablePrepayments.find((p) => p.paymentId === selectedPaymentId) ?? availablePrepayments[0];
  const maxApplicableMinor = selectedPrepayment
    ? Math.min(balanceMinor, selectedPrepayment.unallocatedAmountMinor)
    : 0;

  const [amountStr, setAmountStr] = useState(
    maxApplicableMinor > 0 ? minorToCurrencyInput(maxApplicableMinor, minorUnit) : ""
  );

  const totalPoolMinor = availablePrepayments.reduce((sum, p) => sum + p.unallocatedAmountMinor, 0);

  function handlePaymentChange(newPaymentId: string) {
    setSelectedPaymentId(newPaymentId);
    const targetPayment = availablePrepayments.find((p) => p.paymentId === newPaymentId);
    if (targetPayment) {
      const newMax = Math.min(balanceMinor, targetPayment.unallocatedAmountMinor);
      setAmountStr(minorToCurrencyInput(newMax, minorUnit));
    }
  }

  function handleSetMax() {
    if (maxApplicableMinor > 0) {
      setAmountStr(minorToCurrencyInput(maxApplicableMinor, minorUnit));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!selectedPaymentId) {
      setError("Please select a prepayment record.");
      return;
    }

    try {
      const inputMinor = parseCurrencyAmountToMinor(amountStr, minorUnit, "Amount");
      if (inputMinor <= 0) {
        setError("Amount must be greater than zero.");
        return;
      }
      if (inputMinor > balanceMinor) {
        setError(`Amount cannot exceed bill open balance (${formatMoney(balanceMinor, currencyCode, minorUnit)}).`);
        return;
      }
      if (selectedPrepayment && inputMinor > selectedPrepayment.unallocatedAmountMinor) {
        setError(`Amount cannot exceed available prepayment (${formatMoney(selectedPrepayment.unallocatedAmountMinor, currencyCode, minorUnit)}).`);
        return;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid amount.");
      return;
    }

    startTransition(async () => {
      const result = await applySupplierPaymentCreditAction(businessId, {
        paymentId: selectedPaymentId,
        invoiceId,
        amount: amountStr,
      });

      if (result.error) {
        setError(result.error);
        return;
      }

      setOpen(false);
      router.refresh();
    });
  }

  if (availablePrepayments.length === 0 || balanceMinor <= 0) {
    return null;
  }

  return (
    <div className="mb-5 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm dark:bg-emerald-950/20">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-full bg-emerald-500/10 p-1.5 text-emerald-600 dark:text-emerald-400">
            <Coins className="size-5" />
          </div>
          <div>
            <h4 className="font-semibold text-foreground">
              Vendor Prepayment Credit Available
            </h4>
            <p className="mt-0.5 text-xs text-muted-foreground">
              You hold <strong className="font-semibold text-foreground">{formatMoney(totalPoolMinor, currencyCode, minorUnit)}</strong> in unallocated vendor prepayments with this supplier. Settle this purchase bill directly from available prepayment deposits without recording a new payment.
            </p>
          </div>
        </div>

        <DialogRoot open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white shrink-0">
              <Coins className="mr-1.5 size-4" /> Apply Available Prepayment
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogTitle className="flex items-center gap-2">
              <Coins className="size-5 text-emerald-600" /> Apply Prepayment to {invoiceNumber}
            </DialogTitle>
            <DialogDescription>
              Draw down existing vendor prepayments to settle or reduce this purchase invoice balance.
            </DialogDescription>

            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
              {error && <FormError message={error} />}

              <div className="space-y-1.5">
                <Label htmlFor="prepaymentRecord">Select Vendor Prepayment</Label>
                <SelectNative
                  id="prepaymentRecord"
                  value={selectedPaymentId}
                  onChange={(e) => handlePaymentChange(e.target.value)}
                >
                  {availablePrepayments.map((p) => (
                    <option key={p.paymentId} value={p.paymentId}>
                      {p.paymentNumber} ({formatDate(p.date)}) · Available: {formatMoney(p.unallocatedAmountMinor, p.currencyCode, minorUnit)}
                    </option>
                  ))}
                </SelectNative>
              </div>

              <div className="rounded-md border border-border bg-surface-muted/50 p-3 text-xs space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Purchase Bill Open Balance:</span>
                  <span className="font-semibold tabular">{formatMoney(balanceMinor, currencyCode, minorUnit)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Payment Unallocated Credit:</span>
                  <span className="font-semibold tabular text-emerald-600 dark:text-emerald-400">
                    {selectedPrepayment ? formatMoney(selectedPrepayment.unallocatedAmountMinor, currencyCode, minorUnit) : "—"}
                  </span>
                </div>
                <div className="flex justify-between border-t border-border pt-1 font-medium">
                  <span>Max Applicable:</span>
                  <span className="tabular">{formatMoney(maxApplicableMinor, currencyCode, minorUnit)}</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="applyAmount">Amount to Apply ({currencyCode})</Label>
                  <button
                    type="button"
                    onClick={handleSetMax}
                    className="text-xs text-primary hover:underline font-medium cursor-pointer"
                  >
                    Max ({formatMoney(maxApplicableMinor, currencyCode, minorUnit)})
                  </button>
                </div>
                <Input
                  id="applyAmount"
                  type="number"
                  step="0.000001"
                  min="0.000001"
                  className="money text-right font-medium"
                  value={amountStr}
                  onChange={(e) => setAmountStr(e.target.value)}
                  required
                />
              </div>

              <div className="mt-5 flex justify-end gap-2">
                <DialogClose asChild>
                  <Button type="button" variant="ghost">Cancel</Button>
                </DialogClose>
                <Button type="submit" disabled={isPending} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                  {isPending ? (
                    <LoaderCircle className="mr-1.5 size-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="mr-1.5 size-4" />
                  )}
                  Apply Prepayment
                </Button>
              </div>
            </form>
          </DialogContent>
        </DialogRoot>
      </div>
    </div>
  );
}
