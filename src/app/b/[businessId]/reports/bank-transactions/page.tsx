import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate, formatMoney } from "@/core/format";
import { requireModule } from "@/core/permissions/require-module";
import { journalSourceHref, journalSourceLabel } from "@/modules/accounting/journal-source";
import { listBankAccounts } from "@/modules/banking/bank-account-service";
import { getAllBankTransactionsReport } from "@/modules/banking/banking-report-service";
import { SelectNative } from "@/components/ui/select-native";
import { BackLink } from "@/components/back-link";
import { parsePageParam, parsePageSizeParam } from "@/lib/params";
import { ListPagination } from "@/components/list-pagination";
import { ExportCsvButton } from "@/components/export-csv-button";

export const metadata = { title: "Bank Transactions Report" };

export default async function BankTransactionsReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{
    dateFrom?: string;
    dateTo?: string;
    bankAccountId?: string;
    sourceType?: string;
    reconciled?: "yes" | "no";
    page?: string;
    pageSize?: string;
  }>;
}) {
  const { businessId } = await params;
  const filters = await searchParams;
  const { user, access } = await requireModule(businessId, "reports");
  await requireModule(businessId, "banking");

  const accounts = listBankAccounts(businessId, user.id);
  const allRows = getAllBankTransactionsReport(businessId, user.id, filters);

  const page = parsePageParam(filters.page) ?? 1;
  const pageSize = parsePageSizeParam(filters.pageSize, 100);
  const total = allRows.length;
  const maxPage = Math.max(1, Math.ceil(total / pageSize));
  const effectivePage = Math.min(page, maxPage);
  
  const rows = allRows.slice((effectivePage - 1) * pageSize, effectivePage * pageSize);

  const csvData = allRows.map((r: any) => ({
    bank_account_name: r.bank_account_name,
    date: r.date,
    source: journalSourceLabel(r.source_type),
    reference: r.reference || r.entry_number || "",
    description: r.description || "",
    money_in: (r.money_in_minor / 100).toFixed(2),
    money_out: (r.money_out_minor / 100).toFixed(2),
    balance: (r.balance_minor / 100).toFixed(2),
    reconciled: r.reconciled ? "Yes" : "No",
  }));

  const csvColumns = [
    { header: "Account", accessorKey: "bank_account_name" },
    { header: "Date", accessorKey: "date" },
    { header: "Source", accessorKey: "source" },
    { header: "Reference", accessorKey: "reference" },
    { header: "Description", accessorKey: "description" },
    { header: "Money In", accessorKey: "money_in" },
    { header: "Money Out", accessorKey: "money_out" },
    { header: "Balance", accessorKey: "balance" },
    { header: "Reconciled", accessorKey: "reconciled" },
  ];

  return (
    <div className="page-container">
      <BackLink href={`/b/${businessId}/reports`}>Reports</BackLink>
      
      <div className="page-header flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="page-title">Bank Transactions</h1>
          <p className="page-description">
            Mapped-GL activity across Receipts, Supplier Payments, Bank Transactions, Transfers, and reversals.
          </p>
        </div>
        <ExportCsvButton 
          filename={`bank-transactions-${new Date().toISOString().slice(0, 10)}.csv`} 
          columns={csvColumns} 
          data={csvData} 
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
          <SelectNative name="bankAccountId" defaultValue={filters.bankAccountId ?? ""} className="mt-1 block min-w-48 text-foreground">
            <option value="">All accounts</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </SelectNative>
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">
          Source
          <SelectNative name="sourceType" defaultValue={filters.sourceType ?? ""} className="mt-1 block min-w-44 text-foreground">
            <option value="">All sources</option>
            <option value="receipt">Receipts</option>
            <option value="supplier_payment">Supplier Payments</option>
            <option value="bank_transaction">Bank Transactions</option>
            <option value="bank_transfer">Transfers</option>
          </SelectNative>
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">
          Reconciled
          <SelectNative name="reconciled" defaultValue={filters.reconciled ?? ""} className="mt-1 block min-w-36 text-foreground">
            <option value="">All</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </SelectNative>
        </label>
        <Button type="submit" variant="secondary">Apply</Button>
      </form>

      {total > 0 ? (
        <div className="data-panel">
          <div className="overflow-x-auto">
            <table className="data-table min-w-[1080px]">
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Date</th>
                  <th>Source</th>
                  <th>Reference</th>
                  <th>Description</th>
                  <th className="text-right!">Money In</th>
                  <th className="text-right!">Money Out</th>
                  <th className="text-right!">Balance</th>
                  <th>Reconciled</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const href = journalSourceHref(businessId, row.source_type, row.source_id);
                  return (
                    <tr key={`${row.bank_account_id}-${row.journal_entry_id}`}>
                      <td>
                        <Link href={`/b/${businessId}/banking/accounts/${row.bank_account_id}`} className="font-medium text-primary hover:underline">
                          {row.bank_account_name}
                        </Link>
                      </td>
                      <td>{formatDate(row.date)}</td>
                      <td>
                        {href ? (
                          <Link href={href} className="text-primary hover:underline">{journalSourceLabel(row.source_type)}</Link>
                        ) : (
                          journalSourceLabel(row.source_type)
                        )}
                      </td>
                      <td className="tabular text-muted-foreground">{row.reference || row.entry_number}</td>
                      <td className="max-w-64 truncate">{row.description}</td>
                      <td className="money text-right">{row.money_in_minor ? formatMoney(row.money_in_minor, access.business.currency) : "—"}</td>
                      <td className="money text-right">{row.money_out_minor ? formatMoney(row.money_out_minor, access.business.currency) : "—"}</td>
                      <td className="money text-right">{formatMoney(row.balance_minor, access.business.currency)}</td>
                      <td>{row.reconciled ? "Yes" : "No"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {total > pageSize && (
            <ListPagination pathname={`/b/${businessId}/reports/bank-transactions`} searchParams={new URLSearchParams(filters as any)} info={{ page: effectivePage, pageSize, total, totalPages: maxPage }} />
          )}
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-surface py-10 text-center">
          <p className="font-medium">No bank activity for these filters</p>
          <p className="mt-1 text-sm text-muted-foreground">Adjust the account, date, source, or reconciliation filter.</p>
        </div>
      )}
    </div>
  );
}
