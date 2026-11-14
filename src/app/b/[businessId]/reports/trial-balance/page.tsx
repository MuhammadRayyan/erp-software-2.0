import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requireModule } from "@/core/permissions/require-module";
import { formatMoney } from "@/core/format";
import { getTrialBalance } from "@/modules/reports/report-service";
import { listSavedReports } from "@/modules/reports/saved-report-service";
import { BackLink } from "@/components/back-link";
import { ReportDrilldownButton } from "@/components/reports/report-drilldown-button";
import { SavedReportToolbar } from "@/components/reports/saved-report-toolbar";

export default async function TrialBalancePage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ throughDate?: string; viewId?: string }>;
}) {
  const { businessId } = await params;
  const query = await searchParams;
  const { user, access } = await requireModule(businessId, "reports");
  const throughDate = query.throughDate ?? new Date().toISOString().slice(0, 10);
  const report = getTrialBalance(businessId, user.id, throughDate);
  const savedViews = listSavedReports(businessId, user.id, "trial_balance");
  const balanced = report.debitMinor === report.creditMinor;

  return (
    <div className="page-container">
      <BackLink href={`/b/${businessId}/reports`}>Reports</BackLink>
      <div className="page-header flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="page-title">Trial Balance</h1>
            <Badge tone={balanced ? "success" : "danger"}>
              {balanced ? "Balanced" : "Out of balance"}
            </Badge>
          </div>
          <p className="page-description">
            Net account balances from all posted entries through the selected date. Click any balance to drill down.
          </p>
        </div>
        <SavedReportToolbar
          businessId={businessId}
          reportType="trial_balance"
          currentConfig={{ throughDate }}
          savedViews={savedViews}
          activeViewId={query.viewId}
          basePath={`/b/${businessId}/reports/trial-balance`}
        />
      </div>
      <form className="mb-3 flex flex-wrap items-end gap-3">
        <label className="space-y-1 text-xs text-muted-foreground">
          Through date
          <Input name="throughDate" type="date" defaultValue={throughDate} className="mt-1 w-44 text-foreground" />
        </label>
        <Button type="submit" variant="secondary">Apply</Button>
      </form>
      <div className="data-panel overflow-x-auto">
        <table className="data-table min-w-[620px]">
          <thead>
            <tr>
              <th>Account</th>
              <th>Type</th>
              <th className="text-right!">Debit</th>
              <th className="text-right!">Credit</th>
            </tr>
          </thead>
          <tbody>
            {report.accounts.map((account) => (
              <tr key={account.id}>
                <td>
                  <Link
                    href={`/b/${businessId}/accounting/chart-of-accounts/${account.id}`}
                    className="font-medium text-foreground hover:underline"
                  >
                    {account.name}
                  </Link>
                </td>
                <td className="capitalize text-muted-foreground">{account.type}</td>
                <td className="money text-right">
                  {account.debitMinor ? (
                    <ReportDrilldownButton
                      businessId={businessId}
                      currency={access.business.currency}
                      label={formatMoney(account.debitMinor, access.business.currency)}
                      query={{ kind: "account", accountId: account.id, dateTo: throughDate }}
                    />
                  ) : (
                    "—"
                  )}
                </td>
                <td className="money text-right">
                  {account.creditMinor ? (
                    <ReportDrilldownButton
                      businessId={businessId}
                      currency={access.business.currency}
                      label={formatMoney(account.creditMinor, access.business.currency)}
                      query={{ kind: "account", accountId: account.id, dateTo: throughDate }}
                    />
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-border-strong bg-surface font-semibold">
              <td colSpan={2} className="h-11 px-3">Total</td>
              <td className="money h-11 px-3 text-right">{formatMoney(report.debitMinor, access.business.currency)}</td>
              <td className="money h-11 px-3 text-right">{formatMoney(report.creditMinor, access.business.currency)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
