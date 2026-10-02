import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatMoney } from "@/core/format";
import { requireModule } from "@/core/permissions/require-module";
import { getTrialBalance } from "@/modules/reports/report-service";
import { BackLink } from "@/components/back-link";
import { ExportCsvButton } from "@/components/export-csv-button";

export const metadata = { title: "Balance Sheet Report" };

export default async function BalanceSheetReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ throughDate?: string }>;
}) {
  const { businessId } = await params;
  const filters = await searchParams;
  const { user, access } = await requireModule(businessId, "reports");

  const tb = getTrialBalance(businessId, user.id, filters.throughDate);
  const rows = tb.accounts as any[];

  // Group by type and subtype
  const assets = rows.filter((r) => r.type === "asset");
  const liabilities = rows.filter((r) => r.type === "liability");
  const equity = rows.filter((r) => r.type === "equity");

  const sumBalance = (arr: typeof rows, normalBalance: "debit" | "credit") =>
    arr.reduce((acc, r) => {
      const net = normalBalance === "debit" 
        ? r.debit_total - r.credit_total 
        : r.credit_total - r.debit_total;
      return acc + net;
    }, 0);

  const totalAssets = sumBalance(assets, "debit");
  const totalLiabilities = sumBalance(liabilities, "credit");
  
  // Equity needs to include retained earnings (net profit) from income/expenses
  const incomeRows = rows.filter((r) => r.type === "income");
  const expenseRows = rows.filter((r) => r.type === "expense");
  const netIncome = sumBalance(incomeRows, "credit") - sumBalance(expenseRows, "debit");
  
  const totalEquity = sumBalance(equity, "credit") + netIncome;

  const totalLiabilitiesAndEquity = totalLiabilities + totalEquity;

  const csvColumns = [
    { header: "Account", accessorFn: (r: any) => r.name },
    { header: "Type", accessorFn: (r: any) => r.type },
    { header: "Subtype", accessorFn: (r: any) => r.subtype },
    { header: "Net Amount", accessorFn: (r: any) => {
      const normalBalance = (r.type === "asset" || r.type === "expense") ? "debit" : "credit";
      const net = normalBalance === "debit" ? r.debit_total - r.credit_total : r.credit_total - r.debit_total;
      return (net / 100).toFixed(2);
    }},
  ];

  function renderGroup(title: string, data: typeof rows, normalBalance: "debit" | "credit", total: number) {
    if (data.length === 0 && title !== "Equity") return null;
    return (
      <>
        <tr>
          <td colSpan={2} className="bg-surface-muted py-2 font-semibold text-foreground">
            {title}
          </td>
        </tr>
        {data.map((row) => {
          const net = normalBalance === "debit" ? row.debit_total - row.credit_total : row.credit_total - row.debit_total;
          if (net === 0) return null;
          return (
            <tr key={row.id}>
              <td className="pl-6">
                <Link href={`/b/${businessId}/accounting/chart-of-accounts/${row.id}`} className="hover:underline">
                  {row.name}
                </Link>
              </td>
              <td className="money text-right">{formatMoney(net, access.business.currency)}</td>
            </tr>
          );
        })}
        {title === "Equity" && netIncome !== 0 && (
          <tr>
            <td className="pl-6">
              <span className="text-muted-foreground">Retained Earnings (Current Period)</span>
            </td>
            <td className="money text-right">{formatMoney(netIncome, access.business.currency)}</td>
          </tr>
        )}
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
          <h1 className="page-title">Balance Sheet</h1>
          <p className="page-description">
            Snapshot of Assets, Liabilities, and Equity as of the selected date.
          </p>
        </div>
        <ExportCsvButton 
          filename={`balance-sheet-${new Date().toISOString().slice(0, 10)}.csv`} 
          columns={csvColumns} 
          data={rows.filter(r => r.type === "asset" || r.type === "liability" || r.type === "equity" || r.debit_total > 0 || r.credit_total > 0)} 
        />
      </div>

      <form className="mb-6 flex flex-wrap items-end gap-3">
        <label className="space-y-1 text-xs text-muted-foreground">
          As of date
          <Input name="throughDate" type="date" defaultValue={filters.throughDate} className="mt-1 w-40 text-foreground" />
        </label>
        <Button type="submit" variant="secondary">Update</Button>
      </form>

      <div className="data-panel p-6">
        <table className="w-full text-sm">
          <tbody>
            {renderGroup("Assets", assets, "debit", totalAssets)}
            
            {renderGroup("Liabilities", liabilities, "credit", totalLiabilities)}
            
            {renderGroup("Equity", equity, "credit", totalEquity)}

            <tr>
              <td className="pt-6 text-lg font-bold">Total Assets</td>
              <td className="money border-t-2 border-border pt-6 text-right text-lg font-bold">
                {formatMoney(totalAssets, access.business.currency)}
              </td>
            </tr>
            <tr>
              <td className="pt-2 text-lg font-bold">Total Liabilities & Equity</td>
              <td className="money pt-2 text-right text-lg font-bold">
                {formatMoney(totalLiabilitiesAndEquity, access.business.currency)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
