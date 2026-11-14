import Link from "next/link";
import { formatMoney } from "@/core/format";
import { requireModule } from "@/core/permissions/require-module";
import {
  computeVariance,
  getComparativeProfitAndLoss,
  resolveComparativePnlPeriods,
  type ComparativePnlRow,
} from "@/modules/reports/report-service";
import { listSavedReports } from "@/modules/reports/saved-report-service";
import { BackLink } from "@/components/back-link";
import { ExportCsvButton } from "@/components/export-csv-button";
import { ProfitLossFilterForm } from "@/components/reports/comparative-report-filters";
import { ReportDrilldownButton } from "@/components/reports/report-drilldown-button";
import { SavedReportToolbar } from "@/components/reports/saved-report-toolbar";

export const metadata = { title: "Profit & Loss Report" };

export default async function ProfitAndLossReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{
    dateFrom?: string;
    dateTo?: string;
    basis?: "accrual" | "cash";
    compareMode?: string;
    compareDateFrom?: string;
    compareDateTo?: string;
    viewId?: string;
  }>;
}) {
  const { businessId } = await params;
  const filters = await searchParams;
  const basis = filters.basis === "cash" ? "cash" : "accrual";
  const compareMode = filters.compareMode || "none";
  const { user, access } = await requireModule(businessId, "reports");

  const periods = resolveComparativePnlPeriods({
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    compareMode,
    compareDateFrom: filters.compareDateFrom,
    compareDateTo: filters.compareDateTo,
  });

  const rows = getComparativeProfitAndLoss(businessId, user.id, periods, basis);
  const savedViews = listSavedReports(businessId, user.id, "profit_loss");
  const showVariance = periods.length === 2;
  const totalCols = 1 + periods.length + (showVariance ? 2 : 0);

  const sales = rows.filter((r) => r.type === "income" && r.subtype === "sales");
  const otherIncome = rows.filter((r) => r.type === "income" && r.subtype === "other_income");
  const costOfSales = rows.filter((r) => r.type === "expense" && r.subtype === "cost_of_sales");
  const operatingExpenses = rows.filter((r) => r.type === "expense" && r.subtype === "operating");
  const otherExpenses = rows.filter((r) => r.type === "expense" && r.subtype === "other_expense");

  const sumPeriods = (arr: ComparativePnlRow[]) =>
    periods.map((_, idx) => arr.reduce((acc, r) => acc + r.amountsMinor[idx], 0));

  const totalSales = sumPeriods(sales);
  const totalOtherIncome = sumPeriods(otherIncome);
  const totalIncome = periods.map((_, i) => totalSales[i] + totalOtherIncome[i]);

  const totalCostOfSales = sumPeriods(costOfSales);
  const grossProfit = periods.map((_, i) => totalIncome[i] - totalCostOfSales[i]);

  const totalOperating = sumPeriods(operatingExpenses);
  const totalOtherExpenses = sumPeriods(otherExpenses);
  const totalExpenses = periods.map(
    (_, i) => totalCostOfSales[i] + totalOperating[i] + totalOtherExpenses[i],
  );

  const netProfit = periods.map((_, i) => totalIncome[i] - totalExpenses[i]);

  const csvData = rows.map((r) => {
    const obj: Record<string, string> = {
      name: r.name,
      type: r.type,
      subtype: r.subtype,
    };
    periods.forEach((p, idx) => {
      obj[`period_${idx}`] = (r.amountsMinor[idx] / 100).toFixed(2);
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
    ...periods.map((p, idx) => ({ header: p.label, accessorKey: `period_${idx}` })),
    ...(showVariance
      ? [
          { header: "Variance", accessorKey: "variance" },
          { header: "Variance %", accessorKey: "variance_pct" },
        ]
      : []),
  ];

  function renderVarianceCells(amounts: number[]) {
    if (!showVariance) return null;
    const { varianceMinor, variancePercent } = computeVariance(amounts[0], amounts[1]);
    return (
      <>
        <td
          className={`money text-right ${
            varianceMinor !== null && varianceMinor < 0 ? "text-danger" : "text-muted-foreground"
          }`}
        >
          {varianceMinor !== null ? formatMoney(varianceMinor, access.business.currency) : "—"}
        </td>
        <td className="money text-right text-muted-foreground">
          {variancePercent !== null ? `${variancePercent > 0 ? "+" : ""}${variancePercent}%` : "—"}
        </td>
      </>
    );
  }

  function renderGroup(title: string, data: ComparativePnlRow[], totals: number[]) {
    if (data.length === 0) return null;
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
            {periods.map((p, idx) => (
              <td key={`${row.id}-${idx}`} className="money py-2 text-right">
                {row.amountsMinor[idx] !== 0 ? (
                  <ReportDrilldownButton
                    businessId={businessId}
                    currency={access.business.currency}
                    label={formatMoney(row.amountsMinor[idx], access.business.currency)}
                    query={{
                      kind: basis === "cash" ? "cash_pnl" : "account",
                      accountId: row.id,
                      dateFrom: p.dateFrom,
                      dateTo: p.dateTo,
                    }}
                    title={`Drill down into ${row.name} (${p.label})`}
                  />
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </td>
            ))}
            {renderVarianceCells(row.amountsMinor)}
          </tr>
        ))}
        <tr>
          <td className="pl-6 pt-2 pb-2 font-medium">Total {title}</td>
          {totals.map((val, idx) => (
            <td key={idx} className="money border-t border-border pt-2 pb-2 text-right font-medium">
              {formatMoney(val, access.business.currency)}
            </td>
          ))}
          {showVariance && renderVarianceCells(totals)}
        </tr>
        <tr>
          <td colSpan={totalCols} className="h-3"></td>
        </tr>
      </>
    );
  }

  const hasIncome = totalIncome.some((v) => v !== 0);
  const hasCogs = totalCostOfSales.some((v) => v !== 0);

  return (
    <div className="page-container max-w-6xl">
      <BackLink href={`/b/${businessId}/reports`}>Reports</BackLink>

      <div className="page-header flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="page-title">Profit &amp; Loss</h1>
          <p className="page-description">
            Income vs expenses with comparative periods and click-to-drill-down ledger inspection.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SavedReportToolbar
            businessId={businessId}
            reportType="profit_loss"
            currentConfig={{
              dateFrom: filters.dateFrom ?? "",
              dateTo: filters.dateTo ?? "",
              basis,
              compareMode,
              compareDateFrom: filters.compareDateFrom ?? "",
              compareDateTo: filters.compareDateTo ?? "",
            }}
            savedViews={savedViews}
            activeViewId={filters.viewId}
            basePath={`/b/${businessId}/reports/profit-loss`}
          />
          <ExportCsvButton
            filename={`profit-loss-${new Date().toISOString().slice(0, 10)}.csv`}
            columns={csvColumns}
            data={csvData}
          />
        </div>
      </div>

      <ProfitLossFilterForm
        key={`${filters.dateFrom ?? ""}|${filters.dateTo ?? ""}|${basis}|${compareMode}|${filters.compareDateFrom ?? ""}|${filters.compareDateTo ?? ""}|${filters.viewId ?? ""}`}
        dateFrom={filters.dateFrom}
        dateTo={filters.dateTo}
        basis={basis}
        compareMode={compareMode}
        compareDateFrom={filters.compareDateFrom}
        compareDateTo={filters.compareDateTo}
      />

      <div className="data-panel overflow-x-auto p-6">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
              <th className="pb-3 text-left font-semibold">Account</th>
              {periods.map((p, idx) => (
                <th key={idx} className="pb-3 text-right font-semibold">
                  {p.label}
                </th>
              ))}
              {showVariance && (
                <>
                  <th className="pb-3 text-right font-semibold">Variance</th>
                  <th className="pb-3 text-right font-semibold">Var %</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {renderGroup("Sales", sales, totalSales)}
            {renderGroup("Other Income", otherIncome, totalOtherIncome)}

            {hasIncome && (
              <tr>
                <td className="pb-4 pt-2 text-base font-semibold">Total Income</td>
                {totalIncome.map((val, idx) => (
                  <td key={idx} className="money border-b-2 border-border pb-4 pt-2 text-right text-base font-semibold">
                    {formatMoney(val, access.business.currency)}
                  </td>
                ))}
                {showVariance && renderVarianceCells(totalIncome)}
              </tr>
            )}

            {renderGroup("Cost of Sales", costOfSales, totalCostOfSales)}

            {hasCogs && (
              <tr>
                <td className="pb-4 pt-2 text-base font-semibold">Gross Profit</td>
                {grossProfit.map((val, idx) => (
                  <td key={idx} className="money border-b border-border pb-4 pt-2 text-right text-base font-semibold">
                    {formatMoney(val, access.business.currency)}
                  </td>
                ))}
                {showVariance && renderVarianceCells(grossProfit)}
              </tr>
            )}

            {renderGroup("Operating Expenses", operatingExpenses, totalOperating)}
            {renderGroup("Other Expenses", otherExpenses, totalOtherExpenses)}

            <tr>
              <td className="pt-6 text-lg font-bold">Net Profit / (Loss)</td>
              {netProfit.map((val, idx) => (
                <td key={idx} className="money border-t-2 border-border pt-6 text-right text-lg font-bold">
                  {formatMoney(val, access.business.currency)}
                </td>
              ))}
              {showVariance && renderVarianceCells(netProfit)}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
