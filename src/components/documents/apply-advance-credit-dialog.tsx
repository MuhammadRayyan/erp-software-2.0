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

export type AdvanceCreditPoolItem = {
  id: string;
  number: string;
  date: string;
  currencyCode: string;
  unallocatedAmountMinor: number;
};

export type ApplyAdvanceCreditDialogLabels = {
  bannerTitle: string;
  bannerDescription: (formattedPool: string) => React.ReactNode;
  triggerLabel: string;
  dialogTitle: string;
  dialogDescription: string;
  selectLabel: string;
  missingSelectionError: string;
  openBalanceLabel: string;
  exceedOpenBalanceLabel: string;
  unallocatedCreditLabel: string;
  exceedAvailableCreditLabel: string;
  submitLabel: string;
};

export function ApplyAdvanceCreditDialog({
  balanceMinor,
  currencyCode,
  minorUnit,
  items,
  labels,
  onApply,
}: {
  balanceMinor: number;
  currencyCode: string;
  minorUnit: number;
  items: AdvanceCreditPoolItem[];
  labels: ApplyAdvanceCreditDialogLabels;
  onApply: (selectedId: string, amountStr: string) => Promise<{ error?: string }>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(items[0]?.id ?? "");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  const selectedItem = items.find((item) => item.id === selectedId) ?? items[0];
  const effectiveSelectedId = selectedItem?.id ?? "";
  const maxApplicableMinor = selectedItem
    ? Math.min(balanceMinor, selectedItem.unallocatedAmountMinor)
    : 0;
  const inputStep = minorUnit > 0 ? (10 ** -minorUnit).toFixed(minorUnit) : "1";

  const [amountStr, setAmountStr] = useState(
    maxApplicableMinor > 0 ? minorToCurrencyInput(maxApplicableMinor, minorUnit) : ""
  );

  const totalPoolMinor = items.reduce((sum, item) => sum + item.unallocatedAmountMinor, 0);

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) {
      setError("");
      const currentTarget = items.find((item) => item.id === selectedId) ?? items[0];
      const nextId = currentTarget?.id ?? "";
      setSelectedId(nextId);
      const nextMax = currentTarget
        ? Math.min(balanceMinor, currentTarget.unallocatedAmountMinor)
        : 0;
      setAmountStr(nextMax > 0 ? minorToCurrencyInput(nextMax, minorUnit) : "");
    }
  }

  function handleSelectionChange(newId: string) {
    setSelectedId(newId);
    const target = items.find((item) => item.id === newId);
    if (target) {
      const newMax = Math.min(balanceMinor, target.unallocatedAmountMinor);
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

    if (!effectiveSelectedId) {
      setError(labels.missingSelectionError);
      return;
    }

    try {
      const inputMinor = parseCurrencyAmountToMinor(amountStr, minorUnit, "Amount");
      if (inputMinor <= 0) {
        setError("Amount must be greater than zero.");
        return;
      }
      if (inputMinor > balanceMinor) {
        setError(
          `Amount cannot exceed ${labels.exceedOpenBalanceLabel} (${formatMoney(balanceMinor, currencyCode, minorUnit)}).`
        );
        return;
      }
      if (selectedItem && inputMinor > selectedItem.unallocatedAmountMinor) {
        setError(
          `Amount cannot exceed ${labels.exceedAvailableCreditLabel} (${formatMoney(selectedItem.unallocatedAmountMinor, currencyCode, minorUnit)}).`
        );
        return;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid amount.");
      return;
    }

    startTransition(async () => {
      const result = await onApply(effectiveSelectedId, amountStr);

      if (result.error) {
        setError(result.error);
        return;
      }

      setOpen(false);
      router.refresh();
    });
  }

  if (items.length === 0 || balanceMinor <= 0) {
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
            <h4 className="font-semibold text-foreground">{labels.bannerTitle}</h4>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {labels.bannerDescription(formatMoney(totalPoolMinor, currencyCode, minorUnit))}
            </p>
          </div>
        </div>

        <DialogRoot open={open} onOpenChange={handleOpenChange}>
          <DialogTrigger asChild>
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white shrink-0">
              <Coins className="mr-1.5 size-4" /> {labels.triggerLabel}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogTitle className="flex items-center gap-2">
              <Coins className="size-5 text-emerald-600" /> {labels.dialogTitle}
            </DialogTitle>
            <DialogDescription>{labels.dialogDescription}</DialogDescription>

            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
              {error && <FormError message={error} />}

              <div className="space-y-1.5">
                <Label htmlFor="advanceCreditSource">{labels.selectLabel}</Label>
                <SelectNative
                  id="advanceCreditSource"
                  value={effectiveSelectedId}
                  onChange={(e) => handleSelectionChange(e.target.value)}
                >
                  {items.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.number} ({formatDate(item.date)}) · Available:{" "}
                      {formatMoney(item.unallocatedAmountMinor, item.currencyCode, minorUnit)}
                    </option>
                  ))}
                </SelectNative>
              </div>

              <div className="rounded-md border border-border bg-surface-muted/50 p-3 text-xs space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{labels.openBalanceLabel}</span>
                  <span className="font-semibold tabular">
                    {formatMoney(balanceMinor, currencyCode, minorUnit)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{labels.unallocatedCreditLabel}</span>
                  <span className="font-semibold tabular text-emerald-600 dark:text-emerald-400">
                    {selectedItem
                      ? formatMoney(selectedItem.unallocatedAmountMinor, currencyCode, minorUnit)
                      : "—"}
                  </span>
                </div>
                <div className="flex justify-between border-t border-border pt-1 font-medium">
                  <span>Max Applicable:</span>
                  <span className="tabular">
                    {formatMoney(maxApplicableMinor, currencyCode, minorUnit)}
                  </span>
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
                  step={inputStep}
                  min={inputStep}
                  className="money text-right font-medium"
                  value={amountStr}
                  onChange={(e) => setAmountStr(e.target.value)}
                  required
                />
              </div>

              <div className="mt-5 flex justify-end gap-2">
                <DialogClose asChild>
                  <Button type="button" variant="ghost">
                    Cancel
                  </Button>
                </DialogClose>
                <Button
                  type="submit"
                  disabled={isPending}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  {isPending ? (
                    <LoaderCircle className="mr-1.5 size-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="mr-1.5 size-4" />
                  )}
                  {labels.submitLabel}
                </Button>
              </div>
            </form>
          </DialogContent>
        </DialogRoot>
      </div>
    </div>
  );
}
