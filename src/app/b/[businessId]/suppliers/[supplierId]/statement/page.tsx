import Link from "next/link";
import { notFound } from "next/navigation";
import { requireModule } from "@/core/permissions/require-module";
import { formatDate, formatMoney } from "@/core/format";
import { PrintButton } from "@/components/print-button";
import { journalSourceLabel } from "@/modules/accounting/journal-source";
import { getSupplier } from "@/modules/suppliers/supplier-service";
import { getSupplierStatement, getSupplierAging } from "@/modules/reports/supplier-statement-service";
import { StatementAgingBar } from "@/modules/reports/statement-aging-bar";
import { ListDateFilter, STATEMENT_DATE_PRESETS } from "@/components/list-date-filter";
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BackLink } from "@/components/back-link";

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export default async function SupplierStatementPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string; supplierId: string }>;
  searchParams: Promise<{ from?: string; to?: string; currency?: string }>;
}) {
  const { businessId, supplierId } = await params;
  const sp = await searchParams;
  const from = sp.from && DATE_REGEX.test(sp.from) ? sp.from : undefined;
  const to = sp.to && DATE_REGEX.test(sp.to) ? sp.to : undefined;

  const { user } = await requireModule(businessId, "purchases");
  const supplier = getSupplier(businessId, user.id, supplierId);
  if (!supplier) notFound();

  const rows = getSupplierStatement(businessId, user.id, supplierId, {
    fromDate: from,
    toDate: to,
    currencyCode: sp.currency,
  });

  const asOfDate = to || new Date().toISOString().slice(0, 10);
  const aging = getSupplierAging(businessId, user.id, supplierId, asOfDate, sp.currency);

  const searchParamsUrl = new URLSearchParams();
  if (from) searchParamsUrl.set("from", from);
  if (to) searchParamsUrl.set("to", to);
  if (sp.currency) searchParamsUrl.set("currency", sp.currency);

  const pdfHref = `/api/businesses/${businessId}/suppliers/${supplierId}/statement/pdf${
    searchParamsUrl.toString() ? `?${searchParamsUrl.toString()}` : ""
  }`;

  const totalDebits = rows.reduce((sum, r) => sum + r.debit_minor, 0);
  const totalCredits = rows.reduce((sum, r) => sum + r.credit_minor, 0);
  const finalBalance = rows.length > 0 ? rows[rows.length - 1].balanceMinor : 0;

  return (
    <div className="page-container space-y-6">
      <BackLink href={`/b/${businessId}/suppliers/${supplierId}`}>{supplier.name}</BackLink>

      <div className="page-header">
        <div>
          <h1 className="page-title">Supplier Statement</h1>
          <p className="page-description">
            {supplier.name} · Posted Accounts Payable activity, aging & running balance
          </p>
        </div>
        <div className="flex gap-2 print:hidden">
          <PrintButton />
          <Button permission={"export"} asChild variant="primary">
            <Link href={pdfHref} target="_blank">
              <FileText className="size-4 mr-1.5" /> Export PDF
            </Link>
          </Button>
        </div>
      </div>

      {/* Aging Analysis Bar */}
      <StatementAgingBar aging={aging} partyType="supplier" />

      {/* Date-Range Filter and Movements Table */}
      <div className="data-panel overflow-hidden">
        <ListDateFilter
          pathname={`/b/${businessId}/suppliers/${supplierId}/statement`}
          searchParams={searchParamsUrl}
          initialFrom={from ?? ""}
          initialTo={to ?? ""}
          fromLabel="Period From"
          toLabel="Period To"
          presets={STATEMENT_DATE_PRESETS}
        />

        {rows.length ? (
          <div className="overflow-x-auto">
            <table className="data-table min-w-[850px]">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Reference</th>
                  <th>Description</th>
                  <th className="text-right!">Debit</th>
                  <th className="text-right!">Credit</th>
                  <th className="text-right!">Payable Balance</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={`${row.date}-${row.entry_number}-${row.source_type}`}
                    className={row.source_type === "opening_balance" ? "bg-surface-muted/40 font-medium italic" : undefined}
                  >
                    <td>{formatDate(row.date)}</td>
                    <td>{journalSourceLabel(row.source_type)}</td>
                    <td className="tabular">{row.reference ?? row.entry_number}</td>
                    <td className="text-muted-foreground">{row.description}</td>
                    <td className="money text-right">
                      {row.debit_minor ? formatMoney(row.debit_minor, row.currency_code) : "—"}
                    </td>
                    <td className="money text-right">
                      {row.credit_minor ? formatMoney(row.credit_minor, row.currency_code) : "—"}
                    </td>
                    <td className="money text-right font-medium">
                      {formatMoney(row.balanceMinor, row.currency_code)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border bg-surface-muted/30 font-semibold">
                  <td colSpan={4} className="text-right">
                    Period Total ({rows.filter((r) => r.source_type !== "opening_balance").length} transactions)
                  </td>
                  <td className="money text-right">{formatMoney(totalDebits, aging.currencyCode)}</td>
                  <td className="money text-right">{formatMoney(totalCredits, aging.currencyCode)}</td>
                  <td className="money text-right font-bold text-primary">
                    {formatMoney(finalBalance, aging.currencyCode)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <div className="rounded-b-lg bg-surface py-10 text-center">
            <p className="font-medium">No posted activity found</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Try adjusting the date range filter or clear it to view all activity.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
