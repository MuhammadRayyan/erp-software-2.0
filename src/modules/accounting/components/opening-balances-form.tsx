"use client";

import { useMemo, useState } from "react";
import { Scale, CheckCircle2, AlertCircle, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormError } from "@/components/form-error";
import { formatMoney } from "@/core/format";
import { saveOpeningBalancesAction } from "../actions";
import type { OpeningBalancesData } from "../services/opening-balances-service";

export function OpeningBalancesForm({
  businessId,
  initialData,
  currency = "AED",
}: {
  businessId: string;
  initialData: OpeningBalancesData;
  currency?: string;
}) {
  const router = useRouter();
  const [openingDate, setOpeningDate] = useState<string>(
    initialData.openingDate || new Date().toISOString().slice(0, 10),
  );
  const [entries, setEntries] = useState<Record<string, { debit: string; credit: string }>>(() => {
    const map: Record<string, { debit: string; credit: string }> = {};
    for (const a of initialData.accounts) {
      map[a.accountId] = {
        debit: a.debitMinor > 0 ? (a.debitMinor / 100).toFixed(2) : "",
        credit: a.creditMinor > 0 ? (a.creditMinor / 100).toFixed(2) : "",
      };
    }
    return map;
  });

  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>("");

  function updateRow(accountId: string, field: "debit" | "credit", val: string) {
    setEntries((prev) => ({
      ...prev,
      [accountId]: {
        ...prev[accountId],
        [field]: val,
        // If entering debit, clear credit and vice versa
        ...(field === "debit" && val ? { credit: "" } : {}),
        ...(field === "credit" && val ? { debit: "" } : {}),
      },
    }));
  }

  const { totalDebitsMinor, totalCreditsMinor, diffMinor } = useMemo(() => {
    let debits = 0;
    let credits = 0;
    for (const item of Object.values(entries)) {
      const d = parseFloat(item.debit || "0");
      const c = parseFloat(item.credit || "0");
      if (!isNaN(d) && d > 0) debits += Math.round(d * 100);
      if (!isNaN(c) && c > 0) credits += Math.round(c * 100);
    }
    return {
      totalDebitsMinor: debits,
      totalCreditsMinor: credits,
      diffMinor: debits - credits,
    };
  }, [entries]);

  const isBalanced = diffMinor === 0;

  async function handleSave() {
    if (!openingDate) {
      setError("Please set the starting balance date.");
      return;
    }
    setPending(true);
    setError("");

    const payload = initialData.accounts.map((a) => {
      const row = entries[a.accountId] || { debit: "", credit: "" };
      const d = parseFloat(row.debit || "0");
      const c = parseFloat(row.credit || "0");
      return {
        accountId: a.accountId,
        debitMinor: !isNaN(d) && d > 0 ? Math.round(d * 100) : 0,
        creditMinor: !isNaN(c) && c > 0 ? Math.round(c * 100) : 0,
      };
    });

    const res = await saveOpeningBalancesAction(businessId, openingDate, payload);
    setPending(false);
    if (res.error) {
      setError(res.error);
      return;
    }

    toast.success("Opening balances saved successfully.");
    router.refresh();
  }

  // Group accounts by type
  const grouped = useMemo(() => {
    const map: Record<string, typeof initialData.accounts> = {
      asset: [],
      liability: [],
      equity: [],
      income: [],
      expense: [],
    };
    for (const a of initialData.accounts) {
      if (map[a.type]) map[a.type].push(a);
      else map.asset.push(a);
    }
    return map;
  }, [initialData]);

  const typeLabels: Record<string, string> = {
    asset: "Assets (Bank, Cash, Receivables, Inventory, Fixed Assets)",
    liability: "Liabilities (Payables, Loans, Taxes)",
    equity: "Equity (Share Capital, Retained Earnings)",
    income: "Historical Income",
    expense: "Historical Expenses",
  };

  return (
    <div className="space-y-6">
      <div className="data-panel p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-md space-y-1">
            <Label htmlFor="opening-date">Opening Balances Date</Label>
            <Input
              id="opening-date"
              type="date"
              value={openingDate}
              onChange={(e) => setOpeningDate(e.target.value)}
              className="w-56"
            />
            <p className="text-xs text-muted-foreground">
              All starting balances will take effect as of this date in your general ledger.
            </p>
          </div>

          <div className="flex items-center gap-3 rounded-lg border border-border bg-surface-muted/30 p-3 sm:px-4">
            <div className={`flex size-9 items-center justify-center rounded-md ${isBalanced ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-amber-500/10 text-amber-600 dark:text-amber-400"}`}>
              <Scale className="size-4" />
            </div>
            <div className="text-xs">
              <div className="flex items-center gap-2 font-medium">
                <span>Debits: {formatMoney(totalDebitsMinor, currency)}</span>
                <span className="text-muted-foreground">•</span>
                <span>Credits: {formatMoney(totalCreditsMinor, currency)}</span>
              </div>
              <div className="mt-0.5 flex items-center gap-1.5">
                {isBalanced ? (
                  <span className="text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                    <CheckCircle2 className="size-3" /> Fully Balanced
                  </span>
                ) : (
                  <span className="text-amber-600 dark:text-amber-400 font-medium flex items-center gap-1">
                    <AlertCircle className="size-3" /> Diff: {formatMoney(Math.abs(diffMinor), currency)} ({diffMinor > 0 ? "Debit excess" : "Credit excess"})
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {error && <FormError message={error} />}
      </div>

      <div className="space-y-6">
        {(["asset", "liability", "equity"] as const).map((type) => {
          const list = grouped[type];
          if (!list || list.length === 0) return null;
          return (
            <section key={type} className="data-panel">
              <div className="border-b border-border bg-surface px-4 py-2.5">
                <h2 className="text-sm font-semibold">{typeLabels[type]}</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="data-table min-w-[650px]">
                  <thead>
                    <tr>
                      <th>Account Name</th>
                      <th>Subtype</th>
                      <th className="w-40 text-right!">Opening Debit</th>
                      <th className="w-40 text-right!">Opening Credit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((acct) => {
                      const row = entries[acct.accountId] || { debit: "", credit: "" };
                      return (
                        <tr key={acct.accountId}>
                          <td className="font-medium">{acct.name}</td>
                          <td className="text-xs text-muted-foreground capitalize">
                            {acct.subtype.replace(/_/g, " ")}
                          </td>
                          <td>
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              placeholder="0.00"
                              value={row.debit}
                              onChange={(e) => updateRow(acct.accountId, "debit", e.target.value)}
                              className="text-right tabular-nums text-xs h-8"
                            />
                          </td>
                          <td>
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              placeholder="0.00"
                              value={row.credit}
                              onChange={(e) => updateRow(acct.accountId, "credit", e.target.value)}
                              className="text-right tabular-nums text-xs h-8"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}
      </div>

      <div className="sticky bottom-0 z-20 flex items-center justify-between border-t border-border bg-surface/95 p-4 backdrop-blur-sm">
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {!isBalanced && (
            <span>
              Note: Unbalanced differences will automatically offset to <strong>Retained Earnings / Owner Equity</strong> upon saving.
            </span>
          )}
        </div>
        <Button permission={"save"} onClick={handleSave} disabled={pending}>
          <Save className="size-4" /> Save Opening Balances
        </Button>
      </div>
    </div>
  );
}
