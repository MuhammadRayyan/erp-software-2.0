import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requireModule } from "@/core/permissions/require-module";
import { formatDate, formatMoney } from "@/core/format";
import { listAccounts } from "@/modules/accounting/services/account-service";
import { journalSourceHref, journalSourceLabel } from "@/modules/accounting/journal-source";
import { listCustomers } from "@/modules/customers/customer-service";
import { getGeneralLedger } from "@/modules/reports/report-service";
import { listSavedReports } from "@/modules/reports/saved-report-service";
import { SelectNative } from "@/components/ui/select-native";
import { BackLink } from "@/components/back-link";
import { SavedReportToolbar } from "@/components/reports/saved-report-toolbar";

export default async function GeneralLedgerPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{
    dateFrom?: string;
    dateTo?: string;
    accountId?: string;
    customerId?: string;
    viewId?: string;
  }>;
}) {
  const { businessId } = await params;
  const filters = await searchParams;
  const { user, access } = await requireModule(businessId, "reports");
  const accounts = listAccounts(businessId, user.id);
  const customers = listCustomers(businessId, user.id);
  const rows = getGeneralLedger(businessId, user.id, filters);
  const savedViews = listSavedReports(businessId, user.id, "general_ledger");

  return (
    <div className="page-container">
      <BackLink href={`/b/${businessId}/reports`}>Reports</BackLink>
      <div className="page-header flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="page-title">General Ledger</h1>
          <p className="page-description">
            Posted journal lines with natural running balances and direct source voucher links.
          </p>
        </div>
        <SavedReportToolbar
          businessId={businessId}
          reportType="general_ledger"
          currentConfig={{
            dateFrom: filters.dateFrom ?? "",
            dateTo: filters.dateTo ?? "",
            accountId: filters.accountId ?? "",
            customerId: filters.customerId ?? "",
          }}
          savedViews={savedViews}
          activeViewId={filters.viewId}
          basePath={`/b/${businessId}/reports/general-ledger`}
        />
      </div>
      <form className="mb-3 flex flex-wrap items-end gap-3">
        <label className="space-y-1 text-xs text-muted-foreground">
          Date from
          <Input name="dateFrom" type="date" defaultValue={filters.dateFrom} className="mt-1 w-40 text-foreground" />
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">
          Date to
          <Input name="dateTo" type="date" defaultValue={filters.dateTo} className="mt-1 w-40 text-foreground" />
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">
          Account
          <SelectNative name="accountId" defaultValue={filters.accountId ?? ""} className="mt-1 block min-w-52 text-foreground">
            <option value="">All accounts</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>{account.name}</option>
            ))}
          </SelectNative>
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">
          Customer
          <SelectNative name="customerId" defaultValue={filters.customerId ?? ""} className="mt-1 block min-w-48 text-foreground">
            <option value="">All customers</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>{customer.name}</option>
            ))}
          </SelectNative>
        </label>
        <Button type="submit" variant="secondary">Apply</Button>
      </form>
      {rows.length ? (
        <div className="data-panel overflow-x-auto">
          <table className="data-table min-w-[1050px]">
            <thead>
              <tr>
                <th>Account</th>
                <th>Date</th>
                <th>Entry</th>
                <th>Source Voucher</th>
                <th>Description</th>
                <th className="text-right!">Debit</th>
                <th className="text-right!">Credit</th>
                <th className="text-right!">Balance</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const voucherHref = journalSourceHref(businessId, row.source_type, row.source_id);
                return (
                  <tr key={`${row.journal_entry_id}-${row.position}`}>
                    <td><span className="font-medium">{row.account_name}</span></td>
                    <td>{formatDate(row.date)}</td>
                    <td>
                      <Link
                        href={`/b/${businessId}/accounting/journal/${row.journal_entry_id}`}
                        className="tabular font-medium text-primary hover:underline"
                      >
                        {row.entry_number}
                      </Link>
                    </td>
                    <td>
                      {voucherHref ? (
                        <Link
                          href={voucherHref}
                          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                        >
                          {journalSourceLabel(row.source_type)}
                          <ArrowUpRight className="size-3" />
                        </Link>
                      ) : (
                        journalSourceLabel(row.source_type)
                      )}
                    </td>
                    <td className="max-w-[300px] truncate text-muted-foreground">{row.description}</td>
                    <td className="money text-right">
                      {row.debit_minor ? formatMoney(row.debit_minor, access.business.currency) : "—"}
                    </td>
                    <td className="money text-right">
                      {row.credit_minor ? formatMoney(row.credit_minor, access.business.currency) : "—"}
                    </td>
                    <td className="money text-right font-medium">
                      {formatMoney(row.balanceMinor, access.business.currency)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-surface py-10 text-center">
          <p className="font-medium">No ledger activity for these filters</p>
          <p className="mt-1 text-sm text-muted-foreground">Adjust the date, account, or customer selection.</p>
        </div>
      )}
    </div>
  );
}
