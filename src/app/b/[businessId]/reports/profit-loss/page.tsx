import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatMoney } from "@/core/format";
import { requireModule } from "@/core/permissions/require-module";
import { getProfitAndLoss } from "@/modules/reports/report-service";
import { BackLink } from "@/components/back-link";
import { ExportCsvButton } from "@/components/export-csv-button";

export const metadata = { title: "Profit & Loss Report" };

export default async function ProfitAndLossReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ dateFrom?: string; dateTo?: string; basis?: "accrual" | "cash" }>;
}) {
  const { businessId } = await params;
  const filters = await searchParams;
  const basis = filters.basis === "cash" ? "cash" : "accrual";
  const { user, access } = await requireModule(businessId, "reports");

  const rows = getProfitAndLoss(businessId, user.id, filters.dateFrom, filters.dateTo, basis);

  // Group by subtype
  const sales = rows.filter((r) => r.type === "income" && r.subtype === "sales");
  const otherIncome = rows.filter((r) => r.type === "income" && r.subtype === "other_income");
  const costOfSales = rows.filter((r) => r.type === "expense" && r.subtype === "cost_of_sales");
  const operatingExpenses = rows.filter((r) => r.type === "expense" && r.subtype === "operating");
  const otherExpenses = rows.filter((r) => r.type === "expense" && r.subtype === "other_expense");

  const sumNet = (arr: typeof rows) => arr.reduce((acc, r) => acc + r.net_minor, 0);

  const totalSales = sumNet(sales);
  const totalOtherIncome = sumNet(otherIncome);
  const totalIncome = totalSales + totalOtherIncome;

  const totalCostOfSales = sumNet(costOfSales);
  const grossProfit = totalIncome - totalCostOfSales;

  const totalOperating = sumNet(operatingExpenses);
  const totalOtherExpenses = sumNet(otherExpenses);
  const totalExpenses = totalCostOfSales + totalOperating + totalOtherExpenses;

  const netProfit = totalIncome - totalExpenses;

  const csvData = rows.map((r) => ({
    name: r.name,
    type: r.type,
    subtype: r.subtype,
    net_amount: (r.net_minor / 100).toFixed(2),
  }));

  const csvColumns = [
    { header: "Account", accessorKey: "name" },
    { header: "Type", accessorKey: "type" },
    { header: "Subtype", accessorKey: "subtype" },
    { header: "Net Amount", accessorKey: "net_amount" },
  ];

  function renderGroup(title: string, data: typeof rows, total: number) {
    if (data.length === 0) return null;
    return (
      <>
        <tr>
          <td colSpan={2} className="bg-surface-muted py-2 font-semibold text-foreground">
            {title}
          </td>
        </tr>
        {data.map((row) => (
          <tr key={row.id}>
            <td className="pl-6">
              <Link href={`/b/${businessId}/accounting/chart-of-accounts/${row.id}`} className="hover:underline">
                {row.name}
              </Link>
            </td>
            <td className="money text-right">
              <Link
                href={`/b/${businessId}/reports/general-ledger?accountId=${row.id}&dateFrom=${filters.dateFrom || ""}&dateTo=${filters.dateTo || ""}`}
                className="tabular font-medium text-primary hover:underline"
                title={`View General Ledger for ${row.name}`}
              >
                {formatMoney(row.net_minor, access.business.currency)}
              </Link>
            </td>
          </tr>
        ))}
        <tr>
          <td className="pl-6 pt-2 font-medium">Total {title}</td>
          <td className="money border-t border-border pt-2 text-right font-medium">
            {formatMoney(total, access.business.currency)}
          </td>
        </tr>
        <tr>
          <td colSpan={2} className="h-4"></td>
        </tr>
      </>
    );
  }

  return (
    <div className="page-container max-w-4xl">
      <BackLink href={`/b/${businessId}/reports`}>Reports</BackLink>
      
      <div className="page-header flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="page-title">Profit & Loss</h1>
          <p className="page-description">
            Income vs expenses for the selected period.
          </p>
        </div>
        <ExportCsvButton 
          filename={`profit-loss-${new Date().toISOString().slice(0, 10)}.csv`} 
          columns={csvColumns} 
          data={csvData} 
        />
      </div>

      <form className="mb-6 flex flex-wrap items-end gap-3">
        <label className="space-y-1 text-xs text-muted-foreground">
          From
          <Input name="dateFrom" type="date" defaultValue={filters.dateFrom} className="mt-1 w-40 text-foreground" />
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">
          To
          <Input name="dateTo" type="date" defaultValue={filters.dateTo} className="mt-1 w-40 text-foreground" />
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">
          Accounting Basis
          <select
            name="basis"
            defaultValue={basis}
            className="mt-1 flex h-9 w-36 rounded-md border border-input bg-surface px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="accrual">Accrual Basis</option>
            <option value="cash">Cash Basis</option>
          </select>
        </label>
        <Button type="submit" variant="secondary">Update</Button>
        <span className="ml-auto hidden text-xs text-muted-foreground self-center lg:inline">
          {basis === "cash" ? "Cash basis: recognized upon payment" : "Accrual basis: recognized when issued"}
        </span>
      </form>

      <div className="data-panel p-6">
        <table className="w-full text-sm">
          <tbody>
            {renderGroup("Sales", sales, totalSales)}
            {renderGroup("Other Income", otherIncome, totalOtherIncome)}
            
            {totalIncome !== 0 && (
              <tr>
                <td className="pb-4 pt-2 text-base font-semibold">Total Income</td>
                <td className="money border-b-2 border-border pb-4 pt-2 text-right text-base font-semibold">
                  {formatMoney(totalIncome, access.business.currency)}
                </td>
              </tr>
            )}
            
            {renderGroup("Cost of Sales", costOfSales, totalCostOfSales)}
            
            {totalCostOfSales !== 0 && (
              <tr>
                <td className="pb-4 pt-2 text-base font-semibold">Gross Profit</td>
                <td className="money border-b border-border pb-4 pt-2 text-right text-base font-semibold">
                  {formatMoney(grossProfit, access.business.currency)}
                </td>
              </tr>
            )}

            {renderGroup("Operating Expenses", operatingExpenses, totalOperating)}
            {renderGroup("Other Expenses", otherExpenses, totalOtherExpenses)}

            <tr>
              <td className="pt-6 text-lg font-bold">Net Profit / (Loss)</td>
              <td className="money border-t-2 border-border pt-6 text-right text-lg font-bold">
                {formatMoney(netProfit, access.business.currency)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
