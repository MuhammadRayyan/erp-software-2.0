import Link from "next/link";
import { formatMoney } from "@/core/format";
import { requireModule } from "@/core/permissions/require-module";
import {
  computeVariance,
  getComparativeBalanceSheet,
  resolveComparativeBalanceDates,
  type ComparativeBalanceSheetRow,
} from "@/modules/reports/report-service";
import { listSavedReports } from "@/modules/reports/saved-report-service";
import { BackLink } from "@/components/back-link";
import { ExportCsvButton } from "@/components/export-csv-button";
import { BalanceSheetFilterForm } from "@/components/reports/comparative-report-filters";
import { ReportDrilldownButton } from "@/components/reports/report-drilldown-button";
import { SavedReportToolbar } from "@/components/reports/saved-report-toolbar";

export const metadata = { title: "Balance Sheet Report" };

export default async function BalanceSheetReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{
    throughDate?: string;
    compareMode?: string;
    compareThroughDate?: string;
    viewId?: string;
  }>;
}) {
  const { businessId } = await params;
  const filters = await searchParams;
  const compareMode = filters.compareMode || "none";
  const { user, access } = await requireModule(businessId, "reports");

  const dates = resolveComparativeBalanceDates({
    throughDate: filters.throughDate,
    compareMode,
    compareThroughDate: filters.compareThroughDate,
  });

  const { accounts: rows, retainedEarningsMinor } = getComparativeBalanceSheet(
    businessId,
    user.id,
    dates,
  );
  const savedViews = listSavedReports(businessId, user.id, "balance_sheet");
  const showVariance = dates.length === 2;
  const totalCols = 1 + dates.length + (showVariance ? 2 : 0);

  const assets = rows.filter((r) => r.type === "asset");
  const liabilities = rows.filter((r) => r.type === "liability");
  const equity = rows.filter((r) => r.type === "equity");

  const sumColumns = (arr: ComparativeBalanceSheetRow[]) =>
    dates.map((_, idx) => arr.reduce((acc, r) => acc + r.amountsMinor[idx], 0));

  const totalAssets = sumColumns(assets);
  const totalLiabilities = sumColumns(liabilities);
  const equityAccountsTotal = sumColumns(equity);
  const totalEquity = dates.map((_, idx) => equityAccountsTotal[idx] + retainedEarningsMinor[idx]);
  const totalLiabilitiesAndEquity = dates.map(
    (_, idx) => totalLiabilities[idx] + totalEquity[idx],
  );

  const csvData = rows.map((r) => {
    const obj: Record<string, string> = {
      name: r.name,
      type: r.type,
      subtype: r.subtype,
    };
    dates.forEach((_, idx) => {
      obj[`date_${idx}`] = (r.amountsMinor[idx] / 100).toFixed(2);
    });
    if (showVariance) {
      obj.variance = r.varianceMinor !== null ? (r.varianceMinor / 100).toFixed(2) : "";
      obj.variance_pct = r.variancePercent !== null ? `${r.variancePercent}%` : "";
    }
    return obj;
  });

  const csvColumns = [
    { header: "Account", accessorKey: "name" },
    { header: "Type", accessorKey: "type" },
    { header: "Subtype", accessorKey: "subtype" },
    ...dates.map((d, idx) => ({ header: d.label, accessorKey: `date_${idx}` })),
    ...(showVariance
      ? [
          { header: "Change", accessorKey: "variance" },
          { header: "Change %", accessorKey: "variance_pct" },
        ]
      : []),
  ];

  function renderVarianceCells(amounts: number[]) {
    if (!showVariance) return null;
    const { varianceMinor, variancePercent } = computeVariance(amounts[0], amounts[1]);
    return (
      <>
        <td className="money text-right text-muted-foreground">
          {varianceMinor !== null ? formatMoney(varianceMinor, access.business.currency) : "—"}
        </td>
        <td className="money text-right text-muted-foreground">
          {variancePercent !== null ? `${variancePercent > 0 ? "+" : ""}${variancePercent}%` : "—"}
        </td>
      </>
    );
  }

  function renderGroup(title: string, data: ComparativeBalanceSheetRow[], totals: number[]) {
    if (data.length === 0 && title !== "Equity") return null;
    const hasRetained = title === "Equity" && retainedEarningsMinor.some((v) => v !== 0);
    return (
      <>
        <tr>
          <td colSpan={totalCols} className="bg-surface-muted py-2 px-3 font-semibold text-foreground">
            {title}
          </td>
        </tr>
        {data.map((row) => (
          <tr key={row.id} className="hover:bg-surface-muted/40">
            <td className="pl-6 py-2">
              <Link
                href={`/b/${businessId}/accounting/chart-of-accounts/${row.id}`}
                className="hover:underline"
              >
                {row.name}
              </Link>
            </td>
            {dates.map((d, idx) => (
              <td key={`${row.id}-${idx}`} className="money py-2 text-right">
                {row.amountsMinor[idx] !== 0 ? (
                  <ReportDrilldownButton
                    businessId={businessId}
                    currency={access.business.currency}
                    label={formatMoney(row.amountsMinor[idx], access.business.currency)}
                    query={{
                      kind: "account",
                      accountId: row.id,
                      dateTo: d.throughDate,
                    }}
                    title={`Drill down into ${row.name} (${d.label})`}
                  />
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </td>
            ))}
            {renderVarianceCells(row.amountsMinor)}
          </tr>
        ))}
        {hasRetained && (
          <tr className="hover:bg-surface-muted/40">
            <td className="pl-6 py-2">
              <span className="text-muted-foreground">Retained Earnings (Current Period)</span>
            </td>
            {dates.map((d, idx) => (
              <td key={`re-${idx}`} className="money py-2 text-right">
                {retainedEarningsMinor[idx] !== 0 ? (
                  <ReportDrilldownButton
                    businessId={businessId}
                    currency={access.business.currency}
                    label={formatMoney(retainedEarningsMinor[idx], access.business.currency)}
                    query={{
                      kind: "retained_earnings",
                      dateTo: d.throughDate,
                    }}
                    title={`Inspect Retained Earnings (${d.label})`}
                  />
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </td>
            ))}
            {renderVarianceCells(retainedEarningsMinor)}
          </tr>
        )}
        <tr>
          <td className="pl-6 pt-2 pb-2 font-medium">Total {title}</td>
          {totals.map((val, idx) => (
            <td key={idx} className="money border-t border-border pt-2 pb-2 text-right font-medium">
              {formatMoney(val, access.business.currency)}
            </td>
          ))}
          {renderVarianceCells(totals)}
        </tr>
        <tr>
          <td colSpan={totalCols} className="h-3"></td>
        </tr>
      </>
    );
  }

  return (
    <div className="page-container max-w-6xl">
      <BackLink href={`/b/${businessId}/reports`}>Reports</BackLink>

      <div className="page-header flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="page-title">Balance Sheet</h1>
          <p className="page-description">
            Assets, Liabilities, and Equity with comparative dates and ledger drill-down.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SavedReportToolbar
            businessId={businessId}
            reportType="balance_sheet"
            currentConfig={{
              throughDate: filters.throughDate ?? "",
              compareMode,
              compareThroughDate: filters.compareThroughDate ?? "",
            }}
            savedViews={savedViews}
            activeViewId={filters.viewId}
            basePath={`/b/${businessId}/reports/balance-sheet`}
          />
          <ExportCsvButton
            filename={`balance-sheet-${new Date().toISOString().slice(0, 10)}.csv`}
            columns={csvColumns}
            data={csvData}
          />
        </div>
      </div>

      <BalanceSheetFilterForm
        key={`${filters.throughDate ?? ""}|${compareMode}|${filters.compareThroughDate ?? ""}|${filters.viewId ?? ""}`}
        throughDate={filters.throughDate}
        compareMode={compareMode}
        compareThroughDate={filters.compareThroughDate}
      />

      <div className="data-panel overflow-x-auto p-6">
        <table className="w-full min-w-[600px] text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
              <th className="pb-3 text-left font-semibold">Account</th>
              {dates.map((d, idx) => (
                <th key={idx} className="pb-3 text-right font-semibold">
                  {d.label}
                </th>
              ))}
              {showVariance && (
                <>
                  <th className="pb-3 text-right font-semibold">Change</th>
                  <th className="pb-3 text-right font-semibold">Chg %</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {renderGroup("Assets", assets, totalAssets)}
            {renderGroup("Liabilities", liabilities, totalLiabilities)}
            {renderGroup("Equity", equity, totalEquity)}

            <tr>
              <td className="pt-6 text-lg font-bold">Total Assets</td>
              {totalAssets.map((val, idx) => (
                <td key={idx} className="money border-t-2 border-border pt-6 text-right text-lg font-bold">
                  {formatMoney(val, access.business.currency)}
                </td>
              ))}
              {renderVarianceCells(totalAssets)}
            </tr>
            <tr>
              <td className="pt-2 text-lg font-bold">Total Liabilities &amp; Equity</td>
              {totalLiabilitiesAndEquity.map((val, idx) => (
                <td key={idx} className="money pt-2 text-right text-lg font-bold">
                  {formatMoney(val, access.business.currency)}
                </td>
              ))}
              {renderVarianceCells(totalLiabilitiesAndEquity)}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
