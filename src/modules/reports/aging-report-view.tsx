import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate, formatMoney } from "@/core/format";
import { agingBucketOrder, type AgingReport, type AgingRow } from "./aging-service";

const documentPaths: Record<AgingRow["document_kind"], string> = {
  invoice: "",
  receipt: "sales/receipts",
  credit_note: "sales/credit-notes",
  payment: "purchases/payments",
  debit_note: "purchases/debit-notes",
};

const creditLabels: Record<AgingRow["document_kind"], string> = {
  invoice: "",
  receipt: "Unapplied receipt",
  credit_note: "Unapplied credit note",
  payment: "Unapplied payment",
  debit_note: "Unapplied debit note",
};

export function AgingReportView({
  businessId,
  side,
  report,
  baseCurrency,
  minorUnits,
}: {
  businessId: string;
  side: "receivable" | "payable";
  report: AgingReport;
  baseCurrency: string;
  minorUnits: Map<string, number>;
}) {
  const partyLabel = side === "receivable" ? "Customer" : "Supplier";
  const partyPath = side === "receivable" ? "customers" : "suppliers";
  const statementPath = side === "receivable" ? "customer-statement?customerId=" : "supplier-statement?supplierId=";
  const invoicePath = side === "receivable" ? "sales/invoices" : "purchases/invoices";
  const { tieOut } = report;
  const tiedOut = tieOut.differenceMinor === 0;

  return (
    <>
      <form className="mb-3 flex flex-wrap items-end gap-3">
        <label className="space-y-1 text-xs text-muted-foreground">
          As of
          <Input name="asOf" type="date" defaultValue={report.asOfDate} className="mt-1 w-44 text-foreground" />
        </label>
        <Button type="submit" variant="secondary">Apply</Button>
      </form>

      <div className="mb-3 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {agingBucketOrder.map((bucket) => (
          <div key={bucket} className="rounded-lg border border-border bg-surface-raised px-3 py-2">
            <p className="text-xs text-muted-foreground">{bucket === "Credit" ? "Unapplied credits" : bucket === "Current" ? "Current" : `${bucket} days`}</p>
            <p className="money mt-0.5 text-sm font-semibold">{formatMoney(report.bucketTotals[bucket], baseCurrency)}</p>
          </div>
        ))}
      </div>

      {report.rows.length ? (
        <div className="data-panel overflow-x-auto">
          <table className="data-table min-w-table-xl">
            <thead>
              <tr>
                <th>{partyLabel}</th>
                <th>Document</th>
                <th>Due</th>
                <th>Age</th>
                <th className="text-right!">Foreign open</th>
                <th className="text-right!">Base carrying</th>
              </tr>
            </thead>
            <tbody>
              {report.rows.map((row) => {
                const path = row.document_kind === "invoice" ? invoicePath : documentPaths[row.document_kind];
                return (
                  <tr key={`${row.document_kind}-${row.document_id}`}>
                    <td>
                      <div className="flex items-center gap-2">
                        <Link href={`/b/${businessId}/${partyPath}/${row.party_id}`} className="font-medium text-primary hover:underline">{row.party_name}</Link>
                        <Link href={`/b/${businessId}/reports/${statementPath}${row.party_id}`} className="text-xs text-muted-foreground hover:text-foreground hover:underline">Statement</Link>
                      </div>
                    </td>
                    <td className="tabular">
                      <Link href={`/b/${businessId}/${path}/${row.document_id}`} className="font-medium text-primary hover:underline">{row.document_number}</Link>
                      {row.document_kind !== "invoice" && <span className="ml-2 text-xs text-muted-foreground">{creditLabels[row.document_kind]}</span>}
                    </td>
                    <td>{row.document_kind === "invoice" ? formatDate(row.due_date) : "—"}</td>
                    <td>{row.age_bucket === "Credit" ? "Credit" : row.age_bucket}</td>
                    <td className="money text-right">{formatMoney(row.foreign_open_minor, row.currency_code, minorUnits.get(row.currency_code) ?? 2)}</td>
                    <td className="money text-right font-medium">{formatMoney(row.base_carrying_minor, baseCurrency)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-border-strong bg-surface font-semibold">
                <td className="h-11 px-3" colSpan={5}>Total base carrying amount</td>
                <td className="money h-11 px-3 text-right">{formatMoney(tieOut.subledgerMinor, baseCurrency)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-surface py-10 text-center">
          <p className="font-medium">{side === "receivable" ? "No outstanding receivables" : "No outstanding payables"}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Posted {side === "receivable" ? "invoices" : "purchase invoices"} dated on or before {formatDate(report.asOfDate)} with a remaining balance appear here.
          </p>
        </div>
      )}

      <section className="mt-4" aria-label="General ledger tie-out">
        <div className={`data-panel overflow-x-auto ${tiedOut ? "" : "border-danger/30"}`}>
          <table className="data-table min-w-table-md">
            <thead>
              <tr>
                <th>GL tie-out at {formatDate(report.asOfDate)}</th>
                <th className="text-right!">Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Aging total ({side === "receivable" ? "receivables subledger" : "payables subledger"})</td>
                <td className="money text-right">{formatMoney(tieOut.subledgerMinor, baseCurrency)}</td>
              </tr>
              <tr>
                <td>
                  {tieOut.controlAccountId ? (
                    <Link
                      href={`/b/${businessId}/reports/general-ledger?accountId=${encodeURIComponent(tieOut.controlAccountId)}&dateTo=${encodeURIComponent(report.asOfDate)}`}
                      className="text-primary hover:underline"
                    >
                      GL control balance · {tieOut.controlAccountName}
                    </Link>
                  ) : (
                    "GL control balance (control account not configured)"
                  )}
                </td>
                <td className="money text-right">{formatMoney(tieOut.glMinor, baseCurrency)}</td>
              </tr>
              <tr className={tiedOut ? "font-semibold" : "bg-danger/10 font-semibold text-danger"}>
                <td>
                  <span className="mr-2">Difference</span>
                  <Badge tone={tiedOut ? "success" : "danger"}>{tiedOut ? "Tied out" : "Does not tie out"}</Badge>
                </td>
                <td className="money text-right">{formatMoney(tieOut.differenceMinor, baseCurrency)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        {!tiedOut && (
          <p className="mt-2 text-xs text-muted-foreground">
            A difference usually means entries posted straight to the control account (manual journals, opening balances or revaluations) that no document in the subledger explains.
          </p>
        )}
      </section>
    </>
  );
}
