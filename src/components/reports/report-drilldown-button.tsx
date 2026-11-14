"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, LoaderCircle, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DialogContent,
  DialogDescription,
  DialogRoot,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatDate, formatMoney } from "@/core/format";
import type { DrilldownResult } from "@/modules/reports/drilldown-service";

export type DrilldownQuery = {
  kind: "account" | "cash_pnl" | "retained_earnings" | "vat_bucket";
  accountId?: string;
  dateFrom?: string;
  dateTo?: string;
  periodId?: string;
  bucket?: string;
  emirate?: string;
};

export function ReportDrilldownButton({
  businessId,
  currency,
  label,
  query,
  className,
  title,
}: {
  businessId: string;
  currency: string;
  label: string;
  query: DrilldownQuery;
  className?: string;
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<DrilldownResult | null>(null);

  async function handleOpen() {
    setOpen(true);
    setLoading(true);
    setError("");
    try {
      const qs = new URLSearchParams();
      qs.set("kind", query.kind);
      if (query.accountId) qs.set("accountId", query.accountId);
      if (query.dateFrom) qs.set("dateFrom", query.dateFrom);
      if (query.dateTo) qs.set("dateTo", query.dateTo);
      if (query.periodId) qs.set("periodId", query.periodId);
      if (query.bucket) qs.set("bucket", query.bucket);
      if (query.emirate) qs.set("emirate", query.emirate);
      const res = await fetch(`/api/businesses/${businessId}/reports/drilldown?${qs.toString()}`);
      const payload = (await res.json()) as { data?: DrilldownResult; error?: string };
      if (!res.ok || payload.error || !payload.data) {
        setError(payload.error || "Could not load transactions.");
      } else {
        setResult(payload.data);
      }
    } catch {
      setError("Failed to fetch drill-down transactions.");
    } finally {
      setLoading(false);
    }
  }

  const isVat = query.kind === "vat_bucket";

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        title={title ?? "Click to drill down to underlying transactions"}
        className={
          className ??
          "tabular font-medium text-primary hover:underline cursor-pointer inline-flex items-center gap-1"
        }
      >
        {label}
      </button>

      <DialogRoot open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
          <DialogTitle>{result?.title ?? "Transaction Drill-Down"}</DialogTitle>
          <DialogDescription>
            {result?.subtitle ?? "Inspecting underlying ledger postings and source vouchers."}
          </DialogDescription>

          <div className="mt-4 flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                <LoaderCircle className="size-4 animate-spin" /> Loading underlying transactions…
              </div>
            ) : error ? (
              <div className="rounded-md border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
                {error}
              </div>
            ) : result && result.rows.length > 0 ? (
              <div className="data-panel overflow-x-auto">
                <table className="data-table min-w-[720px]">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Voucher</th>
                      <th>Type</th>
                      <th>Party / Ref</th>
                      <th>Description</th>
                      <th className="text-right!">{isVat ? "Net" : "Debit"}</th>
                      <th className="text-right!">{isVat ? "VAT" : "Credit"}</th>
                      <th className="text-right!">Net Impact</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.map((row) => (
                      <tr key={row.id}>
                        <td className="whitespace-nowrap">{formatDate(row.date)}</td>
                        <td className="whitespace-nowrap">
                          {row.sourceHref ? (
                            <Link
                              href={row.sourceHref}
                              onClick={() => setOpen(false)}
                              className="tabular font-medium text-primary hover:underline inline-flex items-center gap-1"
                            >
                              {row.documentNumber}
                              <ArrowUpRight className="size-3" />
                            </Link>
                          ) : row.journalHref ? (
                            <Link
                              href={row.journalHref}
                              onClick={() => setOpen(false)}
                              className="tabular font-medium text-primary hover:underline"
                            >
                              {row.documentNumber}
                            </Link>
                          ) : (
                            <span className="tabular font-medium">{row.documentNumber}</span>
                          )}
                        </td>
                        <td className="text-xs text-muted-foreground whitespace-nowrap">{row.sourceLabel}</td>
                        <td className="max-w-[140px] truncate text-xs">{row.partyOrAccount}</td>
                        <td className="max-w-[200px] truncate text-xs text-muted-foreground">{row.description}</td>
                        <td className="money text-right">
                          {row.debitMinor ? formatMoney(row.debitMinor, currency) : "—"}
                        </td>
                        <td className="money text-right">
                          {row.creditMinor ? formatMoney(row.creditMinor, currency) : "—"}
                        </td>
                        <td className="money text-right font-medium">
                          {formatMoney(row.netMinor, currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-border-strong bg-surface font-semibold">
                      <td colSpan={7} className="px-3 py-2 text-right">Total</td>
                      <td className="money px-3 py-2 text-right">
                        {formatMoney(result.totalNetMinor, currency)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              <div className="rounded-lg border border-border bg-surface py-10 text-center">
                <Search className="mx-auto mb-2 size-6 text-muted-foreground/60" />
                <p className="font-medium">No transactions found</p>
                <p className="mt-1 text-sm text-muted-foreground">No posted entries match this period and account.</p>
              </div>
            )}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
            {result?.fullReportHref ? (
              <Button asChild variant="secondary" size="sm">
                <Link href={result.fullReportHref} onClick={() => setOpen(false)}>
                  {result.fullReportLabel}
                  <ArrowUpRight className="size-3.5" />
                </Link>
              </Button>
            ) : <span />}
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </DialogRoot>
    </>
  );
}
